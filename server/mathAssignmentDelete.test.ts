import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { connection, pool, remoteDelete } = vi.hoisted(() => ({
  connection: {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn(),
  },
  pool: { query: vi.fn(), getConnection: vi.fn() },
  remoteDelete: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({ default: { createPool: () => pool } }));
vi.mock("./mathbankAssignmentDelete", () => ({ deleteMathbankAssignmentCopy: remoteDelete }));

import { deleteMathAssignment } from "./mathAssignmentStore";
import { mathAssignmentsRouter } from "./routers/mathAssignments";
import type { TrpcContext } from "./_core/context";

const originalDatabaseUrl = process.env.DATABASE_URL;
const assignmentId = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost/test";
  pool.query.mockReset().mockImplementation(async (sql: string) =>
    sql.startsWith("SELECT") ? [[{ id: assignmentId }]] : [[]]);
  pool.getConnection.mockReset().mockResolvedValue(connection);
  remoteDelete.mockReset().mockResolvedValue(undefined);
  connection.beginTransaction.mockReset().mockResolvedValue(undefined);
  connection.commit.mockReset().mockResolvedValue(undefined);
  connection.rollback.mockReset().mockResolvedValue(undefined);
  connection.release.mockReset();
  connection.query.mockReset().mockImplementation(async (sql: string) =>
    sql.startsWith("SELECT") ? [[{ id: assignmentId }]] : [{ affectedRows: 1 }]);
});

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("permanent math assignment deletion", () => {
  it("rejects deletion without an admin session before touching the database", async () => {
    const caller = mathAssignmentsRouter.createCaller({
      user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
    });
    await expect(caller.delete({ assignmentId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("removes photos, attempts, items, OCR requests, audits, and the parent-visible assignment atomically", async () => {
    await expect(deleteMathAssignment(assignmentId)).resolves.toEqual({ success: true });
    expect(remoteDelete).toHaveBeenCalledOnce();
    expect(remoteDelete).toHaveBeenCalledWith(assignmentId);
    expect(remoteDelete.mock.invocationCallOrder[0]).toBeLessThan(connection.beginTransaction.mock.invocationCallOrder[0]);
    const statements = connection.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, " "));
    expect(statements.map(sql => sql.match(/(?:FROM|JOIN) (math_\w+)/)?.[1])).toEqual([
      "math_assignments",
      "math_assignment_photos",
      "math_assignment_attempts",
      "math_assignment_items",
      "math_ocr_requests",
      "math_assignment_audit",
      "math_assignments",
    ]);
    expect(connection.query.mock.calls.every(([, params]) => params[0] === assignmentId)).toBe(true);
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("rolls back if a related record cannot be deleted", async () => {
    connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("math_ocr_requests")) throw new Error("database failure");
      return sql.startsWith("SELECT") ? [[{ id: assignmentId }]] : [{ affectedRows: 1 }];
    });
    await expect(deleteMathAssignment(assignmentId)).rejects.toThrow("database failure");
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("keeps the local assignment if Mathbank deletion fails", async () => {
    remoteDelete.mockRejectedValueOnce(new Error("Mathbank unavailable"));
    await expect(deleteMathAssignment(assignmentId)).rejects.toThrow("Mathbank unavailable");
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
  });

  it("rejects an already removed assignment without deleting anything else", async () => {
    pool.query.mockResolvedValue([[]]);
    await expect(deleteMathAssignment(assignmentId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(remoteDelete).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
  });
});
