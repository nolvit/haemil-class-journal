import { describe, expect, it } from "vitest";
import {
  calculateFocusedLearning,
  calculateMathProgress,
  formatMathJournalContent,
  type ProgressJournal,
} from "../shared/mathProgress";

const journal = (
  id: number,
  journalDate: string,
  body: string,
  isDraft = false
): ProgressJournal => ({ id, journalDate, content: body, isDraft });

const lesson = (line: string) => `[중2-2 / 1단계 / 2단원]\n${line}`;

describe("focused learning from journal records", () => {
  it("recognizes Hong Si-yeon's pictured September 23 selected-item plus free-text entry", () => {
    const payload = {
      version: 1 as const,
      sessionKind: "math" as const,
      entries: [{ key: "중2-2:3:test:3", state: "complete" as const }],
      freeText: "3-3 소단원 재수강",
    };
    const content = formatMathJournalContent(payload, "2026-09-23");
    expect(content).toBe("[중2-2 / 기본 / 3단원]\n3-3 소단원 평가 · 완료\n3-3 소단원 재수강");
    expect(calculateFocusedLearning([{
      id: 23, journalDate: "2026-09-23", content, isDraft: false, mathProgress: payload,
    }], "2026-09-26")).toEqual([
      expect.objectContaining({ key: "중2-2:3:3", startedAt: "2026-09-23", phase: "retraining" }),
    ]);
    expect(calculateMathProgress([{
      id: 23, journalDate: "2026-09-23", content, isDraft: false, mathProgress: payload,
    }], [], "2026-09-26").reviewHistory).toEqual([
      { key: "중2-2:3:3", parentKey: "중2-2:3:test:3", term: "중2-2", unit: 3,
        small: 3, kind: "retraining", label: "3-3 소단원 재수강", journalDate: "2026-09-23" },
    ]);
  });
  it("activates an explicitly recorded small-unit retraining", () => {
    expect(
      calculateFocusedLearning([
        journal(1, "2026-09-21", lesson("2-1 소단원 재수강")),
      ])
    ).toEqual([
      expect.objectContaining({
        key: "중2-2:2:1",
        label: "2-1 평행사변형",
        startedAt: "2026-09-21",
      }),
    ]);
  });

  it("tracks a middle-unit retraining separately and ends it on an explicit reassessment", () => {
    const rows = [
      journal(1, "2026-09-21", lesson("2-1 소단원 재수강\n중단원 재수강")),
      journal(2, "2026-09-22", lesson("중단원 재평가")),
    ];
    expect(calculateFocusedLearning(rows.slice(0, 1), "2026-09-22")).toEqual([
      expect.objectContaining({ key: "중2-2:2:1", small: 1 }),
      expect.objectContaining({ key: "중2-2:2:middle", small: 0, startedAt: "2026-09-21" }),
    ]);
    expect(calculateFocusedLearning(rows, "2026-09-22").map(item => item.key)).toEqual(["중2-2:2:1"]);
  });

  it("removes only the matching item when its reassessment is recorded", () => {
    const rows = [
      journal(1, "2026-09-20", lesson("2-1 소단원 재수강\n2-2 소단원 재수강")),
      journal(2, "2026-09-21", lesson("2-1 소단원 재평가")),
    ];
    expect(calculateFocusedLearning(rows).map(item => item.key)).toEqual([
      "중2-2:2:2",
    ]);
  });

  it("keeps a September 23 small-unit review visible while reassessment is only planned", () => {
    const rows = [
      journal(1, "2026-09-23", lesson("2-3 소단원 재수강")),
      journal(2, "2026-09-24", lesson("2-3 소단원 재평가 예정")),
      journal(3, "2026-09-25", lesson("2-3 소단원 재평가 완료")),
    ];
    expect(calculateFocusedLearning(rows.slice(0, 1), "2026-09-23")).toEqual([
      expect.objectContaining({ key: "중2-2:2:3", phase: "retraining", startedAt: "2026-09-23" }),
    ]);
    expect(calculateFocusedLearning(rows.slice(0, 2), "2026-09-24")).toEqual([
      expect.objectContaining({ key: "중2-2:2:3", phase: "reassessment_pending", startedAt: "2026-09-23", reassessmentPlannedAt: "2026-09-24" }),
    ]);
    expect(calculateFocusedLearning(rows, "2026-09-25")).toEqual([]);
    expect(calculateMathProgress(rows, [], "2026-09-25").reviewHistory.map(event => [event.parentKey, event.label])).toEqual([
      ["중2-2:2:test:3", "2-3 소단원 재수강"],
      ["중2-2:2:test:3", "2-3 소단원 재평가 예정"],
      ["중2-2:2:test:3", "2-3 소단원 재평가 완료"],
    ]);
  });

  it("keeps middle-unit reassessment planned without closing small-unit review", () => {
    const rows = [
      journal(1, "2026-09-23", lesson("2-3 소단원 재수강\n중단원 재수강")),
      journal(2, "2026-09-24", lesson("중단원 재평가 예정")),
      journal(3, "2026-09-25", lesson("중단원 재평가 완료")),
    ];
    expect(calculateFocusedLearning(rows.slice(0, 2), "2026-09-24").map(item => [item.key, item.phase])).toEqual([
      ["중2-2:2:3", "retraining"],
      ["중2-2:2:middle", "reassessment_pending"],
    ]);
    expect(calculateFocusedLearning(rows, "2026-09-25").map(item => item.key)).toEqual(["중2-2:2:3"]);
    expect(calculateMathProgress(rows, [], "2026-09-25").reviewHistory
      .filter(event => event.small === 0)
      .map(event => [event.parentKey, event.label])).toEqual([
        ["중2-2:2:preliminary", "중단원 재수강"],
        ["중2-2:2:preliminary", "중단원 재평가 예정"],
        ["중2-2:2:preliminary", "중단원 재평가 완료"],
      ]);
  });

  it("uses event order and supports another retraining after reassessment", () => {
    const rows = [
      journal(1, "2026-09-20", lesson("2-1 소단원 재수강")),
      journal(2, "2026-09-21", lesson("2-1 소단원 재평가")),
      journal(3, "2026-09-22", lesson("2-1 소단원 재수강")),
    ];
    expect(calculateFocusedLearning(rows)[0]).toMatchObject({
      startedAt: "2026-09-22",
      journalId: 3,
    });
  });

  it("recalculates after an old journal is edited or deleted", () => {
    const retraining = journal(1, "2026-09-20", lesson("2-1 소단원 재수강"));
    expect(calculateFocusedLearning([retraining])).toHaveLength(1);
    expect(
      calculateFocusedLearning([
        { ...retraining, content: lesson("2-1 소단원 평가") },
      ])
    ).toHaveLength(0);
    expect(calculateFocusedLearning([])).toHaveLength(0);
  });

  it("ignores drafts, future records, invalid unit references and other wording", () => {
    const rows = [
      journal(1, "2026-09-20", lesson("2-1 소단원 재수강"), true),
      journal(2, "2026-09-24", lesson("2-1 소단원 재수강")),
      journal(3, "2026-09-20", lesson("3-1 소단원 재수강")),
      journal(4, "2026-09-20", lesson("2-1 복습")),
    ];
    expect(calculateFocusedLearning(rows, "2026-09-22")).toEqual([]);
  });

  it("does not change regular progress or completeness", () => {
    const normal = [journal(1, "2026-09-21", "[중2-2 / 1단계 / 2-3단원]")];
    const withRetraining = [
      ...normal,
      journal(2, "2026-09-22", lesson("2-1 소단원 재수강")),
    ];
    const before = calculateMathProgress(normal, [], "2026-09-22");
    const after = calculateMathProgress(withRetraining, [], "2026-09-22");
    expect(after.percent).toBe(before.percent);
    expect(after.terms).toEqual(before.terms);
    expect(after.focusedLearning).toHaveLength(1);
  });
});
