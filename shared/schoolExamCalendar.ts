import { schoolExamLabel } from "./schoolExamIdentity";

type NamedExam = Parameters<typeof schoolExamLabel>[0];

/** Compare the displayed exam names, including school and grade, in Korean numeric order. */
export function compareSchoolExamNames(a: NamedExam, b: NamedExam) {
  return schoolExamLabel(a).localeCompare(schoolExamLabel(b), "ko", { numeric: true });
}

/** Sunday-first dates for a month; nulls pad the first and last weeks. */
export function schoolExamMonthCells(month: string): Array<string | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year!, monthNumber! - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const cells: Array<string | null> = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++)
    cells.push(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftSchoolExamMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1)).toISOString().slice(0, 7);
}
