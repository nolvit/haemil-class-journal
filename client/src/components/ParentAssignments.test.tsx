import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  list: {} as { isLoading: boolean; error: Error | null; data: { assignments: unknown[] } | null },
  detail: {} as { isLoading: boolean; error: Error | null; data: unknown },
  selectedId: null as string | null,
  stateHookIndex: 0,
}));

// Server rendering cannot click the assignment card, so initialize that selection only.
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const result = actual.useState(initial);
    return state.stateHookIndex++ === 0 && state.selectedId ? [state.selectedId, result[1]] : result;
  } };
});

vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false }) };
  return { trpc: {
    useUtils: () => ({ academy: { assignments: { publicList: { invalidate: () => {} }, publicDetail: { invalidate: () => {} } } } }),
    academy: { assignments: {
      publicList: { useQuery: () => state.list },
      publicDetail: { useQuery: () => state.detail },
      recognizePage: mutation,
      submit: mutation,
    } },
  } };
});

import ParentAssignments, { AnswerEntryGrid } from "./ParentAssignments";

beforeEach(() => {
  state.list = { isLoading: false, error: null, data: { assignments: [] } };
  state.detail = { isLoading: false, error: null, data: null };
  state.selectedId = null;
  state.stateHookIndex = 0;
});

describe("parent assignment entry", () => {
  it("shows no empty assignment card when a student has no issued work", () => {
    expect(renderToStaticMarkup(<ParentAssignments token="family-token" studentId={12} />)).toBe("");
  });

  it("shows a loading and error state without exposing answer content", () => {
    state.list = { isLoading: true, error: null, data: null };
    expect(renderToStaticMarkup(<ParentAssignments token="family-token" studentId={12} />)).toContain("확인하는 중");
    state.list = { isLoading: false, error: new Error("연결 실패"), data: null };
    const html = renderToStaticMarkup(<ParentAssignments token="family-token" studentId={12} />);
    expect(html).toContain("연결 실패");
    expect(html).not.toContain("정답");
  });

  it("keeps direct choice and numeric entry available when photo OCR cannot be used", () => {
    const html = renderToStaticMarkup(<AnswerEntryGrid
      items={[{ ordinal: 1, answerType: "choice" }, { ordinal: 2, answerType: "numeric" }]}
      answers={{ 1: "2", 2: "1/2" }}
      onChange={() => {}}
    />);
    expect(html).toContain("1번 ②");
    expect(html).toContain("2번 수치 답");
    expect(html).toContain("1/2");
    expect(html).toContain("숫자만 입력 (예: 1/2, 5)");
  });

  it("leaves an uncertain fraction blank until its candidate button is clicked", () => {
    let answers: Record<number, string> = {};
    const onChange = vi.fn((ordinal: number, value: string) => { answers = { ...answers, [ordinal]: value }; });
    const renderGrid = () => AnswerEntryGrid({
      items: [{ ordinal: 1, answerType: "numeric" }, { ordinal: 2, answerType: "numeric" }],
      answers, candidates: { 1: "5/12", 2: "" }, onChange,
    });
    const grid = renderGrid();
    const before = renderToStaticMarkup(grid);
    expect(before).toContain('value=""');
    expect(before).not.toContain('value="5/12"');
    expect(before.match(/인식 후보 .*? · 입력/g)).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();

    function findCandidate(node: React.ReactNode): (() => void) | undefined {
      for (const child of React.Children.toArray(node)) {
        if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void; "aria-label"?: string }>(child)) continue;
        if (child.props["aria-label"] === "1번 인식 후보 5/12 입력") return child.props.onClick;
        const nested = findCandidate(child.props.children);
        if (nested) return nested;
      }
    }
    const clickCandidate = findCandidate(grid);
    expect(clickCandidate).toBeTypeOf("function");
    clickCandidate!();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1, "5/12");
    expect(renderToStaticMarkup(renderGrid())).toContain('value="5/12"');
  });

  it.each([{ version: 3, pages: 1 }, { version: 4, pages: 2 }, { version: undefined, pages: 1 }])(
    "shows $pages printed pages for 40 questions with version $version", ({ version, pages }) => {
      const assignment = { id: "sheet", title: "수학 과제", code: "PAPER", canSubmit: true,
        status: "open", questionCount: 40, attemptCount: 0, answerSheetVersion: version,
        items: Array.from({ length: 40 }, (_, index) => ({ ordinal: index + 1, answerType: "numeric" })), attempts: [] };
      state.list.data = { assignments: [assignment] };
      state.detail.data = assignment;
      state.selectedId = assignment.id;
      const html = renderToStaticMarkup(<ParentAssignments token="family-token" studentId={12} />);
      expect(html.match(/<option /g)).toHaveLength(pages);
      expect(html).toContain(`1 / ${pages}쪽`);
      expect(html).toContain("종이에는 분수를 위아래로 써도 됩니다.");
      expect(html).toContain("직접 입력할 때는 1/2처럼 쓰고, 단위는 생략해 주세요.");
      expect(html).toContain("갤러리에서 선택");
    },
  );

  it("displays stored UTC submission history in Korean time", () => {
    const assignment = { id: "sheet", title: "수학 과제", code: "PAPER", canSubmit: false,
      status: "open", questionCount: 1, attemptCount: 1, answerSheetVersion: 3,
      items: [{ ordinal: 1, answerType: "numeric" }], attempts: [{ id: "attempt", score: 1, total: 1,
        submittedAt: "2026-09-26 18:15:00", results: [{ ordinal: 1, submittedAnswer: "1", correct: true, correctAnswer: "1" }] }] };
    state.list.data = { assignments: [assignment] };
    state.detail.data = assignment;
    state.selectedId = assignment.id;
    const html = renderToStaticMarkup(<ParentAssignments token="family-token" studentId={12} />);
    expect(html).toContain("2026. 9. 27. 오전 3:15");
    expect(html).not.toContain("2026. 9. 26. 오후 6:15");
  });
});
