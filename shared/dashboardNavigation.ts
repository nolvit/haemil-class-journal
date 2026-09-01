export function dashboardAttendanceHref(journalDate: string, studentId: number) {
  return `/attendance?date=${encodeURIComponent(journalDate)}&studentId=${studentId}`;
}

export function dashboardJournalHref(journalDate: string, studentId: number, classGroupId: number) {
  return `/journal?date=${encodeURIComponent(journalDate)}&studentId=${studentId}&classGroupId=${classGroupId}`;
}

export function dashboardStudentJournalHref(journalDate: string, studentId: number) {
  return `/journal?date=${encodeURIComponent(journalDate)}&studentId=${studentId}`;
}

export function shouldShowDashboardPendingList(count: number) {
  return count > 0 && count <= 10;
}
