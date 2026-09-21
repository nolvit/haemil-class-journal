import { describe, expect, it } from "vitest";
import { isWeeklyAttendanceComplete, buildParentAttendanceMessage, getHolidayAdjustedTarget } from "../shared/attendanceSummaryRules";
import { calendarOverridesAttendance } from "../shared/closureRules";
import type { AttendanceStatus } from "../shared/journalRules";

describe("weekly attendance completion", () => {
  it.each([null, undefined, "not_entered"] as const)("does not evaluate if any day is %s even when Friday is filled", pending => {
    for (let index = 0; index < 5; index++) {
      const statuses: Array<AttendanceStatus | null | undefined> = ["present", "absent", "not_registered", "holiday", "holiday"];
      statuses[index] = pending;
      const complete = isWeeklyAttendanceComplete(statuses);
      expect(complete).toBe(false);
      expect(buildParentAttendanceMessage({ target: 3, sessionCount: 1, attendanceDayCount: 1, makeupCount: 0, makeupDoubleCount: 0, isWeeklyAttendanceComplete: complete })).not.toContain("높여봅시다");
    }
  });
  it("evaluates a completed week and hides feedback again if a day is cleared", () => {
    expect(isWeeklyAttendanceComplete(["present", "absent", "not_registered", "closed", "holiday"])).toBe(true);
    expect(isWeeklyAttendanceComplete(["present", "not_entered", "not_registered", "closed", "holiday"])).toBe(false);
    expect(isWeeklyAttendanceComplete([])).toBe(false);
  });
  it("a fully closed week has no attendance encouragement", () => {
    expect(buildParentAttendanceMessage({ target: getHolidayAdjustedTarget(5, 5), sessionCount: 0, attendanceDayCount: 0, makeupCount: 0, makeupDoubleCount: 0, isWeeklyAttendanceComplete: true })).toBe("이번 주의 학습 기록을 확인해 주세요.");
  });
});
describe("holiday priority", () => {
  it("overrides prefilled unregistered attendance on holidays", () => {
    expect(calendarOverridesAttendance("not_registered", "holiday")).toBe(true);
    expect(calendarOverridesAttendance("not_registered", undefined)).toBe(false);
    expect(calendarOverridesAttendance("not_entered", "holiday")).toBe(true);
  });
  it.each(["present", "absent", "makeup", "makeup_double", "closed"])("preserves actual %s records on holidays", status => {
    expect(calendarOverridesAttendance(status, "holiday")).toBe(false);
  });
});
