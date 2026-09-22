import { afterEach, expect, it, vi } from "vitest";
import * as db from "./db";
import { publicProgress } from "./mathProgressStore";
afterEach(() => vi.restoreAllMocks());
it("does not read course data for an invalid portal token", async () => {
  vi.spyOn(db, "getPortalFamilyByToken").mockResolvedValue([]);
  const getDb = vi.spyOn(db, "getDb");
  expect(await publicProgress("invalid-token", 25)).toBeNull();
  expect(getDb).not.toHaveBeenCalled();
});
it("does not allow a valid family token to select another student", async () => {
  vi.spyOn(db, "getPortalFamilyByToken").mockResolvedValue([
    {
      id: 1,
      name: "test",
      grade: "중2",
      publicToken: "family-token",
      familyKey: "family",
    },
  ]);
  const getDb = vi.spyOn(db, "getDb");
  expect(await publicProgress("family-token", 25)).toBeNull();
  expect(getDb).not.toHaveBeenCalled();
});
