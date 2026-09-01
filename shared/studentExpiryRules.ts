function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** 총 수업 횟수를 변경한 날부터 60일 뒤의 만료확인일을 구한다. */
export function getValidUntilAfterTotalCountChange(today: string, days = 60) {
  const value = parseIsoDate(today);
  value.setUTCDate(value.getUTCDate() + days);
  return toIsoDate(value);
}

/** 만료확인일까지 남은 달력 일수다. 만료일 당일은 0일로 계산한다. */
export function getDaysUntilValidUntil(validUntil: string, today: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseIsoDate(validUntil).getTime() - parseIsoDate(today).getTime()) / millisecondsPerDay);
}

/** 오늘부터 지정 일수 이내에 만료확인이 필요한 날짜인지 판단한다. */
export function isValidUntilDueSoon(validUntil: string | null | undefined, today: string, withinDays = 30) {
  if (!validUntil) return false;
  const remainingDays = getDaysUntilValidUntil(validUntil, today);
  return remainingDays >= 0 && remainingDays <= withinDays;
}
