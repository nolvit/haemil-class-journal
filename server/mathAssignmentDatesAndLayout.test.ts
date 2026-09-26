import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import allowedManifest from "../shared/autoGradeAllowlist.json";

const { connection, pool, family, state } = vi.hoisted(() => ({
  connection: {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn(),
  },
  pool: { query: vi.fn(), getConnection: vi.fn() },
  family: vi.fn(),
  state: { assignment: {} as Record<string, unknown>, items: [] as any[], attempts: [] as any[], existing: [] as any[] },
}));

vi.mock("mysql2/promise", () => ({ default: { createPool: () => pool } }));
vi.mock("./db", () => ({ getPortalFamilyByToken: family }));

import {
  beginMathOcrRequest, getAdminMathAssignment, getIssuedMathAssignment, getPublicMathAssignment,
  issueMathAssignment, listAdminMathAssignments, listPublicMathAssignments, submitMathAssignment,
} from "./mathAssignmentStore";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBilling = process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID;
const assignmentId = "550e8400-e29b-41d4-a716-446655440000";
const storedTime = "2026-09-26 18:15:00";
const isoTime = "2026-09-26T18:15:00.000Z";
const scope = { token: "family-token", studentId: 7, assignmentId, code: "TESTSHEET" };
const photo = { pageNumber: 2, imageDataUrl: "data:image/jpeg;base64,/9j/" };
const issueInput = {
  sourceBasketId: "basket", studentId: 7, idempotencyKey: "issue-key",
  questions: [{ questionId: allowedManifest.questionIds[0], order: 1, answerType: "numeric" as const,
    answerKey: "1", gradingRule: "value" as const }],
};

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost/test";
  process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID = "billing-test";
  state.assignment = { id: assignmentId, code: scope.code, studentId: 7, title: "Test",
    status: "open", retryGrants: 0, createdAt: storedTime, answerSheetVersion: 3 };
  state.items = Array.from({ length: 40 }, (_, index) => ({ ordinal: index + 1,
    questionId: String(index + 1), answerType: "numeric", answerKey: "1", gradingRule: "value" }));
  state.attempts = [];
  state.existing = [];
  family.mockReset().mockResolvedValue([{ id: 7 }]);
  for (const mock of Object.values(connection)) mock.mockReset();
  pool.getConnection.mockReset().mockResolvedValue(connection);
  const query = async (sql: string, values: any[] = []) => {
    if (sql.startsWith("SHOW")) return [[{ Field: "answerSheetVersion" }]];
    if (sql.startsWith("SELECT createdAt")) return [[{ createdAt: storedTime }]];
    if (sql.startsWith("SELECT submittedAt")) return [[{ submittedAt: storedTime }]];
    if (sql.startsWith("SELECT id,code,requestHash")) return [state.existing];
    if (sql.startsWith("SELECT active,portalEnabled")) return [[{ active: 1, portalEnabled: 1 }]];
    if (sql.includes("FROM math_assignment_items")) return [state.items];
    if (sql.includes("FROM math_assignment_attempts"))
      return [sql.includes("COUNT(") ? [{ count: state.attempts.length }] : state.attempts];
    if (sql.includes("FROM math_assignments")) return [[{ ...state.assignment,
      questionCount: state.items.length, attemptCount: state.attempts.length }]];
    if (sql.includes("SELECT id,status,response FROM math_ocr_requests"))
      return [[{ status: "complete", response: JSON.stringify({ answers: [] }) }]];
    if (sql.startsWith("INSERT INTO math_assignments(")) {
      state.assignment.answerSheetVersion = values[7];
      state.existing = [{ id: values[0], code: values[1], requestHash: values[5], createdAt: storedTime }];
    }
    if (sql.startsWith("INSERT INTO math_assignment_attempts("))
      state.attempts.push({ id: values[0], attemptNumber: values[2], answers: values[3], results: values[4],
        photoPages: values[5], score: values[6], total: values[7], submittedAt: storedTime });
    return [{ affectedRows: 1 }];
  };
  pool.query.mockReset().mockImplementation(query);
  connection.query.mockImplementation(query);
});

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalBilling === undefined) delete process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID;
  else process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID = originalBilling;
});

describe("assignment dates and sheet versions at the database boundary", () => {
  it("returns the same stored instant for the immediate grade and parent/admin history", async () => {
    const result = await submitMathAssignment({ ...scope, answers: [{ ordinal: 1, value: "1" }] });
    const parent = await getPublicMathAssignment(scope.token, 7, assignmentId);
    const admin = await getAdminMathAssignment(assignmentId);
    expect(result.submittedAt).toBe(isoTime);
    expect(parent.attempts[0].submittedAt).toBe(isoTime);
    expect(admin.assignment.attempts[0].submittedAt).toBe(isoTime);
    expect(parent.createdAt).toBe(isoTime);
    expect((await listPublicMathAssignments(scope.token, 7)).assignments[0].createdAt).toBe(isoTime);
    expect((await listAdminMathAssignments()).assignments[0].createdAt).toBe(isoTime);
  });

  it("keeps omitted and explicit v3 issue requests idempotent and normalizes creation time", async () => {
    const first = await issueMathAssignment(issueInput);
    const repeated = await issueMathAssignment({ ...issueInput, answerSheetVersion: 3 });
    expect(first.createdAt).toBe(isoTime);
    expect(repeated).toMatchObject({ assignmentId: first.assignmentId, createdAt: isoTime, alreadyExisted: true });
    expect((await getIssuedMathAssignment(first.assignmentId))?.answerSheetVersion).toBe(3);
    expect((await getPublicMathAssignment(scope.token, 7, assignmentId)).answerSheetVersion).toBe(3);
  });

  it("persists v4 and rejects changing a prior issue key to another sheet version", async () => {
    const first = await issueMathAssignment({ ...issueInput, answerSheetVersion: 4 });
    expect((await getIssuedMathAssignment(first.assignmentId))?.answerSheetVersion).toBe(4);
    await expect(issueMathAssignment(issueInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts page two photos for 40-question v4 assignments", async () => {
    state.assignment.answerSheetVersion = 4;
    await expect(submitMathAssignment({ ...scope, answers: [], photos: [photo] })).resolves.toMatchObject({ submittedAt: isoTime });
  });

  it("rejects page two photos for the same 40 questions on a v3 sheet", async () => {
    await expect(submitMathAssignment({ ...scope, answers: [], photos: [photo] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.attempts).toHaveLength(0);
  });

  it.each([{ version: 3, page: 1 }, { version: 4, page: 2 }])(
    "checks question 21 against v$version page $page before reusing OCR", async ({ version, page }) => {
      state.assignment.answerSheetVersion = version;
      const input = { ...scope, pageNumber: page, imageHash: "hash",
        regions: [{ ordinal: 21, x: 0, y: 0, width: 100, height: 100 }] };
      await expect(beginMathOcrRequest(input)).resolves.toMatchObject({ cached: true });
      await expect(beginMathOcrRequest({ ...input, pageNumber: page === 1 ? 2 : 1 }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
    },
  );
});
