import { beforeEach, expect, it, vi } from "vitest";
import { examSchools, schoolExams } from "../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { updateSchoolExam } from "./schoolExamsStore";

const details = {
  id: 7, schoolName: "원일중", grade: "중2", academicYear: 2026,
  semester: 2, examType: "중간고사", title: "2학기 중간고사",
};

function mockDatabase(duplicateId?: number) {
  const updated: Array<Record<string, unknown>> = [];
  let examReads = 0;
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = table === examSchools ? [{ id: 3 }] :
            ++examReads === 1 ? [{ id: 7 }] : duplicateId ? [{ id: duplicateId }] : [{ id: 7 }];
          return {
            limit: async () => rows.slice(0, 1),
            then: (resolve: (value: typeof rows) => void, reject: (reason: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject),
          };
        },
      }),
    }),
    insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => undefined }) }),
    update: (table: unknown) => {
      expect(table).toBe(schoolExams);
      return { set: (values: Record<string, unknown>) => ({ where: async () => { updated.push(values); } }) };
    },
    delete: () => { throw new Error("Updating an exam must not delete its subjects or results."); },
  };
  getDbMock.mockResolvedValue({
    execute: async () => undefined,
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  });
  return updated;
}

beforeEach(() => getDbMock.mockReset());

it("updates the exam identity in place without deleting subjects or scores", async () => {
  const updated = mockDatabase();
  await expect(updateSchoolExam(details)).resolves.toEqual({ id: 7 });
  expect(updated).toEqual([{
    schoolId: 3, grade: "중2", academicYear: 2026, semester: 2,
    examType: "중간고사", title: "2학기 중간고사",
  }]);
});

it("rejects an identity already used by a different exam", async () => {
  const updated = mockDatabase(9);
  await expect(updateSchoolExam(details)).rejects.toThrow("이미 있습니다");
  expect(updated).toEqual([]);
});
