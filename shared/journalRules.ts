export const attendanceStatusValues = [
  "not_entered",
  "present",
  "absent",
  "not_registered",
  "holiday",
  "closed",
  "makeup",
  "makeup_double",
] as const;

/** 자동 계산되는 공휴일은 관리자 입력 메뉴에서 선택하지 않는다. */
export const selectableAttendanceStatusValues = attendanceStatusValues.filter(status => status !== "holiday") as Exclude<AttendanceStatus, "holiday">[];

export type AttendanceStatus = (typeof attendanceStatusValues)[number];

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  not_entered: "등원 전",
  present: "출석",
  absent: "결석",
  not_registered: "미등록",
  holiday: "공휴일",
  closed: "휴강",
  makeup: "출석+보강",
  makeup_double: "출석+보강×2",
};

/** 관리자·보호자 화면에서 일관되게 사용하는 출석 상태 배지 색상이다. */
export function attendanceStatusBadgeClass(status: AttendanceStatus | null | undefined) {
  return `attendance-status-badge attendance-status-${status ?? "not_entered"}`;
}

/** 보호자 모바일 카드에서는 긴 보강 표기를 두 줄로 읽기 쉽게 표시한다. */
export function mobileAttendanceStatusLabel(status: AttendanceStatus | null | undefined) {
  if (status === "makeup") return "출석+\n보강";
  if (status === "makeup_double") return "출석+\n보강×2";
  return attendanceStatusLabels[status ?? "not_entered"];
}

export type JournalCompleteness = {
  state: "complete" | "attention" | "not_required";
  missingFields: Array<"attendance" | "content">;
  /** 임시 저장은 내용이 있어도 작성 완료로 집계하지 않는다. */
  isDraft?: boolean;
};

export function getJournalCompleteness(
  attendanceStatus: AttendanceStatus | null | undefined,
  content: string | null | undefined,
  homework: string | null | undefined,
  isDraft = false,
): JournalCompleteness {
  if (attendanceStatus === "absent" || attendanceStatus === "not_registered" || attendanceStatus === "holiday" || attendanceStatus === "closed") {
    return { state: "not_required", missingFields: [] };
  }
  if (isDraft) return { state: "attention", missingFields: [], isDraft: true };
  // 출석 입력 여부와 수업일지 완료 여부는 별도 업무다. 출석이 미입력이어도
  // 수업 내용이 작성됐으면 수업일지에서는 완료로 표시한다.
  if (content?.trim()) return { state: "complete", missingFields: [] };
  // 과제는 보호자 안내를 위한 선택 입력으로, 수업일지의 완료 여부에는 영향을 주지 않는다.
  return { state: "attention", missingFields: ["content"] };
}

export function isJournalWriteBlocked(
  attendanceStatus: AttendanceStatus | null | undefined,
  content: string,
  homework: string,
  notes: string,
): boolean {
  const hasJournalValue = Boolean(content.trim() || homework.trim() || notes.trim());
  return hasJournalValue && (attendanceStatus === "absent" || attendanceStatus === "not_registered" || attendanceStatus === "holiday" || attendanceStatus === "closed");
}

export function getMonday(isoDate: string): string {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  const weekday = value.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  value.setUTCDate(value.getUTCDate() + diff);
  return value.toISOString().slice(0, 10);
}

export function getHistoricalLessonCount(input: { currentSettledCount: number; requestedWeekStart: string; currentWeekStart: string; requestedWeekSessions: number; laterSettledWeeks: Array<{ weekStart: string; sessionCount: number }> }) {
  if (input.requestedWeekStart >= input.currentWeekStart) return input.currentSettledCount + input.requestedWeekSessions;
  const sessionsSettledAfterRequested = input.laterSettledWeeks
    .filter(item => item.weekStart > input.requestedWeekStart && item.weekStart < input.currentWeekStart)
    .reduce((sum, item) => sum + item.sessionCount, 0);
  return input.currentSettledCount - sessionsSettledAfterRequested;
}

