import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("mysql2/promise");
});

it.each([false, true])(
  "initializes wardrobe background before backfill (existing column: %s)",
  async existing => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "mysql://test-only");
    let hasBackground = existing;
    let backfilled = false;
    const query = vi.fn(async (sql: string, params?: string[]) => {
      if (sql.includes("information_schema.COLUMNS")) {
        return [
          params?.[0] === "avatar_wardrobe" && !hasBackground
            ? []
            : [{ COLUMN_NAME: params?.[1] }],
        ];
      }
      if (sql.includes("ALTER TABLE avatar_wardrobe ADD COLUMN background"))
        hasBackground = true;
      if (sql.includes("w.background")) {
        if (!hasBackground)
          throw new Error("Unknown column 'w.background' in 'field list'");
        backfilled = true;
        expect(sql).toContain("INSERT IGNORE");
      }
      return [[]];
    });
    vi.doMock("mysql2/promise", () => ({
      default: { createPool: () => ({ query }) },
    }));
    const { ensureRewardSchema } = await import("./avatarRewardStore");
    await ensureRewardSchema();
    expect(backfilled).toBe(true);
    const calls = query.mock.calls.length;
    await ensureRewardSchema();
    expect(query.mock.calls.length).toBe(calls);
  }
);
