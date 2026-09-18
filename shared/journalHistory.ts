/** Calendar weeks use Korea's date, not the browser's timezone or the page's selected week. */
export function getKoreanJournalDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export type JournalHistoryWeek = {
  weekStart: string;
  weekEnd: string;
  label: string;
  dates: string[];
};

/** Exactly four Monday-Sunday weeks, newest first. This is not a rolling 28-day window. */
export function getJournalHistoryWeeks(referenceDate: string): JournalHistoryWeek[] {
  const anchor = new Date(`${referenceDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
    Number.isNaN(anchor.getTime()) ||
    anchor.toISOString().slice(0, 10) !== referenceDate
  ) {
    throw new RangeError("올바른 기준 날짜가 필요합니다.");
  }
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  const dateAt = (offset: number) => {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  return Array.from({ length: 4 }, (_, index) => ({
    weekStart: dateAt(-7 * index),
    weekEnd: dateAt(-7 * index + 6),
    label: index === 0 ? "이번 주" : `${index}주 전`,
    dates: Array.from({ length: 7 }, (_, day) => dateAt(-7 * index + day)),
  }));
}

/** Match both IDs. Names and the outer page's subject filter must never select the record. */
export function selectJournalHistoryDays<
  T extends { student: { id: number }; classGroup: { id: number } },
>(
  week: JournalHistoryWeek,
  days: ReadonlyArray<{ journalDate: string; rows: ReadonlyArray<T> }>,
  studentId: number,
  classGroupId: number,
): Array<{ journalDate: string; row: T | undefined }> {
  const daysByDate = new Map(days.map(day => [day.journalDate, day.rows]));
  return week.dates.map(journalDate => ({
    journalDate,
    row: daysByDate.get(journalDate)?.find(
      row => row.student.id === studentId && row.classGroup.id === classGroupId,
    ),
  }));
}

export type JournalHistoryTarget = { studentId: number; classGroupId: number };

export function parseJournalHistoryTarget(search: string): JournalHistoryTarget | null {
  const query = new URLSearchParams(search);
  const readId = (name: string) => {
    const values = query.getAll(name);
    if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) return null;
    const value = Number(values[0]);
    return Number.isSafeInteger(value) ? value : null;
  };
  const studentId = readId("studentId");
  const classGroupId = readId("classGroupId");
  return studentId !== null && classGroupId !== null ? { studentId, classGroupId } : null;
}

/** No student names, lesson content, credentials, or parent tokens in the URL. */
export function buildJournalHistoryUrl(studentId: number, classGroupId: number): string {
  if (![studentId, classGroupId].every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new RangeError("올바른 학생과 과목이 필요합니다.");
  }
  return `/journal/history?${new URLSearchParams({ studentId: String(studentId), classGroupId: String(classGroupId) })}`;
}
