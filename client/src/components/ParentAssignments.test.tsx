import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  list: {} as { isLoading: boolean; error: Error | null; data: { assignments: unknown[] } | null },
  detail: {} as { isLoading: boolean; error: Error | null; data: unknown },
}));

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
});
