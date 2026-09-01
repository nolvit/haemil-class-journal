export type ClosurePeriodLike = {
  id: number;
  startDate: string;
  endDate: string;
  name: string;
  description?: string | null;
  imageKey?: string | null;
  imageUrl?: string | null;
};

export function isIsoDateInRange(isoDate: string, startDate: string, endDate: string) {
  return isoDate >= startDate && isoDate <= endDate;
}

export function getClosureForDate<T extends ClosurePeriodLike>(isoDate: string, closures: T[]): T | null {
  return closures.find(closure => isIsoDateInRange(isoDate, closure.startDate, closure.endDate)) ?? null;
}

export function getClosureDatesInRange(closure: ClosurePeriodLike, dates: string[]) {
  return dates.filter(date => isIsoDateInRange(date, closure.startDate, closure.endDate));
}

/** 자동 공휴일·기간 휴강의 기본 상태를 그대로 저장하려는 요청인지 판별한다. */
export function matchesAutomaticCalendarStatus(requestedStatus: string, calendarStatus: string | null | undefined) {
  return Boolean(calendarStatus && requestedStatus === calendarStatus);
}

export function hasOverlappingClosureRange(
  startDate: string,
  endDate: string,
  existing: Array<Pick<ClosurePeriodLike, "id" | "startDate" | "endDate">>,
  ignoredId?: number,
) {
  return existing.some(closure => closure.id !== ignoredId && closure.startDate <= endDate && closure.endDate >= startDate);
}
