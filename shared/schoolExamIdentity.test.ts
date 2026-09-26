import { expect, it } from "vitest";
import { matchingExamStudents, sameGrade, sameSchool, schoolExamLabel } from "./schoolExamIdentity";

it("matches short and full school names without matching an absent school", () => {
  expect(sameSchool("석수초", "석수초등학교")).toBe(true);
  expect(sameSchool(" 원일 중학교 ", "원일중")).toBe(true);
  expect(sameSchool(null, "원일중")).toBe(false);
  expect(sameSchool("석수초", "다른초")).toBe(false);
});

it("matches the student grade spellings used by the academy", () => {
  expect(sameGrade("중등 2", "중2")).toBe(true);
  expect(sameGrade("초등 5", "초5학년")).toBe(true);
  expect(sameGrade("중등 2", "중3")).toBe(false);
});

it("auto-lists only active students with both a matching school and grade", () => {
  const students = [
    { id: 1, active: true, schoolHint: "원일중학교", grade: "중등 2" },
    { id: 2, active: false, schoolHint: "원일중", grade: "중2" },
    { id: 3, active: true, schoolHint: "원일중", grade: "중3" },
    { id: 4, active: true, schoolHint: null, grade: "중2" },
  ];
  expect(matchingExamStudents(students, { schoolName: "원일중", grade: "중2" }).map(student => student.id))
    .toEqual([1]);
});

it("shows the semester only once for new and legacy exam titles", () => {
  const exam = { schoolName: "원일중", grade: "중2", academicYear: 2026, semester: 2 };
  expect(schoolExamLabel({ ...exam, title: "중간고사" }))
    .toBe("원일중 · 중2 · 2026 2학기 중간고사");
  expect(schoolExamLabel({ ...exam, title: "중간고사 2학기" }))
    .toBe("원일중 · 중2 · 2026 중간고사 2학기");
});
