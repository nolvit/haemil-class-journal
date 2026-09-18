import { describe, expect, it } from "vitest";
import { buildTuitionNotificationLine } from "./tuitionNotificationRules";

describe("tuition notification copy", () => {
  it("omits the subject count for elementary students", () => {
    expect(
      buildTuitionNotificationLine({
        grade: "초5",
        registrationCount: 4,
        subjectCount: 2,
        tuition: 200_000,
      })
    ).toBe("원비는 초등부 16회 기준 20만원입니다.");
  });

  it("includes the subject count for middle and high school students", () => {
    expect(
      buildTuitionNotificationLine({
        grade: "중2",
        registrationCount: 5,
        subjectCount: 2,
        tuition: 360_000,
      })
    ).toBe("원비는 중등부 2과목 20회 기준 36만원입니다.");
    expect(
      buildTuitionNotificationLine({
        grade: "중1",
        registrationCount: 3,
        subjectCount: 1,
        tuition: 130_000,
      })
    ).toBe("원비는 중등부 1과목 12회 기준 13만원입니다.");
  });
});
