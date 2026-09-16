import { describe, expect, it } from "vitest";
import {
  getAttendanceCountUnits,
  getMigratedTotalCount,
  getRegistrationPackageCount,
} from "../shared/studentCountPolicy";

describe("student count policy", () => {
  it("keeps old attendance at one unit and applies two units from cutover", () => {
    const policy = {
      lessonUnitMultiplier: 2,
      lessonUnitEffectiveFrom: "2026-09-20",
    };
    expect(getAttendanceCountUnits("present", "2026-09-19", policy)).toBe(1);
    expect(getAttendanceCountUnits("present", "2026-09-20", policy)).toBe(2);
    expect(getAttendanceCountUnits("makeup", "2026-09-20", policy)).toBe(3);
    expect(getAttendanceCountUnits("absent", "2026-09-20", policy)).toBe(0);
  });

  it("doubles only the remaining count without changing used history", () => {
    expect(
      getMigratedTotalCount({
        totalCount: 40,
        usedCount: 30,
        targetMultiplier: 2,
      })
    ).toEqual({
      remainingCount: 10,
      migratedRemainingCount: 20,
      migratedTotalCount: 50,
    });
  });

  it("preserves zero and negative balances for manual review", () => {
    expect(
      getMigratedTotalCount({
        totalCount: 30,
        usedCount: 32,
        targetMultiplier: 2,
      })
    ).toEqual({
      remainingCount: -2,
      migratedRemainingCount: -2,
      migratedTotalCount: 30,
    });
  });

  it("uses the new 22/18/14 package counts and doubles two-unit plans", () => {
    expect(getRegistrationPackageCount(5, 1)).toBe(22);
    expect(getRegistrationPackageCount(4, 1)).toBe(18);
    expect(getRegistrationPackageCount(3, 1)).toBe(14);
    expect(getRegistrationPackageCount(5, 2)).toBe(44);
    expect(getRegistrationPackageCount(4, 2)).toBe(36);
    expect(getRegistrationPackageCount(3, 2)).toBe(28);
  });
});
