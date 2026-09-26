import { expect, it } from "vitest";
import { compareSchoolExamNames, schoolExamMonthCells, shiftSchoolExamMonth } from "./schoolExamCalendar";

it("sorts registered exams by displayed Korean school and grade names", () => {
  const common = { academicYear: 2026, semester: 2, title: "기말고사" };
  const exams = [
    { ...common, schoolName: "원일중", grade: "중3" },
    { ...common, schoolName: "석수중", grade: "중2" },
    { ...common, schoolName: "원일중", grade: "중1" },
    { ...common, schoolName: "석수중", grade: "중1" },
  ];
  expect(exams.sort(compareSchoolExamNames).map(exam => `${exam.schoolName} ${exam.grade}`))
    .toEqual(["석수중 중1", "석수중 중2", "원일중 중1", "원일중 중3"]);
});

it("places examination dates in Sunday-first month cells", () => {
  const november = schoolExamMonthCells("2026-11");
  expect(november.slice(0, 8)).toEqual([
    "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
    "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
  ]);
  expect(november).toContain("2026-11-10");
  expect(november).toContain("2026-11-18");
  expect(november.length % 7).toBe(0);
});

it("shifts calendar months across year boundaries", () => {
  expect(shiftSchoolExamMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftSchoolExamMonth("2026-01", -1)).toBe("2025-12");
});
