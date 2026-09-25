import { describe, expect, it } from "vitest";
import { suggestMathJournalCopy } from "./mathJournalCopy";

const date = "2026-09-29";

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
