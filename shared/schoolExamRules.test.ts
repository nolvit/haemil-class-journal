import { describe, expect, it } from "vitest";
import { countLessonsBeforeExam, examComparison, type ExamLessonEvidence } from "./schoolExamRules";

const base: ExamLessonEvidence = {
  journalDate: "2026-09-20", classSubject: "수학", content: "3-3 소단원 평가",
  isDraft: false, attendanceStatus: "present",
};

describe("school exam lesson evidence", () => {
  it("counts only actual subject lessons before the exam, including double makeup", () => {
    expect(countLessonsBeforeExam([
      base,
      { ...base, journalDate: "2026-09-21", attendanceStatus: "makeup_double" },
      { ...base, journalDate: "2026-09-22", attendanceStatus: "absent" },
      { ...base, journalDate: "2026-09-23", isDraft: true },
      { ...base, journalDate: "2026-09-24" },
    ], "수학", "2026-09-24", "2026-09-24")).toEqual({ count: 3, status: "auto" });
  });
  it("moves English-focused math journals to English", () => {
    const row = { ...base, content: "영어 집중 수업" };
    expect(countLessonsBeforeExam([row], "수학", "2026-09-25", "2026-09-25").status).toBe("unavailable");
    expect(countLessonsBeforeExam([row], "영어", "2026-09-25", "2026-09-25").count).toBe(1);
    expect(countLessonsBeforeExam([{ ...base, mathSessionKind: "english" }], "영어", "2026-09-25", "2026-09-25").count).toBe(1);
  });
  it("does not invent counts for compound subjects or missing records", () => {
    expect(countLessonsBeforeExam([{ ...base, classSubject: "초등 국사과" }], "사회", "2026-09-25", "2026-09-25")).toEqual({ count: null, status: "review" });
    expect(countLessonsBeforeExam([], "과학", "2026-09-25", "2026-09-25")).toEqual({ count: null, status: "unavailable" });
  });
  it("compares only supplied same-exam scores", () => {
    expect(examComparison([90, 92], 82)).toEqual({ count: 2, academyAverage: 91, difference: 9 });
    expect(examComparison([], null)).toEqual({ count: 0, academyAverage: null, difference: null });
  });
  it("requires review when double makeup spans different subjects", () => {
    const rows = [
      { ...base, attendanceStatus: "makeup_double" },
      { ...base, classSubject: "영어", attendanceStatus: "makeup_double" },
    ];
    expect(countLessonsBeforeExam(rows, "수학", "2026-09-25", "2026-09-25")).toEqual({ count: null, status: "review" });
  });
});
