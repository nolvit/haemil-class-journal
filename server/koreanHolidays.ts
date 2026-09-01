import Holidays from "date-holidays";

export type KoreanOfficialHoliday = {
  date: string;
  name: string;
  source: "official";
};

export type KoreanOfficialHolidaySchedule = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dates: string[];
};

type DistbeHoliday = {
  date?: unknown;
  name?: unknown;
  holiday?: unknown;
};

type CacheEntry = {
  records: KoreanOfficialHoliday[];
  expiresAt: number;
};

const koreanHolidays = new Holidays("KR");
const YEAR_CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const FALLBACK_CACHE_TTL_MS = 60 * 60 * 1_000;
const yearCache = new Map<number, CacheEntry>();
const fastLocalYearCache = new Map<number, KoreanOfficialHoliday[]>();
const pendingYearLoads = new Map<number, Promise<KoreanOfficialHoliday[]>>();

/**
 * 공개 원천을 사용할 수 없는 경우에도 2025·2026년의 연휴·선거일은 빠지지 않게 한다.
 * 그 밖의 날짜는 기존 date-holidays의 대한민국 public 데이터를 보조 수단으로 쓴다.
 */
const verifiedFallbackRecords: KoreanOfficialHoliday[] = [
  ["2025-01-01", "새해"], ["2025-01-27", "임시공휴일"], ["2025-01-28", "설날"], ["2025-01-29", "설날"], ["2025-01-30", "설날"], ["2025-03-01", "삼일절"], ["2025-03-03", "삼일절 (대체공휴일)"], ["2025-05-05", "어린이날 · 부처님오신날"], ["2025-05-06", "부처님오신날 (대체공휴일)"], ["2025-06-03", "제21대 대통령선거"], ["2025-06-06", "현충일"], ["2025-08-15", "광복절"], ["2025-10-03", "개천절"], ["2025-10-05", "추석"], ["2025-10-06", "추석"], ["2025-10-07", "추석"], ["2025-10-08", "추석 (대체공휴일)"], ["2025-10-09", "한글날"], ["2025-12-25", "크리스마스"],
  ["2026-01-01", "새해"], ["2026-02-16", "설날"], ["2026-02-17", "설날"], ["2026-02-18", "설날"], ["2026-03-01", "삼일절"], ["2026-03-02", "삼일절 (대체공휴일)"], ["2026-05-01", "노동절"], ["2026-05-05", "어린이날"], ["2026-05-24", "부처님오신날"], ["2026-05-25", "부처님오신날 (대체공휴일)"], ["2026-06-03", "제9회 전국동시지방선거"], ["2026-06-06", "현충일"], ["2026-07-17", "제헌절"], ["2026-08-15", "광복절"], ["2026-08-17", "광복절 (대체공휴일)"], ["2026-09-24", "추석"], ["2026-09-25", "추석"], ["2026-09-26", "추석"], ["2026-10-03", "개천절"], ["2026-10-05", "개천절 (대체공휴일)"], ["2026-10-09", "한글날"], ["2026-12-25", "크리스마스"],
].map(([date, name]) => ({ date, name, source: "official" }));

function normalizeRecords(records: KoreanOfficialHoliday[]) {
  const namesByDate = new Map<string, string[]>();
  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !record.name.trim()) continue;
    const existing = namesByDate.get(record.date) ?? [];
    if (!existing.includes(record.name.trim())) existing.push(record.name.trim());
    namesByDate.set(record.date, existing);
  }
  return Array.from(namesByDate, ([date, names]) => ({ date, name: names.join(" · "), source: "official" as const })).sort((a, b) => a.date.localeCompare(b.date));
}

function nextIsoDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** 같은 명칭이 연속하는 법정공휴일은 하나의 관리자 선택 기간으로 묶는다. */
export function groupKoreanHolidaySchedules(records: KoreanOfficialHoliday[]): KoreanOfficialHolidaySchedule[] {
  const schedules: KoreanOfficialHolidaySchedule[] = [];
  for (const record of normalizeRecords(records)) {
    const previous = schedules.at(-1);
    if (previous && previous.name === record.name && nextIsoDate(previous.endDate) === record.date) {
      previous.endDate = record.date;
      previous.dates.push(record.date);
      continue;
    }
    schedules.push({ id: record.date, name: record.name, startDate: record.date, endDate: record.date, dates: [record.date] });
  }
  return schedules.map(schedule => ({ ...schedule, id: `${schedule.startDate}:${schedule.endDate}:${schedule.name}` }));
}

