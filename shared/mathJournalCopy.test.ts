import { describe, expect, it } from "vitest";
import { carryForwardMathJournalEntries, suggestMathJournalCopy } from "./mathJournalCopy";
import { formatMathJournalContent, type MathJournalEntry } from "./mathProgress";

const date = "2026-09-29";

describe("math journal carry-forward", () => {
  it("keeps only ongoing work when copying successive lessons", () => {
    const monday: MathJournalEntry[] = [
      { key: "중1-2:3:learn:3", state: "complete" },
      { key: "중1-2:3:learn:4", state: "active" },
    ];
    const tuesday = carryForwardMathJournalEntries(monday, date);
    expect(tuesday).toEqual([{ key: "중1-2:3:learn:4", state: "active" }]);

    const afterTuesdayLesson: MathJournalEntry[] = [
      { ...tuesday[0], state: "complete" },
      { key: "중1-2:3:learn:5", state: "active" },
    ];
    const wednesday = carryForwardMathJournalEntries(afterTuesdayLesson, "2026-09-30");
    expect(wednesday).toEqual([{ key: "중1-2:3:learn:5", state: "active" }]);
    expect(formatMathJournalContent({ version: 1, sessionKind: "math", freeText: "", entries: wednesday }, "2026-09-30"))
      .not.toMatch(/3-3|3-4/);
    expect(carryForwardMathJournalEntries(wednesday, "2026-10-01")).toEqual(wednesday);
  });

  it("does not carry completed, skipped, duplicate or invalid items", () => {
    expect(carryForwardMathJournalEntries([
      { key: "중1-2:3:learn:3", state: "complete" },
      { key: "중1-2:3:learn:4", state: "skipped" },
      { key: "중1-2:3:learn:5", state: "active" },
      { key: "중1-2:3:learn:5", state: "active" },
      { key: "중1-2:3:learn:99", state: "active" },
    ], date)).toEqual([{ key: "중1-2:3:learn:5", state: "active" }]);
  });
});

describe("legacy math journal copy suggestions", () => {
  it("converts only the named small unit and preserves free prose", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 1단계 / 3-1단원]\n다각형\n오늘은 다각형을 복습했습니다.", date
    )).toEqual({
      entries: [{ key: "중1-2:3:learn:1", state: "active" }],
      freeText: "오늘은 다각형을 복습했습니다.",
    });
  });

  it("supports explicit states and multiple items under one new-style header", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 완료\n3-2 삼각형의 내각과 외각 · 건너뜀\n문제 풀이를 계속합니다.", date
    )).toEqual({
      entries: [
        { key: "중1-2:3:learn:1", state: "complete" },
        { key: "중1-2:3:learn:2", state: "skipped" },
      ],
      freeText: "문제 풀이를 계속합니다.",
    });
  });

  it("does not mistake practice preliminary assessment for challenge", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 기본 / 3단원]\n실력문제 예비 평가 · 완료", date
    )?.entries).toEqual([{ key: "중1-2:3:practicePreliminary", state: "complete" }]);
  });

  it("accepts explicit parenthesized states without inferring older steps", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 1단계 / 3-1단원]\n다각형 (완료)", date
    )?.entries).toEqual([{ key: "중1-2:3:learn:1", state: "complete" }]);
  });

  it("keeps scheduled lines as prose without selecting them", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 완료\n3-2 삼각형의 내각과 외각 · 예정", date
    )).toEqual({
      entries: [{ key: "중1-2:3:learn:1", state: "complete" }],
      freeText: "3-2 삼각형의 내각과 외각 · 예정",
    });
    expect(suggestMathJournalCopy("[중1-2 / 1단계 / 3-1단원]\n다각형 예정", date)).toBeNull();
  });

  it("rejects invalid units, unsupported stages and ambiguous item names", () => {
    expect(suggestMathJournalCopy("[중1-2 / 기본 / 30-1단원]\n다각형", date)).toBeNull();
    expect(suggestMathJournalCopy("[중1-2 / 2단계 / 3-1단원]\n다각형", date)).toBeNull();
    expect(suggestMathJournalCopy("[중1-2 / 기본 / 3단원]\n소단원 평가", date)).toBeNull();
    expect(suggestMathJournalCopy("[중1-2 / 기본 / 3단원]\n3-9 미지의 과정", date)).toBeNull();
  });

  it("rejects conflicting copies of the same key rather than choosing a state", () => {
    expect(suggestMathJournalCopy(
      "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 완료\n3-1 다각형 · 건너뜀", date
    )).toBeNull();
  });
});
