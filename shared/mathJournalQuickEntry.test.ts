import { expect, it } from "vitest";
import { appendMathReviewText, getMathReassessmentSuggestions, getMathReviewSuggestions } from "./mathJournalQuickEntry";
import { calculateFocusedLearning, calculateMathProgress, formatMathJournalContent } from "./mathProgress";

const date = "2026-09-25";

it("suggests small-unit and middle-unit review only after completed evaluations", () => {
  const suggestions = getMathReviewSuggestions([
    { key: "중2-2:2:test:3", state: "active" },
    { key: "중2-2:2:test:3", state: "complete" },
    { key: "중2-2:2:preliminary", state: "complete" },
    { key: "중2-2:2:learn:3", state: "complete" },
  ], date);
  expect(suggestions.map(item => item.label)).toEqual(["중단원 재수강", "2-3 소단원 재수강"]);
  expect(suggestions.every(item => item.term === "중2-2" && item.unit === 2)).toBe(true);
});

it("places review under one title when the selected math item is in the same unit", () => {
  const suggestion = getMathReviewSuggestions([{ key: "중2-2:2:test:3", state: "complete" }], date)[0]!;
  const entries = [{ key: "중2-2:2:test:3", state: "complete" as const }];
  expect(appendMathReviewText("", entries, suggestion)).toBe("2-3 소단원 재수강");
  expect(appendMathReviewText("교재 42쪽", entries, suggestion)).toBe("교재 42쪽\n2-3 소단원 재수강");
});

it("adds the right title when the new journal has no selected items and avoids duplicate clicks", () => {
  const suggestion = getMathReviewSuggestions([{ key: "중2-2:2:test:3", state: "complete" }], date)[0]!;
  const first = appendMathReviewText("", [], suggestion);
  expect(first).toBe("[중2-2 / 기본 / 2단원]\n2-3 소단원 재수강");
  expect(appendMathReviewText(first, [], suggestion)).toBe(first);
});

it("starts another title when the current selection belongs to a different unit", () => {
  const suggestion = getMathReviewSuggestions([{ key: "중2-2:2:preliminary", state: "complete" }], date)[0]!;
  expect(appendMathReviewText("", [{ key: "중2-2:3:learn:1", state: "active" }], suggestion))
    .toBe("[중2-2 / 기본 / 2단원]\n중단원 재수강");
});

it("records a small-unit review separately from regular completion progress", () => {
  const suggestion = getMathReviewSuggestions([{ key: "중2-2:2:test:3", state: "complete" }], date)[0]!;
  const payload = { version: 1 as const, sessionKind: "math" as const, entries: [],
    freeText: appendMathReviewText("", [], suggestion) };
  const journal = { id: 1, journalDate: date, isDraft: false,
    content: formatMathJournalContent(payload, date), mathProgress: payload };
  expect(calculateFocusedLearning([journal], date).map(item => item.key)).toEqual(["중2-2:2:3"]);
  expect(calculateMathProgress([journal], [], date).terms.find(term => term.term === "중2-2")?.units[1].percent).toBe(0);
});

it("includes a saved quick middle-unit review in focused learning without changing course completion", () => {
  const suggestion = getMathReviewSuggestions([{ key: "중2-2:2:preliminary", state: "complete" }], date)[0]!;
  const payload = { version: 1 as const, sessionKind: "math" as const, entries: [],
    freeText: appendMathReviewText("", [], suggestion) };
  const journal = { id: 2, journalDate: date, isDraft: false,
    content: formatMathJournalContent(payload, date), mathProgress: payload };
  const progress = calculateMathProgress([journal], [], date);
  expect(progress.focusedLearning).toEqual([
    expect.objectContaining({ key: "중2-2:2:middle", startedAt: date }),
  ]);
  expect(progress.terms.find(term => term.term === "중2-2")?.units[1].percent).toBe(0);
});

it("offers planned and completed reassessment after a saved small-unit review", () => {
  const before = { id: 1, journalDate: "2026-09-23", isDraft: false,
    content: "[중2-2 / 기본 / 2단원]\n2-3 소단원 재수강" };
  const focused = calculateFocusedLearning([before], "2026-09-24");
  const suggestions = getMathReassessmentSuggestions(focused);
  expect(suggestions.map(item => item.label)).toEqual(["2-3 소단원 재평가 예정", "2-3 소단원 재평가 완료"]);
  const planned = { id: 2, journalDate: "2026-09-24", isDraft: false,
    content: appendMathReviewText("", [], suggestions[0]!) };
  expect(calculateFocusedLearning([before, planned], "2026-09-24")[0]?.phase).toBe("reassessment_pending");
  const completeSuggestion = getMathReassessmentSuggestions(calculateFocusedLearning([before, planned], "2026-09-25"));
  expect(completeSuggestion.map(item => item.label)).toEqual(["2-3 소단원 재평가 완료"]);
  const completed = { id: 3, journalDate: "2026-09-25", isDraft: false,
    content: appendMathReviewText("", [], completeSuggestion[0]!) };
  expect(calculateFocusedLearning([before, planned, completed], "2026-09-25")).toEqual([]);
});