export function parseOfficialHolidayPayload(payload: unknown): KoreanOfficialHoliday[] {
  if (!Array.isArray(payload)) return [];
  return normalizeRecords(payload.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as DistbeHoliday;
    return row.holiday === true && typeof row.date === "string" && typeof row.name === "string"
      ? [{ date: row.date, name: row.name, source: "official" as const }]
      : [];
  }));
}

function getLibraryFallback(year: number) {
  const sourceRows = koreanHolidays.getHolidays(year)
    .filter(holiday => holiday.type === "public")
    .map(holiday => ({ date: holiday.date.slice(0, 10), name: holiday.name, source: "official" as const }));
  const verifiedRows = verifiedFallbackRecords.filter(record => record.date.startsWith(`${year}-`));
  return normalizeRecords([...sourceRows, ...verifiedRows]);
}

function getFastLocalHolidayYear(year: number) {
  const cached = fastLocalYearCache.get(year);
  if (cached) return cached;
  const records = getLibraryFallback(year);
  fastLocalYearCache.set(year, records);
  return records;
}

async function loadOfficialHolidayYear(year: number): Promise<KoreanOfficialHoliday[]> {
  const cached = yearCache.get(year);
  if (cached && cached.expiresAt > Date.now()) return cached.records;
  const pending = pendingYearLoads.get(year);
  if (pending) return pending;

  const loading = (async () => {
    try {
      const response = await fetch(`https://holidays.dist.be/${year}.json`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`official holiday response ${response.status}`);
      const records = parseOfficialHolidayPayload(await response.json());
      if (!records.length) throw new Error("official holiday payload is empty");
      yearCache.set(year, { records, expiresAt: Date.now() + YEAR_CACHE_TTL_MS });
      return records;
    } catch (error) {
      const records = getLibraryFallback(year);
      console.warn(`[Holidays] Official ${year} data unavailable; using local fallback.`, error);
      yearCache.set(year, { records, expiresAt: Date.now() + FALLBACK_CACHE_TTL_MS });
      return records;
    } finally {
      pendingYearLoads.delete(year);
    }
  })();
  pendingYearLoads.set(year, loading);
  return loading;
}

export async function getKoreanHolidaySchedules(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return [];
  return groupKoreanHolidaySchedules(await loadOfficialHolidayYear(year));
}

export async function getKoreanHoliday(isoDate: string): Promise<KoreanOfficialHoliday | null> {
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isInteger(year) || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return (await loadOfficialHolidayYear(year)).find(holiday => holiday.date === isoDate) ?? null;
}

export async function isKoreanHoliday(isoDate: string) {
  return Boolean(await getKoreanHoliday(isoDate));
}

/** 주말은 기본 수업일이 아니므로 법정공휴일을 자동 출석 상태로 적용하지 않는다. */
export function shouldAutomaticallyApplyLegalHoliday(isoDate: string) {
  const weekday = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export async function getKoreanHolidayDates(isoDates: string[]) {
  const uniqueDates = Array.from(new Set(isoDates)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const years = Array.from(new Set(uniqueDates.map(date => Number(date.slice(0, 4)))));
  // 업무 현황·출석·수업일지의 핫패스에서는 외부 공휴일 API를 기다리지 않는다.
  // 검증된 연도별 목록과 date-holidays 로컬 데이터로 즉시 판정하고, 관리자 공휴일 일정 선택 화면만 공식 원천을 조회한다.
  const records = years.flatMap(getFastLocalHolidayYear);
  const requested = new Set(uniqueDates);
  return new Map(records.filter(record => requested.has(record.date)).map(record => [record.date, record]));
}

/** 테스트에서 외부 데이터 요청 없이 정규화 로직을 검증할 때 사용한다. */
export function getVerifiedFallbackHoliday(isoDate: string) {
  return normalizeRecords(verifiedFallbackRecords).find(holiday => holiday.date === isoDate) ?? null;
}
