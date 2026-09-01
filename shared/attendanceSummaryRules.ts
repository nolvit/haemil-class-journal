import type { AttendanceStatus } from "./journalRules";

export function getAttendanceSessionUnits(status: AttendanceStatus | null | undefined) {
  if (status === "present") return 1;
  if (status === "makeup") return 1.5;
  if (status === "makeup_double") return 2;
  return 0;
}

export function isAttendanceDay(status: AttendanceStatus | null | undefined) {
  return status === "present" || status === "makeup" || status === "makeup_double";
}

/** 출석 행이 없거나 명시적으로 미입력인 경우, 출석 입력 업무의 미입력 대상으로 본다. */
export function isAttendancePending(status: AttendanceStatus | null | undefined) {
  return !status || status === "not_entered";
}

/**
 * 공식 공휴일과 학원 휴강일은 같은 방식으로 주간 목표에서 한 번만 제외한다.
 * 원래 주간 목표가 더 작으면 그 목표를 유지한다.
 */
export function getHolidayAdjustedTarget(baseTarget: number, excludedWeekdayCount: number) {
  return Math.max(0, Math.min(baseTarget, 5 - Math.max(0, excludedWeekdayCount)));
}

export function buildParentAttendanceMessage(input: {
  target: number;
  sessionCount: number;
  attendanceDayCount: number;
  makeupCount: number;
  makeupDoubleCount: number;
}) {
  const { target, sessionCount, attendanceDayCount, makeupCount, makeupDoubleCount } = input;
  const count = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (!target) return "이번 주의 학습 기록을 확인해 주세요.";

  const reachedTarget = sessionCount >= target;
  const hasMakeup = makeupCount > 0 || makeupDoubleCount > 0;
  const makeupDescription = makeupDoubleCount > 0
    ? makeupCount > 0 ? "보강과 보강×2" : "보강×2"
    : "보강";
  const makeupConnector = makeupDescription === "보강" ? "으로" : "로";

  if (hasMakeup) {
    const base = `이번 주 출석은 ${count(target)}회 목표 중 ${count(sessionCount)}회입니다. 출석일은 ${attendanceDayCount}일이나 ${makeupDescription}${makeupConnector} `;
    return reachedTarget
      ? `${base}목표 수업 횟수에 도달했습니다. 훌륭해요!`
      : `${base}비록 목표 수업 횟수에 도달하지 못했지만 잘했어요!`;
  }
  if (attendanceDayCount / target <= 0.75) return `이번 주 출석은 ${count(target)}회 목표 중 ${count(sessionCount)}회입니다. 출석률을 더 높여봅시다!`;
  if (reachedTarget) return `이번 주 출석 목표 ${count(target)}회를 모두 달성했습니다. 잘했어요!`;
  return `이번 주 출석은 ${count(target)}회 목표 중 ${count(sessionCount)}회입니다.`;
}
