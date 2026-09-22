import { describe, expect, it } from "vitest";
import {
  calculateFocusedLearning,
  calculateMathProgress,
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

  it("removes only the matching item when its reassessment is recorded", () => {
    const rows = [
      journal(1, "2026-09-20", lesson("2-1 소단원 재수강\n2-2 소단원 재수강")),
      journal(2, "2026-09-21", lesson("2-1 소단원 재평가")),
    ];
    expect(calculateFocusedLearning(rows).map(item => item.key)).toEqual([
      "중2-2:2:2",
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
