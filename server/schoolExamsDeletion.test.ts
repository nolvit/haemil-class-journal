import { beforeEach, expect, it, vi } from "vitest";
import { schoolExams, schoolExamSubjects, studentExamResults } from "../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { deleteExamSubject, deleteSchoolExam, deleteStudentExamResult } from "./schoolExamsStore";

function mockDatabase(rowsByTable: Map<unknown, Array<{ id: number }>>) {
  const deleted: unknown[] = [];
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = rowsByTable.get(table) ?? [];
          return {
            limit: async () => rows.slice(0, 1),
            then: (resolve: (value: typeof rows) => void, reject: (reason: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject),
          };
        },
      }),
    }),
    delete: (table: unknown) => ({ where: async () => { deleted.push(table); } }),
  };
  getDbMock.mockResolvedValue({
    execute: async () => undefined,
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  });
  return deleted;
}

beforeEach(() => getDbMock.mockReset());

it("deletes an exam's results, subjects and exam in that order, but no academy student", async () => {
  const deleted = mockDatabase(new Map([
    [schoolExams, [{ id: 7 }]],
    [schoolExamSubjects, [{ id: 11 }, { id: 12 }]],
  ]));
  await expect(deleteSchoolExam(7)).resolves.toEqual({ success: true });
  expect(deleted).toEqual([studentExamResults, schoolExamSubjects, schoolExams]);
});

it("deletes only the selected subject and its results", async () => {
  const deleted = mockDatabase(new Map([[schoolExamSubjects, [{ id: 11 }]]]));
  await expect(deleteExamSubject(11)).resolves.toEqual({ success: true });
  expect(deleted).toEqual([studentExamResults, schoolExamSubjects]);
});

it("deletes only one student exam result", async () => {
  const deleted = mockDatabase(new Map([[studentExamResults, [{ id: 21 }]]]));
  await expect(deleteStudentExamResult(21)).resolves.toEqual({ success: true });
  expect(deleted).toEqual([studentExamResults]);
});

it("does not delete anything for a missing exam", async () => {
  const deleted = mockDatabase(new Map());
  await expect(deleteSchoolExam(999)).rejects.toThrow("삭제할 시험을 찾을 수 없습니다.");
  expect(deleted).toEqual([]);
});
