import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MathJournalSelection } from "../client/src/components/MathJournalSelection";

it("shows every selected math item on its own row with quick status and removal controls", () => {
  const html = renderToStaticMarkup(createElement(MathJournalSelection, {
    date: "2026-09-25",
    grade: "중등부 3학년",
    sessionKind: "math",
    entries: [
      { key: "중3-2:1:learn:1", state: "complete" },
      { key: "중3-2:1:learn:2", state: "active" },
    ],
    onSessionKindChange: () => {},
    onEntriesChange: () => {},
  }));

  expect(html).toContain("이번 일지 2개 항목");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="이번 일지의 수학 과정 항목"');
  expect((html.match(/선택 삭제/g) ?? [])).toHaveLength(2);
  expect((html.match(/aria-pressed="true"/g) ?? [])).toHaveLength(3);
  expect(html).toContain(" · 완료");
  expect(html).toContain(" · 진행 중");
});

it("keeps English-focused entry and review suggestions visible while the full selector is closed", () => {
  const html = renderToStaticMarkup(createElement(MathJournalSelection, {
    date: "2026-09-25",
    grade: "중2",
    sessionKind: "math",
    entries: [],
    previousEntries: [{ key: "중2-2:2:test:3", state: "complete" }],
    onSessionKindChange: () => {},
    onEntriesChange: () => {},
    onReviewSuggestion: () => {},
  }));
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="영어 집중 수업 선택"');
  expect(html).toContain("2-3 소단원 재수강");
});

it("shows reassessment quick entry without expanding the selection list", () => {
  const html = renderToStaticMarkup(createElement(MathJournalSelection, {
    date: "2026-09-25", grade: "중2", sessionKind: "math", entries: [],
    focusedLearning: [{ key: "중2-2:2:3", term: "중2-2", unit: 2, small: 3,
      label: "2-3 여러 가지 사각형", startedAt: "2026-09-23", phase: "retraining" }],
    onSessionKindChange: () => {}, onEntriesChange: () => {}, onReviewSuggestion: () => {},
  }));
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="재평가 빠른 입력"');
  expect(html).toContain("2-3 소단원 재평가 예정");
  expect(html).toContain("2-3 소단원 재평가 완료");
});

it("labels an automatically prepared next step as unsaved", () => {
  const html = renderToStaticMarkup(createElement(MathJournalSelection, {
    date: "2026-09-30",
    grade: "중1",
    sessionKind: "math",
    entries: [{ key: "중1-2:3:learn:5", state: "active" }],
    autoStartedKey: "중1-2:3:learn:5",
    onSessionKindChange: () => {},
    onEntriesChange: () => {},
  }));
  expect(html).toContain("다음 과정을 진행 중으로 준비했습니다. 아직 저장 전입니다.");
});

it("offers a next-step button when the current journal already has text but no selected step", () => {
  const html = renderToStaticMarkup(createElement(MathJournalSelection, {
    date: "2026-09-30",
    grade: "중1",
    sessionKind: "math",
    entries: [],
    previousEntries: [{ key: "중1-2:3:learn:4", state: "complete" }],
    onSessionKindChange: () => {},
    onEntriesChange: () => {},
  }));
  expect(html).toContain("이전 수업 다음 과정 시작");
  expect(html).toContain('aria-expanded="false"');
});
