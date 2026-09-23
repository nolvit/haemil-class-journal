import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => ({ execute }) }));
import { ensureLearningLinksSchema } from "./db";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://test-only");
  execute.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("creates the summary link column on the first startup", async () => {
  execute.mockResolvedValueOnce([]);
  await expect(ensureLearningLinksSchema()).resolves.toBeUndefined();
  expect(execute).toHaveBeenCalledOnce();
});

it.each([false, true])("allows an existing column on restart (Drizzle wrapper: %s)", async wrapped => {
  const cause = Object.assign(new Error("Duplicate column name 'mathEvaluationSummaryUrl'"), {
    code: "ER_DUP_FIELDNAME", errno: 1060,
  });
  execute.mockRejectedValue(wrapped
    ? new DrizzleQueryError("ALTER TABLE students ADD COLUMN mathEvaluationSummaryUrl varchar(2048) NULL", [], cause)
    : cause);
  await expect(ensureLearningLinksSchema()).resolves.toBeUndefined();
  await expect(ensureLearningLinksSchema()).resolves.toBeUndefined();
});

it("preserves non-duplicate database failures", async () => {
  const error = new DrizzleQueryError("ALTER TABLE students ...", [],
    Object.assign(new Error("Access denied"), { code: "ER_TABLEACCESS_DENIED_ERROR", errno: 1142 }));
  execute.mockRejectedValueOnce(error);
  await expect(ensureLearningLinksSchema()).rejects.toBe(error);
});
