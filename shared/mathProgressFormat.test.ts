import { describe, expect, it } from "vitest";
import {
  formatMathJournalContent,
  normalizeMathJournalDisplayContent,
  type MathJournalPayload,
} from "./mathProgress";

describe("math journal content formatting", () => {
  it("prints the title once per contiguous unit and puts each item on its own line", () => {
    const payload: MathJournalPayload = {
      version: 1,
      sessionKind: "math",
      freeText: "교재 42쪽 복습",
      entries: [
        { key: "중1-2:3:learn:1", state: "active" },
        { key: "중1-2:3:learn:2", state: "complete" },
        { key: "중1-2:4:learn:1", state: "skipped" },
      ],
    };

    expect(formatMathJournalContent(payload, "2026-09-28")).toBe(
      "[중1-2 / 기본 / 3단원]\n" +
      "3-1 다각형 · 진행 중\n" +
      "3-2 삼각형의 내각과 외각 · 완료\n" +
      "[중1-2 / 기본 / 4단원]\n" +
      "4-1 다면체 · 건너뜀\n" +
      "교재 42쪽 복습"
    );
  });

  it("keeps the existing English heading and free-text behavior", () => {
    const english: MathJournalPayload = {
      version: 1, sessionKind: "english", freeText: "교재 42쪽", entries: [],
    };
    expect(formatMathJournalContent(english, "2026-09-28")).toBe(
      "영어 집중 수업\n교재 42쪽"
    );
    expect(formatMathJournalContent({ ...english, freeText: "영어 집중 수업\n독해" }, "2026-09-28"))
      .toBe("영어 집중 수업\n독해");
  });
});

describe("stored math journal display normalization", () => {
  it("turns consecutive old one-line selections into a single title and separate items", () => {
    const stored =
      "[중1-2 / 기본 / 3단원] 3-1 다각형 · 진행 중\n" +
      "[중1-2 / 기본 / 3단원] 3-2 삼각형의 내각과 외각 · 완료\n" +
      "[중1-2 / 기본 / 4단원] 4-1 다면체 · 건너뜀\n" +
      "교재 42쪽 복습";
    expect(normalizeMathJournalDisplayContent(stored)).toBe(
      "[중1-2 / 기본 / 3단원]\n" +
      "3-1 다각형 · 진행 중\n" +
      "3-2 삼각형의 내각과 외각 · 완료\n" +
      "[중1-2 / 기본 / 4단원]\n" +
      "4-1 다면체 · 건너뜀\n" +
      "교재 42쪽 복습"
    );
  });

  it("does not alter legacy 1단계 records, prose or already multiline records", () => {
    const legacy = "[중1-2 / 1단계 / 3-1단원]\n다각형";
    const prose = "오늘은 [중1-2 / 기본 / 3단원] 3-1 다각형 · 진행 중을 복습했습니다.";
    const multiline = "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 진행 중";
    expect(normalizeMathJournalDisplayContent(legacy)).toBe(legacy);
    expect(normalizeMathJournalDisplayContent(prose)).toBe(prose);
    expect(normalizeMathJournalDisplayContent(multiline)).toBe(multiline);
  });
});
