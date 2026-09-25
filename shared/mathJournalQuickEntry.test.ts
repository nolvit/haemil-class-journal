import { expect, it } from "vitest";
import { appendMathReviewText, getMathReviewSuggestions } from "./mathJournalQuickEntry";
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
