import { describe, expect, it } from "vitest";
import {
  dashboardMathExamTargets,
  previousDashboardDate,
  type DashboardMathJournal,
} from "./dashboardMathExams";

const date = "2026-09-29";
const previousDate = "2026-09-28";

function journal(
  overrides: Partial<DashboardMathJournal> = {}
): DashboardMathJournal {
  return {
    studentId: 1,
    studentName: "김화랑",
    studentGrade: "중1",
    classGroupId: 10,
    journalDate: date,
    content: "",
    mathProgress: null,
    ...overrides,
  };
}

describe("dashboard math exam targets", () => {
  it("lists only unfinished assessment selections, not learning or completed/skipped tests", () => {
    const targets = dashboardMathExamTargets([journal({
      mathProgress: {
        version: 1,
        sessionKind: "math",
        freeText: "",
        entries: [
          { key: "중1-2:3:learn:3", state: "active" },
          { key: "중1-2:3:test:3", state: "active" },
          { key: "중1-2:3:preliminary", state: "active" },
          { key: "중1-2:3:final1", state: "complete" },
          { key: "중1-2:3:final2", state: "skipped" },
        ],
      },
    })], date);
    expect(targets).toMatchObject([{
      studentId: 1,
      sourceDate: date,
      fromYesterday: false,
      exams: ["3-3 소단원 평가", "3단원 중단원 예비 평가"],
    }]);
  });

  it("carries yesterday's unfinished test only when today is English-focused", () => {
    const rows = [
      journal({ journalDate: previousDate, content: "[중1-2 / 기본 / 3단원]\n3-3 소단원 평가 · 진행 중" }),
      journal({ content: "영어 집중 수업" }),
    ];
    expect(dashboardMathExamTargets(rows, date)).toMatchObject([{
      sourceDate: previousDate,
      fromYesterday: true,
      exams: ["3-3 소단원 평가"],
    }]);
    expect(dashboardMathExamTargets(rows.slice(0, 1), date)).toEqual([]);
  });

  it("shows the next test after yesterday's completed test, including a legacy journal", () => {
    expect(dashboardMathExamTargets([
      journal({ journalDate: previousDate, content: "[중1-2 / 기본 / 3단원]\n3-3 소단원 평가 · 완료" }),
      journal({
        content: "영어 집중 수업",
        mathProgress: { version: 1, sessionKind: "english", freeText: "영어 집중 수업", entries: [] },
      }),
    ], date)).toMatchObject([{
      sourceDate: previousDate,
      fromYesterday: true,
      exams: ["3-4 소단원 평가"],
    }]);
  });

  it("advances to the next assessment stage after the last small-unit test", () => {
    expect(dashboardMathExamTargets([
      journal({
        journalDate: previousDate,
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [{ key: "중1-2:3:test:5", state: "complete" }],
        },
      }),
      journal({ content: "영어 집중 수업" }),
    ], date)).toMatchObject([{
      exams: ["3단원 중단원 예비 평가"],
    }]);
    expect(dashboardMathExamTargets([
      journal({
        journalDate: previousDate,
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [{ key: "중1-2:3:preliminary", state: "complete" }],
        },
      }),
      journal({ content: "영어 집중 수업" }),
    ], date)[0]?.exams).toEqual(["3단원 실력문제 예비 평가"]);
  });

  it("does not show another test when the next step is learning or previous work is unfinished", () => {
    const english = journal({ content: "영어 집중 수업" });
    expect(dashboardMathExamTargets([
      journal({
        journalDate: previousDate,
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [{ key: "중1-2:3:final2", state: "complete" }],
        },
      }),
      english,
    ], date)).toEqual([]);
    expect(dashboardMathExamTargets([
      journal({
        journalDate: previousDate,
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [
            { key: "중1-2:3:test:4", state: "active" },
            { key: "중1-2:3:test:5", state: "complete" },
          ],
        },
      }),
      english,
    ], date)).toMatchObject([{ exams: ["3-4 소단원 평가"] }]);
  });

  it("includes a scheduled reassessment but not a completed one", () => {
    const targets = dashboardMathExamTargets([journal({
      mathProgress: {
        version: 1,
        sessionKind: "math",
        freeText: "[중1-2 / 기본 / 3단원]\n3-3 소단원 재평가 예정\n중단원 재평가 완료",
        entries: [],
      },
    })], date);
    expect(targets[0]?.exams).toEqual(["3-3 소단원 재평가"]);
  });

  it("prefers today's selected test over the next step from yesterday", () => {
    expect(dashboardMathExamTargets([
      journal({
        journalDate: previousDate,
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [{ key: "중1-2:3:test:5", state: "complete" }],
        },
      }),
      journal({
        mathProgress: {
          version: 1, sessionKind: "math", freeText: "",
          entries: [{ key: "중1-2:3:final1", state: "active" }],
        },
      }),
    ], date)).toMatchObject([{
      sourceDate: date,
      fromYesterday: false,
      exams: ["3단원 1차 최종 평가"],
    }]);
  });

  it("reads a legacy one-line heading and exam without rewriting the journal", () => {
    const targets = dashboardMathExamTargets([journal({
      content: "[중1-2 / 기본 / 3단원] 중단원 예비 평가 · 진행 중",
    })], date);
    expect(targets[0]?.exams).toEqual(["3단원 중단원 예비 평가"]);
  });

  it("uses the previous calendar date, including at month boundaries", () => {
    expect(previousDashboardDate("2026-10-01")).toBe("2026-09-30");
  });
});
