import {
  isEnglishFocusedLesson,
  mathItemLabel,
  mathUnitOptions,
  type MathJournalPayload,
} from "./mathProgress";
import { nextMathJournalEntryForEmptyJournal, suggestMathJournalCopy } from "./mathJournalCopy";

export type DashboardMathJournal = {
  studentId: number;
  studentName: string;
  studentGrade: string;
  classGroupId: number;
  journalDate: string;
  content: string | null;
  mathProgress: MathJournalPayload | null;
};

export type DashboardMathExamTarget = {
  studentId: number;
  studentName: string;
  studentGrade: string;
  classGroupId: number;
  sourceDate: string;
  fromYesterday: boolean;
  exams: string[];
};

export function previousDashboardDate(date: string) {
  const previous = new Date(`${date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function pendingExamLabels(row: DashboardMathJournal) {
  if (row.mathProgress?.sessionKind === "english") return [];
  const labels = new Set<string>();
  for (const entry of row.mathProgress?.entries ?? []) {
    if (entry.state !== "active" ||
        !/:(?:test:\d+|preliminary|practicePreliminary|final[12])$/.test(entry.key)) continue;
    const [, unit] = entry.key.split(":");
    const label = mathItemLabel(entry.key, row.journalDate);
    labels.add(/:test:\d+$/.test(entry.key) ? label : `${unit}단원 ${label}`);
  }

  // Older journals and explicitly written reassessments do not always have
  // selection data. Only standalone assessment lines count as a planned test.
  const text = row.mathProgress?.freeText ?? row.content ?? "";
  let unit = "";
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.normalize("NFKC").trim().replace(/^[-•]\s*/, "");
    const header = line.match(/^\[\s*중\s*[123]\s*-\s*[12]\s*\/[^\]]*\/\s*(\d+)\s*(?:-\s*\d+)?\s*단원\s*\]/);
    if (header) {
      unit = header[1];
      line = line.slice(header[0].length).trim();
      if (!line) continue;
    }
    const match = line.match(/^(\d+\s*-\s*\d+\s*소단원\s*(?:재)?평가|중단원\s*(?:예비\s*)?(?:재)?평가|실력\s*문제\s*예비\s*평가|[12]\s*차\s*최종\s*평가|최종\s*평가)(.*)$/);
    if (!match) continue;
    const remainder = match[2].trim();
    if (remainder && !/^(?:[·:—-]\s*)?(?:예정|진행\s*중|완료|건너뜀|미실시|취소)(?:\s|$)/.test(remainder)) continue;
    if (/^(?:[·:—-]\s*)?(?:완료|건너뜀|미실시|취소)(?:\s|$)/.test(remainder)) continue;
    const label = match[1].replace(/\s+/g, " ");
    labels.add(/^\d+\s*-/.test(label) || !unit ? label : `${unit}단원 ${label}`);
  }
  return Array.from(labels);
}

function isEnglishJournal(row: DashboardMathJournal) {
  return row.mathProgress?.sessionKind === "english" ||
    isEnglishFocusedLesson(row.content ?? "");
}

function nextExamAfterCompletedStep(row: DashboardMathJournal, date: string) {
  const progress = row.mathProgress ?? (() => {
    const suggestion = suggestMathJournalCopy(row.content ?? "", row.journalDate);
    return suggestion && {
      version: 1 as const,
      sessionKind: "math" as const,
      freeText: suggestion.freeText,
      entries: suggestion.entries,
    };
  })();
  const next = nextMathJournalEntryForEmptyJournal(progress, date);
  if (!next) return null;
  const [term, unit] = next.key.split(":");
  const option = mathUnitOptions(term!, Number(unit), date)
    .find(item => item.key === next.key);
  if (option?.sector !== "assessment") return null;
  return /:test:\d+$/.test(next.key) ? option.label : `${unit}단원 ${option.label}`;
}

function previousExamLabels(row: DashboardMathJournal, date: string) {
  const unfinished = pendingExamLabels(row);
  if (unfinished.length) return unfinished;
  const next = nextExamAfterCompletedStep(row, date);
  return next ? [next] : [];
}

/**
 * Only today's unfinished assessments are targets. When today's math journal
 * was replaced by an English-focused lesson, also show yesterday's unfinished
 * assessment or the next assessment after a completed step. No journal data changes.
 */
export function dashboardMathExamTargets(
  rows: DashboardMathJournal[],
  date: string
): DashboardMathExamTarget[] {
  const previousDate = previousDashboardDate(date);
  const byStudent = new Map<number, DashboardMathJournal[]>();
  for (const row of rows) {
    if (row.journalDate !== date && row.journalDate !== previousDate) continue;
    const studentRows = byStudent.get(row.studentId) ?? [];
    studentRows.push(row);
    byStudent.set(row.studentId, studentRows);
  }

  const targets: DashboardMathExamTarget[] = [];
  for (const studentRows of Array.from(byStudent.values())) {
    const todayRows = studentRows.filter(row => row.journalDate === date);
    const todayExams = Array.from(new Set(todayRows.flatMap(pendingExamLabels)));
    const fromYesterday = !todayExams.length && todayRows.some(isEnglishJournal);
    const sourceRows = fromYesterday
      ? studentRows.filter(row => row.journalDate === previousDate)
      : todayRows;
    const labeledRows = sourceRows.map(row => ({
      row,
      labels: fromYesterday ? previousExamLabels(row, date) : pendingExamLabels(row),
    }));
    const exams = Array.from(new Set(labeledRows.flatMap(item => item.labels)));
    if (!exams.length) continue;
    const source = labeledRows.find(item => item.labels.length)!.row;
    targets.push({
      studentId: source.studentId,
      studentName: source.studentName,
      studentGrade: source.studentGrade,
      classGroupId: source.classGroupId,
      sourceDate: source.journalDate,
      fromYesterday,
      exams,
    });
  }
  return targets.sort((a, b) =>
    a.studentGrade.localeCompare(b.studentGrade, "ko") ||
    a.studentName.localeCompare(b.studentName, "ko")
  );
}
