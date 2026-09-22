import { expect, it } from "vitest";
import { mathCurriculum } from "../shared/mathCurriculum";
import {
  correctedProgressBaseline,
  resolveCorrectionStudent,
  mathProgressCorrectionPlans,
} from "../shared/mathProgressCorrections";
import {
  calculateMathProgress,
  createProgressBaseline,
  isMathProgressEligible,
  type ProgressJournal,
} from "../shared/mathProgress";
const row = (
  date: string,
  id: number,
  content = "[중2-2 / 1단계 / 2-3단원]"
): ProgressJournal => ({ id, journalDate: date, content, isDraft: false });
it("transcribes the supplied first-semester curriculum without merging distinct lessons", () => {
  const c = mathCurriculum.find(c => c.term === "중1-1")!;
  expect(c.units.map(u => u.smalls.length)).toEqual([4, 6, 4, 4, 6]);
  expect(c.units[2].smalls.slice(2)).toEqual([
    "일차식의 계산 (1)",
    "일차식의 계산 (2)",
  ]);
  expect(c.units[4].smalls[5]).toBe("반비례 관계의 그래프의 성질");
});
it("excludes current middle-3 students but retains the enrolled cohort after promotion in 2027", () => {
  const m2 = createProgressBaseline([row("2026-09-22", 1)], "중2");
  const m3 = createProgressBaseline([], "중3");
  expect(isMathProgressEligible("중3", m3, "2026-09-22")).toBe(false);
  expect(isMathProgressEligible("중3", m2, "2026-09-22")).toBe(false);
  expect(isMathProgressEligible("중3", m2, "2027-03-01")).toBe(true);
  expect(isMathProgressEligible("중3", m3, "2027-03-01")).toBe(false);
  expect(isMathProgressEligible("중2", m2, "2026-09-22")).toBe(true);
});
it("sets Kim to middle-1 second semester through 3-2 learning", () => {
  const rows = [
    row("2026-09-21", 1, "[중1-2 / 1단계 / 3-2단원]"),
    row("2026-09-22", 2, "[중1-2 / 1단계 / 7-1단원]"),
  ];
  const b = correctedProgressBaseline(
    rows,
    "중2",
    mathProgressCorrectionPlans[0]
  );
  expect(b.sourceDate).toBe("2026-09-21");
  expect(b.termCorrection).toBe("중1-2");
  expect(b.terms).toEqual(["중1-2"]);
  expect(b.states["중1-2:2:final2"]).toBe("complete");
  expect(b.states["중1-2:3:learn:1"]).toBe("complete");
  expect(b.states["중1-2:3:learn:2"]).toBe("complete");
  expect(b.states["중1-2:3:learn:3"]).toBe("waiting");
  expect(b.states["중1-2:3:challenge"]).toBe("waiting");

  const p = calculateMathProgress(rows, [], "2026-09-22", {
    baseline: b,
    grade: "중2",
  });
  expect(p.terms.map(t => t.term)).toEqual(["중1-2"]);
});
it("sets Moon through 2-2 learning and Jeon through the unit-2 preliminary assessment", () => {
  const rows = [
    row("2026-09-18", 1),
    row("2026-09-21", 2),
    row("2026-09-22", 3, "[중2-2 / 1단계 / 3-1단원]"),
  ];
  const moon = correctedProgressBaseline(
    rows,
    "중2",
    mathProgressCorrectionPlans[1]
  );
  const jeon = correctedProgressBaseline(
    rows,
    "중2",
    mathProgressCorrectionPlans[2]
  );

  expect(moon.sourceId).toBe(3);
  expect(moon.states["중2-2:1:final2"]).toBe("complete");
  expect(moon.states["중2-2:2:learn:1"]).toBe("complete");
  expect(moon.states["중2-2:2:learn:2"]).toBe("complete");
  expect(moon.states["중2-2:2:learn:3"]).toBe("waiting");
  expect(moon.states["중2-2:2:challenge"]).toBe("waiting");

  expect(jeon.sourceId).toBe(1);
  expect(jeon.states["중2-2:1:final2"]).toBe("complete");
  expect(jeon.states["중2-2:2:learn:5"]).toBe("complete");
  expect(jeon.states["중2-2:2:challenge"]).toBe("complete");
  expect(jeon.states["중2-2:2:test:5"]).toBe("complete");
  expect(jeon.states["중2-2:2:preliminary"]).toBe("complete");
  expect(jeon.states["중2-2:2:final1"]).toBe("waiting");
  expect(jeon.states["중2-2:2:final2"]).toBe("waiting");
});
it("does not silently substitute an earlier date or an ambiguous name", () => {
  expect(() =>
    correctedProgressBaseline(
      [row("2026-09-18", 1)],
      "중2",
      mathProgressCorrectionPlans[0]
    )
  ).toThrow("일지가 없습니다");
  expect(() =>
    resolveCorrectionStudent(
      [
        { id: 1, name: "김화랑" },
        { id: 2, name: "김화랑" },
      ],
      "김화랑"
    )
  ).toThrow("2명");
  expect(() => resolveCorrectionStudent([], "김화랑")).toThrow("0명");
});
it("corrects Han to middle-1 first semester without rewriting source journals or showing second semester", () => {
  const rows = [row("2026-09-22", 1, "[중1-2 / 1단계 / 2-3단원]")];
  const b = correctedProgressBaseline(
    rows,
    "초6",
    mathProgressCorrectionPlans[3]
  );
  expect(b.termCorrection).toBe("중1-1");
  expect(rows[0].content).toContain("중1-2");
  expect(b.sourceText).toContain("중1-2");
  const p = calculateMathProgress(rows, [], "2026-09-22", {
    baseline: b,
    grade: "초6",
  });
  expect(p.terms.map(t => t.term)).toEqual(["중1-1"]);
  expect(p.terms[0].units[0].complete).toBe(true);
  expect(p.terms[0].units[1].cells[2].state).toBe("active");
});
it("does not introduce first semester retroactively for students already studying second semester", () => {
  const b = createProgressBaseline(
    [row("2026-09-22", 1, "[중1-2 / 기본 / 2-3단원]")],
    "중1"
  );
  expect(
    calculateMathProgress([], [], "2026-09-22", {
      baseline: b,
      grade: "중1",
    }).terms.map(t => t.term)
  ).toEqual(["중1-2"]);
});
it("still reflects later edits within Kim's corrected course", () => {
  const rows = [
    row("2026-09-21", 1, "[중1-2 / 1단계 / 3-2단원]"),
    row("2026-09-22", 2, "[중1-2 / 1단계 / 5-1단원]"),
  ];
  const b = correctedProgressBaseline(
    rows,
    "중2",
    mathProgressCorrectionPlans[0]
  );
  rows[1].content = "[중1-2 / 1단계 / 3-3단원]";
  const p = calculateMathProgress(rows, [], "2026-09-22", {
    baseline: b,
    grade: "중2",
  });
  expect(p.terms.map(t => t.term)).toEqual(["중1-2"]);
  expect(
    p.terms[0].units[2].cells.find(c => c.key === "중1-2:3:learn:3")?.state
  ).toBe("active");
});
