import { describe, expect, it } from "vitest";
import { isMathLessonCopyCandidate } from "./recentMathLesson";

const date = "2026-09-23";
const base = {
  journalDate: date,
  content: "",
  isDraft: false,
  mathProgress: null,
};

describe("math journal copy source", () => {
  it("accepts a structured math journal with selected process entries", () => {
    expect(isMathLessonCopyCandidate({
      ...base,
      mathProgress: {
        version: 1,
        sessionKind: "math",
        freeText: "설명",
        entries: [{ key: "중1-2:3:learn:1", state: "active" }],
      },
    })).toBe(true);
  });

  it("skips English-focused and process-free structured journals", () => {
    for (const sessionKind of ["english", "math"] as const) {
      expect(isMathLessonCopyCandidate({
        ...base,
        content: "영어 집중 수업",
        mathProgress: { version: 1, sessionKind, freeText: "영어 집중 수업", entries: [] },
      })).toBe(false);
    }
    expect(isMathLessonCopyCandidate({
      ...base,
      mathProgress: {
        version: 1, sessionKind: "english", freeText: "",
        entries: [{ key: "중1-2:3:learn:1", state: "complete" }],
      },
    })).toBe(false);
  });

  it("accepts only explicit, recognizable legacy math process records", () => {
    expect(isMathLessonCopyCandidate({
      ...base,
      content: "[중1-2 / 1단계 / 3-1단원]\n다각형 학습",
    })).toBe(true);
    expect(isMathLessonCopyCandidate({
      ...base,
      content: "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 진행 중",
    })).toBe(true);
    for (const content of [
      "영어 집중 수업",
      "[중1-2 / 1단계 / 3-1단원]\n영어 집중 수업",
      "수학 교재 상담",
      "과제만 확인",
      "[중1-2 / 기본 / 3단원]",
      "[중1-2 / 기본 / 3단원]\n학부모와 다음 수업 시간을 상담함",
    ]) {
      expect(isMathLessonCopyCandidate({ ...base, content })).toBe(false);
    }
  });

  it("never copies drafts", () => {
    expect(isMathLessonCopyCandidate({
      ...base,
      isDraft: true,
      content: "[중1-2 / 1단계 / 3-1단원]\n다각형 학습",
    })).toBe(false);
  });
});
