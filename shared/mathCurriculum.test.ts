import { describe, expect, it } from "vitest";
import {
  mathCurriculumForDate,
  MIDDLE3_SECOND_TERM_SWITCH_DATE,
} from "./mathCurriculum";

describe("middle-3 second-term curriculum edition", () => {
  const course = (date: string) =>
    mathCurriculumForDate(date).find(c => c.term === "중3-2")!;

  it("uses the 2026 contents through December 31", () => {
    const units = course("2026-12-31").units;
    expect(units.map(u => u.name)).toEqual([
      "삼각비",
      "삼각비의 활용",
      "원과 직선",
      "원주각",
      "통계",
    ]);
    expect(units.map(u => u.smalls.length)).toEqual([3, 2, 2, 2, 3]);
    expect(units[3].smalls).toEqual(["원주각의 성질", "원주각의 활용"]);
    expect(units[4].smalls).toEqual([
      "산포도",
      "상자그림",
      "산점도와 상관관계",
    ]);
  });

  it("switches to the revised contents on January 1, 2027", () => {
    expect(MIDDLE3_SECOND_TERM_SWITCH_DATE).toBe("2027-01-01");
    const units = course(MIDDLE3_SECOND_TERM_SWITCH_DATE).units;
    expect(units.map(u => u.smalls.length)).toEqual([3, 2, 2, 3, 3]);
    expect(units[3].smalls).toEqual([
      "원주각과 그 성질",
      "원에 내접하는 사각형의 성질",
      "원의 접선과 현이 이루는 각",
    ]);
    expect(units[4].smalls).toEqual([
      "대푯값",
      "산포도",
      "산점도와 상관관계",
    ]);
  });
});