export function getPreviousWeekStart(isoDate: string): string {
  const value = new Date(`${getMonday(isoDate)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

export function getBusinessWeekDates(isoDate: string): string[] {
  const monday = new Date(`${getMonday(isoDate)}T00:00:00.000Z`);
  return Array.from({ length: 5 }, (_, index) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

export function getWeeklyDates(isoDate: string, includeWeekend = false): string[] {
  const monday = new Date(`${getMonday(isoDate)}T00:00:00.000Z`);
  const length = includeWeekend ? 7 : 5;
  return Array.from({ length }, (_, index) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

/** 수업일지 화면의 빠른 작업 범위: 기준일의 직전·당일·다음 입력 가능 날짜. */
export function getJournalFocusDates(isoDate: string, includeWeekend = false): string[] {
  return [
    getAdjacentJournalDate(isoDate, -1, includeWeekend),
    isoDate,
    getAdjacentJournalDate(isoDate, 1, includeWeekend),
  ];
}

export function chooseJournalClassId(groups: Array<{ id: number; subject: string }>, rememberedId: number | undefined, defaultSubject = "영어") {
  return groups.find(group => group.id === rememberedId)?.id ?? groups.find(group => group.subject === defaultSubject)?.id ?? groups[0]?.id;
}

export function chooseRememberedGrade(grades: string[], rememberedGrade: string | undefined) {
  return rememberedGrade && grades.includes(rememberedGrade) ? rememberedGrade : grades[0];
}

export function getJournalDeletionTargetDates(currentDate: string, sourceDates: string[], includeWeekend: boolean, blockedDates: Set<string>) {
  const lastSourceDate = sourceDates.at(-1) ?? currentDate;
  const targets: string[] = [];
  for (let date = currentDate; date <= lastSourceDate && targets.length < sourceDates.length; date = getAdjacentJournalDate(date, 1, true)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isWeekend = day === 0 || day === 6;
    if ((!isWeekend || includeWeekend) && !blockedDates.has(date)) targets.push(date);
  }
  return targets;
}

export function getUnenteredAttendanceDates(
  dates: string[],
  entries: Array<{ journalDate: string; status: AttendanceStatus }>,
): string[] {
  const statusByDate = new Map(entries.map(entry => [entry.journalDate, entry.status]));
  return Array.from(new Set(dates)).filter(date => {
    const status = statusByDate.get(date);
    return !status || status === "not_entered";
  });
}

export function getNextBusinessDate(journalDate: string) {
  const value = new Date(`${journalDate}T00:00:00.000Z`);
  do value.setUTCDate(value.getUTCDate() + 1); while ([0, 6].includes(value.getUTCDay()));
  return value.toISOString().slice(0, 10);
}

/** 수업일지 팝업의 앞·뒤 날짜를 구한다. 주말 입력이 꺼진 경우 토·일은 건너뛴다. */
export function getAdjacentJournalDate(journalDate: string, direction: -1 | 1, includeWeekend: boolean): string {
  const value = new Date(`${journalDate}T00:00:00.000Z`);
  do value.setUTCDate(value.getUTCDate() + direction); while (!includeWeekend && [0, 6].includes(value.getUTCDay()));
  return value.toISOString().slice(0, 10);
}

/** 현재 일지를 새로 삽입할 때, 이후 기록을 날짜 충돌 없이 다음 입력 가능 날짜로 옮기는 순서를 구한다. */
export function getJournalInsertionMoves(sourceDates: string[], includeWeekend: boolean, unavailableDates: ReadonlySet<string> = new Set()) {
  const dates = Array.from(new Set(sourceDates)).sort();
  const getNextAvailableDate = (journalDate: string) => {
    let targetDate = getAdjacentJournalDate(journalDate, 1, includeWeekend);
    for (let safety = 0; safety < 366; safety += 1) {
      if (!unavailableDates.has(targetDate)) return targetDate;
      targetDate = getAdjacentJournalDate(targetDate, 1, includeWeekend);
    }
    throw new Error("수업일지 추가 대상 날짜를 찾을 수 없습니다.");
  };
  let previousTarget: string | null = null;
  const moves = dates.map(sourceDate => {
    let targetDate = getNextAvailableDate(sourceDate);
    while (previousTarget && targetDate <= previousTarget) targetDate = getNextAvailableDate(previousTarget);
    previousTarget = targetDate;
    return { sourceDate, targetDate };
  });
  return moves.reverse();
}

/** 미입력 전용 목록은 오늘과 과거에 실제 입력이 필요한 날짜만 대상으로 한다. */
export function isJournalAttentionDue(journalDate: string, today: string, state: JournalCompleteness["state"]): boolean {
  return journalDate <= today && state === "attention";
}

export function getNextScheduledClassDate(journalDate: string, meetingDays: number[]) {
  const validDays = Array.from(new Set(meetingDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
  if (!validDays.length) return null;
  const value = new Date(`${journalDate}T00:00:00.000Z`);
  for (let offset = 1; offset <= 14; offset += 1) {
    value.setUTCDate(value.getUTCDate() + 1);
    if (validDays.includes(value.getUTCDay())) return value.toISOString().slice(0, 10);
  }
  return null;
}

export function shouldTransferJournalForAttendance(
  status: AttendanceStatus,
  journal: { content?: string | null; homework?: string | null; notes?: string | null },
) {
  const hasJournalValue = Boolean(journal.content?.trim() || journal.homework?.trim() || journal.notes?.trim());
  return hasJournalValue && (status === "absent" || status === "not_registered" || status === "holiday" || status === "closed");
}

export function shouldPullJournalForAttendance(previousStatus: AttendanceStatus | undefined, nextStatus: AttendanceStatus) {
  return (previousStatus === "absent" || previousStatus === "not_registered" || previousStatus === "holiday" || previousStatus === "closed")
    && (nextStatus === "present" || nextStatus === "makeup" || nextStatus === "makeup_double");
}

export function findJournalTransferConflict(
  sources: Array<{ classGroupId: number; content?: string | null; homework?: string | null; notes?: string | null }>,
  targets: Array<{ classGroupId: number; content?: string | null; homework?: string | null; notes?: string | null }>,
) {
  const targetByClass = new Map(targets.map(row => [row.classGroupId, row]));
  return sources.find(source => {
    const target = targetByClass.get(source.classGroupId);
    return Boolean(target && shouldTransferJournalForAttendance("absent", target));
  })?.classGroupId ?? null;
}

export function isDateVisibleToParent(journalDate: string, today: string): boolean {
  return journalDate <= today;
}

/** 최종 저장한 수업일지는 날짜와 관계없이 보호자에게 공개한다. 임시 저장은 항상 비공개다. */
export function isFinalJournalVisibleToParent(isDraft: boolean | null | undefined): boolean {
  return !isDraft;
}

/** 미래 수업과 당일 등원 전 수업은 보호자 화면에서 예정으로 표시한다. */
export function isJournalScheduledForParent(
  journalDate: string,
  today: string,
  attendanceStatus: AttendanceStatus | null | undefined,
  arrivalTime: string | null | undefined,
): boolean {
  const attendanceUnconfirmed =
    !arrivalTime && (!attendanceStatus || attendanceStatus === "not_entered");
  return journalDate >= today && attendanceUnconfirmed;
}

/** 미래 날짜라도 공식 공휴일·등록 휴강 같은 일정 안내는 보호자에게 미리 공개한다. */
export function isCalendarScheduleVisibleToParent(journalDate: string, today: string, hasCalendarEvent: boolean): boolean {
  return isDateVisibleToParent(journalDate, today) || hasCalendarEvent;
}

/** 학원의 등원 시간 입력은 기본적으로 오후 기준이다. 예: 3:15 → 15:15 */
export function normalizeAfternoonArrivalTime(arrivalTime: string): string {
  const parts = arrivalTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return arrivalTime.trim();
  const rawHour = Number(parts[1]);
  const hour = rawHour >= 1 && rawHour <= 11 ? rawHour + 12 : rawHour;
  if (hour > 23 || Number(parts[2]) > 59) return arrivalTime.trim();
  return `${String(hour).padStart(2, "0")}:${parts[2]}`;
}

/** 오후 기준으로 저장·계산되는 시각을 사용자가 입력한 12시간 형식으로 보여 준다. 예: 15:15 → 3:15 */
export function formatArrivalTimeForDisplay(arrivalTime: string): string {
  const normalized = normalizeAfternoonArrivalTime(arrivalTime);
  const parts = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return arrivalTime.trim();
  const hour = Number(parts[1]);
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${parts[2]}`;
}

export function formatAttendanceProgressLabel(
  status: AttendanceStatus | null | undefined,
  arrivalTime: string | null | undefined,
  journalDate: string,
  now: Date,
  today: string,
  departureTime?: string | null,
): string {
  if (status === "absent") return "결석";
  if (status === "not_registered") return "미등록";
  const lessonDuration = formatLessonDuration(arrivalTime, departureTime);
  if (lessonDuration) return lessonDuration;
  return formatArrivalElapsed(arrivalTime, journalDate, now, today) ?? "—";
}

export function formatLessonDuration(
  arrivalTime: string | null | undefined,
  departureTime: string | null | undefined,
): string | null {
  if (!arrivalTime || !departureTime) return null;
  const toMinutes = (value: string) => {
    const match = normalizeAfternoonArrivalTime(value).match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const arrivalMinutes = toMinutes(arrivalTime);
  const departureMinutes = toMinutes(departureTime);
  if (arrivalMinutes === null || departureMinutes === null) return null;
  const durationMinutes = departureMinutes - arrivalMinutes;
  if (durationMinutes < 0) return null;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `수업 ${hours}시간 ${minutes}분`;
}

export function formatArrivalElapsed(
  arrivalTime: string | null | undefined,
  journalDate: string,
  now: Date,
  today: string,
): string | null {
  if (!arrivalTime) return null;
  const normalizedTime = normalizeAfternoonArrivalTime(arrivalTime);
  const displayTime = formatArrivalTimeForDisplay(arrivalTime);
  if (journalDate !== today) return `등원 ${displayTime}`;

  const arrivalAt = new Date(`${journalDate}T${normalizedTime}:00+09:00`);
  const elapsedMinutes = Math.floor((now.getTime() - arrivalAt.getTime()) / 60_000);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) return `등원 ${displayTime}`;

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `등원 후 ${hours}시간 ${minutes}분`;
}
