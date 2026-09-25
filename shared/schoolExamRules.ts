import { isEnglishFocusedLesson } from "./mathProgress";

export type ExamLessonEvidence = {
  journalDate: string;
  classSubject: string;
  content: string | null;
  isDraft: boolean;
  attendanceStatus: string | null;
  mathSessionKind?: "math" | "english" | null;
};

export type LessonCountResult = {
  count: number | null;
  status: "auto" | "unavailable" | "review";
};

const attended = new Set(["present", "makeup", "makeup_double"]);

export function lessonSubject(row: ExamLessonEvidence): string | null {
  const subject = row.classSubject.trim().replace(/^초등\s+/, "");
  if (subject === "국사과") return null;
  if (subject === "수학" &&
      (row.mathSessionKind === "english" || isEnglishFocusedLesson(row.content ?? "")))
    return "영어";
  return subject || null;
}

/** Count recorded, attended subject sessions strictly before the exam date. */
export function countLessonsBeforeExam(
  rows: ExamLessonEvidence[],
  subject: string,
  examDate: string,
  today: string
): LessonCountResult {
  const target = subject.trim();
  const relevant = rows.filter(row =>
    row.journalDate < examDate && row.journalDate <= today && !row.isDraft &&
    attended.has(row.attendanceStatus ?? "") && Boolean(row.content?.trim())
  );
  const ambiguous = relevant.some(row =>
    row.classSubject.trim().replace(/^초등\s+/, "") === "국사과" &&
    ["국어", "사회", "과학"].includes(target)
  );
  const matching = relevant.filter(row => lessonSubject(row) === target);
  if (!matching.length) return { count: null, status: ambiguous ? "review" : "unavailable" };
  const byDate = new Map<string, ExamLessonEvidence[]>();
  for (const row of relevant)
    byDate.set(row.journalDate, [...(byDate.get(row.journalDate) ?? []), row]);
  const doubleAmbiguous = matching.some(row =>
    row.attendanceStatus === "makeup_double" &&
    new Set((byDate.get(row.journalDate) ?? []).map(lessonSubject)).size > 1
  );
  if (ambiguous || doubleAmbiguous) return { count: null, status: "review" };
  return {
    count: matching.reduce((sum, row) => sum + (row.attendanceStatus === "makeup_double" ? 2 : 1), 0),
    status: "auto",
  };
}

export function examComparison(scores: number[], schoolAverage: number | null) {
  if (!scores.length) return { count: 0, academyAverage: null, difference: null };
  const academyAverage = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10;
  return {
    count: scores.length,
    academyAverage,
    difference: schoolAverage === null ? null : Math.round((academyAverage - schoolAverage) * 10) / 10,
  };
}
