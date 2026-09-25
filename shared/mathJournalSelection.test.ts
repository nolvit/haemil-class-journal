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
