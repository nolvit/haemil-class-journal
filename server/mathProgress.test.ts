import { describe, it, expect } from "vitest";
import {
  calculateMathProgress,
  calculateRecentCourseStats,
  calculateLegacyRecentLearningStats,
  createProgressBaseline,
  isMathProgressSession,
  middleGrade,
  type ProgressJournal,
  type ProgressOverride,
} from "../shared/mathProgress";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
const row = (
  content: string,
  id = 1,
  extra: Partial<ProgressJournal> = {}
): ProgressJournal => ({
  id,
  content,
  journalDate: "2026-09-21",
  isDraft: false,
  ...extra,
});
const calc = (rows: ProgressJournal[], overrides: ProgressOverride[] = []) =>
  calculateMathProgress(rows, overrides, "2026-09-22");
const unit = (p: ReturnType<typeof calc>, n = 2) =>
  p.terms.find(t => t.term === "중2-2")!.units[n - 1];
describe("math course progress", () => {
  it("completes previous major units but leaves current-unit evaluations waiting", () => {
    const p = calc([row("[중2-2 / 기본 / 2-3단원]")]);
    const u = unit(p);
    expect(u.cells.filter(c => c.sector === "learn").map(c => c.state)).toEqual(
      ["complete", "complete", "active", "waiting", "waiting"]
    );
    expect(unit(p, 1).learn).toBe("complete");
    expect(unit(p, 1).test).toBe("complete");
    expect(u.complete).toBe(false);
  });
  it("requires every major evaluation before marking the unit complete", () => {
    const a = row(
      "[중2-2 / 기본 / 2단원]\n2-1 소단원 평가\n중단원 예비 평가\n1차 최종 평가"
    );
    expect(unit(calc([a])).learn).toBe("complete");
    expect(unit(calc([a])).test).toBe("active");
    const p = calc([a, row("[중2-2 / 기본 / 2단원]\n2차 최종 평가", 2)]);
    expect(unit(p).complete).toBe(true);
    expect(unit(p).percent).toBe(100);
  });
  it("does not lower completion when later records review earlier units", () => {
    const rows = [
      row("[중2-2 / 기본 / 7-2단원]"),
      row("[중2-2 / 기본 / 1-1단원]", 2),
    ];
    expect(unit(calc(rows), 1).learn).toBe("complete");
    expect(calc(rows)).toEqual(calc([...rows].reverse()));
  });
  it("ignores drafts and future entries", () => {
    const p = calc([
      row("[중2-2 / 기본 / 7-2단원]", 1, { isDraft: true }),
      row("[중2-2 / 기본 / 7-2단원]", 2, { journalDate: "2026-10-01" }),
    ]);
    expect(p.percent).toBe(0);
    expect(p.unmatched).toHaveLength(0);
  });
  it("reports undefined units, malformed headers and invalid small units", () => {
    const p = calc([
      row("[중3-2 / 기본 / 6-1단원]"),
      row("수학 학습", 2),
      row("[중2-2 / 기본 / 2-99단원]", 3),
    ]);
    expect(p.percent).toBe(0);
    expect(p.unmatched).toHaveLength(3);
  });
  it("recognizes whitespace variations and separates multiple course blocks", () => {
    const p = calc([
      row(
        "[ 중 2 - 2 / 기본 / 2 - 3 단원 ]\n[중1-2 / 기본 / 1단원]\n중단원 예비평가\n1차 최종평가\n2차 최종평가"
      ),
    ]);
    expect(p.unmatched).toHaveLength(0);
    expect(p.terms.find(t => t.term === "중1-2")!.units[0].complete).toBe(true);
    expect(unit(p).test).toBe("waiting");
  });
  it("preserves explicit manual states and allows automatic restoration", () => {
    const rows = [row("[중2-2 / 기본 / 2-3단원]")];
    const o: ProgressOverride = {
      key: "중2-2:2:learn:1",
      state: "waiting",
      reason: "확인 필요",
      updatedByUserId: 1,
      updatedAt: "2026-09-22",
    };
    expect(unit(calc(rows, [o])).cells[0].state).toBe("waiting");
    expect(unit(calc(rows)).cells[0].state).toBe("complete");
  });
  it("rejects non-admin list and correction access", async () => {
    const user = {
      id: 1,
      openId: "test",
      role: "user",
      name: null,
      email: null,
      loginMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as const;
    const caller = appRouter.createCaller({
      user,
      req: {},
      res: {},
    } as TrpcContext);
    await expect(caller.academy.mathProgress.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.academy.mathProgress.save({
        studentId: 1,
        key: "중2-2:2:learn:1",
        state: "complete",
        reason: "검증",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("2026-09-22 initial progress and grade accumulation", () => {
  const latest = row("[중2-2 / 1단계 / 2-3단원]", 22, {
    journalDate: "2026-09-22",
  });
  it("uses only the latest non-draft journal on or before cutoff", () => {
    const baseline = createProgressBaseline(
      [
        row("[중2-2 / 기본 / 7-2단원]", 1),
        latest,
        row("[중2-2 / 기본 / 6-1단원]", 23, { journalDate: "2026-09-23" }),
        row("[중2-2 / 기본 / 7-1단원]", 24, {
          journalDate: "2026-09-22",
          isDraft: true,
        }),
      ],
      "중2"
    );
    expect(baseline.sourceId).toBe(22);
    expect(baseline.recognized).toBe(true);
    const p = calculateMathProgress([], [], "2026-09-22", {
      baseline,
      grade: "중2",
    });
    expect(p.terms.map(t => t.term)).toEqual(["중2-2"]);
    expect(unit(p, 1).complete).toBe(true);
    expect(
      unit(p, 2)
        .cells.filter(c => c.sector === "learn")
        .map(c => c.state)
    ).toEqual(["complete", "complete", "active", "waiting", "waiting"]);
    expect(unit(p, 2).challenge).toBe("waiting");
    expect(unit(p, 2).test).toBe("waiting");
    expect(unit(p, 3).percent).toBe(0);
  });
  it("retains middle-2 work on promotion without fabricating middle-1 history", () => {
    const baseline = createProgressBaseline([latest], "중2");
    const p = calculateMathProgress([], [], "2027-03-01", {
      baseline,
      grade: "중3",
    });
    expect(p.terms.map(t => t.term)).toEqual(["중2-2", "중3-1"]);
    expect(unit(p, 1).complete).toBe(true);
    expect(p.terms.find(t => t.term === "중3-1")?.percent).toBe(0);
  });
  it("adds current grade and retains the recorded starting grade", () => {
    const baseline = createProgressBaseline(
      [row("[중1-2 / 1단계 / 3-2단원]")],
      "중1"
    );
    const p = calculateMathProgress([], [], "2027-03-01", {
      baseline,
      grade: "중2",
    });
    expect(p.terms.map(t => t.term)).toEqual(["중1-2", "중2-2"]);
  });
  it("does not parse pre-cutoff history again or overwrite manual corrections", () => {
    const baseline = createProgressBaseline([latest], "중2");
    const override: ProgressOverride = {
      key: "중2-2:1:final2",
      state: "waiting",
      reason: "재확인",
      updatedAt: "2026-09-22",
      updatedByUserId: 1,
    };
    const p = calculateMathProgress(
      [row("[중2-2 / 기본 / 7-2단원]")],
      [override],
      "2026-09-23",
      { baseline, grade: "중2" }
    );
    expect(unit(p, 1).complete).toBe(false);
    expect(unit(p, 3).percent).toBe(0);
  });
  it("does not use an older recognizable record if the latest one cannot be parsed", () => {
    const baseline = createProgressBaseline(
      [
        row("[중2-2 / 기본 / 7-2단원]"),
        row("개별 보충", 22, { journalDate: "2026-09-22" }),
      ],
      "중2"
    );
    const p = calculateMathProgress([], [], "2026-09-22", {
      baseline,
      grade: "중2",
    });
    expect(p.percent).toBe(0);
    expect(p.unmatched[0].id).toBe(22);
  });
  it("keeps an English-focused lesson without treating it as a math recognition error", () => {
    const earlier = row("[중2-2 / 기본 / 2-3단원]", 1, {
      journalDate: "2026-09-21",
    });
    const englishAtCutoff = row("영어 집중 수업", 2, {
      journalDate: "2026-09-22",
    });
    const baseline = createProgressBaseline([earlier, englishAtCutoff], "중2");
    expect(baseline.sourceId).toBe(1);
    const progress = calculateMathProgress(
      [
        row("영어 집중 수업", 3, { journalDate: "2026-09-23" }),
        row("수학 학습", 4, { journalDate: "2026-09-24" }),
      ],
      [],
      "2026-09-24",
      { baseline, grade: "중2" }
    );
    expect(progress.unmatched.map(entry => entry.id)).toEqual([4]);
  });
  it("keeps all learning before challenge and all tests after challenge", () => {
    const p = calc([row("[중2-2 / 1단계 / 2단원]\n고난이도 실력문제 풀기")]);
    const u = unit(p);
    expect(u.learn).toBe("complete");
    expect(u.challenge).toBe("active");
    expect(u.test).toBe("waiting");
    expect(u.cells.map(c => c.sector)).toEqual([
      ...Array(5).fill("learn"),
      "challenge",
      ...Array(8).fill("test"),
    ]);
  });
  it("entering small-unit evaluations completes every learning section and challenge first", () => {
    const u = unit(calc([row("[중2-2 / 1단계 / 2단원]\n2-2 소단원 평가")]));
    expect(u.learn).toBe("complete");
    expect(u.challenge).toBe("complete");
    expect(
      u.cells.filter(c => c.key.includes(":test:")).map(c => c.state)
    ).toEqual(["complete", "complete", "waiting", "waiting", "waiting"]);
    expect(u.cells.find(c => c.key.endsWith(":preliminary"))?.state).toBe(
      "waiting"
    );
  });
  it("does not count planned evaluation lines", () => {
    const u = unit(
      calc([row("[중2-2 / 1단계 / 2-3단원]\n2차 최종 평가 예정")])
    );
    expect(u.test).toBe("waiting");
    expect(u.complete).toBe(false);
  });
  it("normalizes grade labels and preserves no-journal current-grade scope", () => {
    expect(middleGrade("중등부 2학년")).toBe(2);
    const baseline = createProgressBaseline([], "중2");
    expect(
      calculateMathProgress([], [], "2026-09-22", {
        baseline,
        grade: "중2",
      }).terms.map(t => t.term)
    ).toEqual(["중2-2"]);
  });

  it("uses the dated middle-3 second-term course and keeps 2027 promotion in semester 1", () => {
    const oldCourse = calculateMathProgress([], [], "2026-12-31").terms.find(
      t => t.term === "중3-2"
    )!;
    const newCourse = calculateMathProgress([], [], "2027-01-01").terms.find(
      t => t.term === "중3-2"
    )!;
    expect(
      oldCourse.units[3].cells.filter(c => c.sector === "learn")
    ).toHaveLength(2);
    expect(
      newCourse.units[3].cells.filter(c => c.sector === "learn")
    ).toHaveLength(3);
    expect(oldCourse.units[4].cells[1].label).toBe("5-2 상자그림");
    expect(newCourse.units[4].cells[1].label).toBe("5-2 산포도");
    const baseline = createProgressBaseline([latest], "중2");
    expect(
      calculateMathProgress([], [], "2027-01-01", {
        baseline,
        grade: "중3",
      }).terms.map(t => t.term)
    ).toEqual(["중2-2", "중3-1"]);
  });
});
it("continues to reflect edits and new records on the baseline date itself", () => {
  const source = row("[중2-2 / 1단계 / 2-3단원]", 22, {
    journalDate: "2026-09-22",
  });
  const baseline = createProgressBaseline([source], "중2");
  const amended = { ...source, content: "[중2-2 / 1단계 / 2-4단원]" };
  const p = calculateMathProgress([amended], [], "2026-09-22", {
    baseline,
    grade: "중2",
  });
  expect(unit(p).cells.find(c => c.key.endsWith(":learn:3"))?.state).toBe(
    "complete"
  );
  expect(unit(p).cells.find(c => c.key.endsWith(":learn:4"))?.state).toBe(
    "active"
  );
  const later = row("[중2-2 / 1단계 / 3-1단원]", 23, {
    journalDate: "2026-09-22",
  });
  expect(
    unit(
      calculateMathProgress([source, later], [], "2026-09-22", {
        baseline,
        grade: "중2",
      })
    ).complete
  ).toBe(true);
});

describe("learning mastery and recent pace metrics", () => {
  it("separates learning progress from assessment mastery", () => {
    const source = row("[중2-2 / 기본 / 2-3단원]");
    const baseline = createProgressBaseline([source], "중2");
    const p = calculateMathProgress([], [], "2026-09-22", {
      baseline,
      grade: "중2",
    });
    expect(p.learningPercent).toBe(23);
    expect(p.masteryPercent).toBe(16);
    expect(p.learningPercent).toBeGreaterThan(p.masteryPercent);
  });

  it("builds historical snapshots from the rolling cutoff instead of the fixed initial date", () => {
    const baseline = createProgressBaseline(
      [
        row("[중2-2 / 기본 / 1-1단원]", 1, { journalDate: "2026-09-22" }),
        row("[중2-2 / 기본 / 2-1단원]", 2, { journalDate: "2026-10-20" }),
        row("[중2-2 / 기본 / 3-1단원]", 3, { journalDate: "2026-10-24" }),
      ],
      "중2",
      { snapshotDate: "2026-10-23" }
    );
    expect(baseline.sourceDate).toBe("2026-10-20");
  });

  it("does not erase four-week math progress after an English-only lesson", () => {
    const rows = [
      row("[중2-2 / 1단계 / 2단원]\n고난이도 문제 풀기", 1, {
        journalDate: "2026-08-27",
      }),
      row("영어 집중\n-Nelt 문제풀이", 2, {
        journalDate: "2026-08-28",
      }),
      row("[중2-2 / 1단계 / 3단원]\n3-2 소단원 평가", 3, {
        journalDate: "2026-09-22",
      }),
    ];
    const currentProgress = calculateMathProgress([], [], "2026-09-25", {
      baseline: createProgressBaseline([rows[2]], "중2", {
        snapshotDate: "2026-09-25",
      }),
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-25"
    );

    expect(currentProgress.learningPercent).toBe(50);
    expect(stats.learningDeltaPercent).toBe(17);
    expect(stats.learningStepsGained).toBe(5);
    expect(stats.mathSessionDays).toBe(1);
    expect(stats.assessmentSessionDays).toBe(1);
    expect(stats.courseDeltaPercent).toBeGreaterThan(0);
    const legacy = calculateLegacyRecentLearningStats(
      stats,
      rows,
      currentProgress,
      "2026-09-25"
    );
    expect(legacy.deltaPercent).toBe(17);
    expect(legacy.learningSessions).toBe(1);
  });

  it("counts math learning, assessment, and repeat-study days but not English-only days", () => {
    const rows = [
      row("[중2-2 / 1단계 / 1단원]\n이등변삼각형의 성질", 1, {
        journalDate: "2026-09-01",
      }),
      row("[중2-2 / 1단계 / 1단원]\n직각삼각형의 합동 조건", 2, {
        journalDate: "2026-09-04",
      }),
      row("[중2-2 / 1단계 / 1단원]\n삼각형의 외심", 3, {
        journalDate: "2026-09-08",
      }),
      row("[중2-2 / 1단계 / 1단원]\n삼각형의 내심", 4, {
        journalDate: "2026-09-11",
      }),
      row("[중2-2 / 1단계 / 2단원]\n2-1 소단원 평가", 5, {
        journalDate: "2026-09-22",
      }),
      row("영어 집중 수업", 6, { journalDate: "2026-09-23" }),
      row("[중2-2 / 1단계 / 2단원]\n재수강", 7, {
        journalDate: "2026-09-24",
      }),
    ];
    const currentProgress = calculateMathProgress([], [], "2026-09-25", {
      baseline: createProgressBaseline([rows[4]], "중2", {
        snapshotDate: "2026-09-25",
      }),
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-25"
    );
    expect(stats.mathSessionDays).toBe(6);
    expect(stats.learningSessionDays).toBe(5);
    expect(stats.assessmentSessionDays).toBe(1);
    expect(stats.sufficientPaceData).toBe(true);
    expect(stats.coursePointsPerSession).toBeGreaterThan(0);
  });

  it("credits assessment-only progress without inventing learning progress", () => {
    const rows = [
      row("[중2-2 / 1단계 / 1단원]\n1-1 소단원 평가", 1, {
        journalDate: "2026-08-28",
      }),
      row("[중2-2 / 1단계 / 1단원]\n1-2 소단원 평가", 2, {
        journalDate: "2026-09-20",
      }),
    ];
    const currentProgress = calculateMathProgress([], [], "2026-09-25", {
      baseline: createProgressBaseline(rows, "중2", {
        snapshotDate: "2026-09-25",
      }),
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-25"
    );
    expect(stats.learningDeltaPercent).toBe(0);
    expect(stats.assessmentDeltaPercent).toBeGreaterThan(0);
    expect(stats.courseDeltaPercent).toBeGreaterThan(0);
    expect(stats.mathSessionDays).toBe(1);
    expect(stats.assessmentSessionDays).toBe(1);
    expect(isMathProgressSession(rows[1], "2026-09-25")).toBe(true);
    expect(
      isMathProgressSession(
        row("영어 집중 수업", 3, { journalDate: "2026-09-20" }),
        "2026-09-25"
      )
    ).toBe(false);
  });

  it("forecasts remaining learning and assessment days separately", () => {
    const rows = [
      row("[중2-2 / 1단계 / 1-1단원]", 1, { journalDate: "2026-09-01" }),
      row("[중2-2 / 1단계 / 1-2단원]", 2, { journalDate: "2026-09-05" }),
      row("[중2-2 / 1단계 / 1-3단원]", 3, { journalDate: "2026-09-10" }),
      row("[중2-2 / 1단계 / 1-4단원]", 4, { journalDate: "2026-09-15" }),
      row("[중2-2 / 1단계 / 1단원]\n1-1 소단원 평가", 5, {
        journalDate: "2026-09-18",
      }),
      row("[중2-2 / 1단계 / 1단원]\n1-2 소단원 평가", 6, {
        journalDate: "2026-09-20",
      }),
    ];
    const currentProgress = calculateMathProgress([], [], "2026-09-22", {
      baseline: createProgressBaseline(rows, "중2", {
        snapshotDate: "2026-09-22",
      }),
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-22",
      { scheduleWeekdays: [1, 3, 5] }
    );
    expect(stats.learningSessionDays).toBe(4);
    expect(stats.assessmentSessionDays).toBe(2);
    expect(stats.estimatedCompletionSessions).toBe(
      Math.ceil(
        (stats.remainingLearningSteps * stats.learningSessionDays) /
          stats.learningStepsGained
      ) +
        Math.ceil(
          (stats.remainingAssessmentSteps * stats.assessmentSessionDays) /
            stats.assessmentStepsGained
        )
    );
    expect(stats.estimatedCompletionDate).not.toBeNull();
  });

  it("does not mark basic course complete when only learning is complete", () => {
    const baseline = createProgressBaseline([], "중2");
    const initial = calculateMathProgress([], [], "2026-09-25", {
      baseline,
      grade: "중2",
    });
    const overrides = initial.terms.flatMap(term =>
      term.units.flatMap(unit =>
        unit.cells
          .filter(cell => cell.sector !== "test")
          .map(cell => ({
            key: cell.key,
            state: "complete" as const,
            reason: "기존 상태 보정",
            updatedByUserId: 1,
            updatedAt: "2026-09-01",
          }))
      )
    );
    const currentProgress = calculateMathProgress([], overrides, "2026-09-25", {
      baseline,
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      [],
      "중2",
      currentProgress,
      "2026-09-25"
    );
    expect(currentProgress.learningPercent).toBe(100);
    expect(stats.learningDeltaPercent).toBe(0);
    expect(stats.remainingLearningSteps).toBe(0);
    expect(stats.remainingAssessmentSteps).toBeGreaterThan(0);
    expect(stats.estimatedCompletionSessions).toBeNull();
    expect(stats.estimatedCompletionDate).toBeNull();
  });

  it("marks basic course complete only after the final assessment is complete", () => {
    const rows = [
      row("[중2-2 / 기본 / 7단원]\n2차 최종 평가", 1, {
        journalDate: "2026-09-24",
      }),
    ];
    const currentProgress = calculateMathProgress([], [], "2026-09-25", {
      baseline: createProgressBaseline(rows, "중2", {
        snapshotDate: "2026-09-25",
      }),
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-25"
    );
    expect(stats.remainingLearningSteps).toBe(0);
    expect(stats.remainingAssessmentSteps).toBe(0);
    expect(stats.estimatedCompletionSessions).toBe(0);
    expect(stats.estimatedCompletionDate).toBe("2026-09-25");
  });

  it("does not forecast the full course without assessment pace evidence", () => {
    const rows = [
      row("[중2-2 / 기본 / 1-1단원]", 1, { journalDate: "2026-09-01" }),
      row("[중2-2 / 기본 / 1-2단원]", 2, { journalDate: "2026-09-05" }),
      row("[중2-2 / 기본 / 1-3단원]", 3, { journalDate: "2026-09-10" }),
      row("[중2-2 / 기본 / 1-4단원]", 4, { journalDate: "2026-09-15" }),
      row("[중2-2 / 기본 / 2-1단원]", 5, { journalDate: "2026-09-20" }),
      row("[중2-2 / 기본 / 2-1단원]\n재수강", 6, {
        journalDate: "2026-09-21",
      }),
    ];
    const currentBaseline = createProgressBaseline(rows, "중2", {
      snapshotDate: "2026-09-22",
    });
    const currentProgress = calculateMathProgress([], [], "2026-09-22", {
      baseline: currentBaseline,
      grade: "중2",
    });
    const stats = calculateRecentCourseStats(
      rows,
      "중2",
      currentProgress,
      "2026-09-22",
      {
        scheduleWeekdays: [1, 3, 5],
        blockedDates: ["2026-09-25"],
      }
    );
    expect(stats.learningDeltaPercent).toBe(17);
    expect(stats.learningStepsGained).toBe(5);
    expect(stats.mathSessionDays).toBe(6);
    expect(stats.remainingLearningSteps).toBe(25);
    expect(stats.remainingAssessmentSteps).toBeGreaterThan(0);
    expect(stats.assessmentSessionDays).toBe(0);
    expect(stats.sufficientPaceData).toBe(true);
    expect(stats.estimatedCompletionSessions).toBeNull();
    expect(stats.estimatedCompletionDate).toBeNull();
    const legacy = calculateLegacyRecentLearningStats(
      stats,
      rows,
      currentProgress,
      "2026-09-22",
      {
        scheduleWeekdays: [1, 3, 5],
        blockedDates: ["2026-09-25"],
      }
    );
    expect(legacy.learningSessions).toBe(5);
    expect(legacy.estimatedCompletionDate).toBe("2026-11-20");
  });
});
