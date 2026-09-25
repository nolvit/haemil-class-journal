import { describe, expect, it } from "vitest";
import { getJournalHistoryWeeks, getKoreanJournalDate, selectJournalHistoryDays, buildJournalHistoryUrl, parseJournalHistoryTarget } from "../shared/journalHistory";

describe("journal history calendar", () => {
  it("uses the Korean date just before midnight", () => {
    expect(getKoreanJournalDate(new Date("2026-09-17T14:59:59Z"))).toBe("2026-09-17");
  });
  it("uses the Korean date from midnight", () => {
    expect(getKoreanJournalDate(new Date("2026-09-17T15:00:00Z"))).toBe("2026-09-18");
  });
  it("changes weeks on Monday in Korea rather than UTC", () => {
    const date = getKoreanJournalDate(new Date("2026-09-13T15:00:00Z"));
    expect(date).toBe("2026-09-14");
    expect(getJournalHistoryWeeks(date)[0].weekStart).toBe("2026-09-14");
  });
  it("shows the current week as week 3 and the next week as week 4 from Thursday", () => {
    expect(getJournalHistoryWeeks("2026-09-18").map(({ weekStart, weekEnd, label }) => ({ weekStart, weekEnd, label }))).toEqual([
      { weekStart: "2026-09-21", weekEnd: "2026-09-27", label: "4주차" },
      { weekStart: "2026-09-14", weekEnd: "2026-09-20", label: "3주차" },
      { weekStart: "2026-09-07", weekEnd: "2026-09-13", label: "2주차" },
      { weekStart: "2026-08-31", weekEnd: "2026-09-06", label: "1주차" },
    ]);
  });
  it("switches the four-week range on Thursday, not before", () => {
    const expected = getJournalHistoryWeeks("2026-09-14");
    for (const day of ["15", "16"]) {
      expect(getJournalHistoryWeeks(`2026-09-${day}`)).toEqual(expected);
    }
    expect(expected[0].weekStart).toBe("2026-09-14");
    expect(expected[0].label).toBe("4주차");
    const shifted = getJournalHistoryWeeks("2026-09-17");
    for (const day of ["18", "19", "20"])
      expect(getJournalHistoryWeeks(`2026-09-${day}`)).toEqual(shifted);
    expect(shifted[1].weekStart).toBe("2026-09-14");
    expect(shifted[1].label).toBe("3주차");
  });
  it("returns all 28 distinct dates including both weekend days", () => {
    const dates = getJournalHistoryWeeks("2026-09-18").flatMap(week => week.dates);
    expect(dates.length).toBe(28);
    expect(new Set(dates).size).toBe(28);
    expect(dates.includes("2026-09-19")).toBe(true);
    expect(dates.includes("2026-09-27")).toBe(true);
  });
  it("handles the December/January boundary", () => {
    const weeks = getJournalHistoryWeeks("2026-01-01");
    expect(weeks[0].weekStart).toBe("2026-01-05");
    expect(weeks[0].weekEnd).toBe("2026-01-11");
    expect(weeks[3].weekStart).toBe("2025-12-15");
  });
  it("handles leap day without shifting weekdays", () => {
    const week = getJournalHistoryWeeks("2024-02-29")[1];
    expect(week.weekStart).toBe("2024-02-26");
    expect(week.weekEnd).toBe("2024-03-03");
    expect(week.dates[3]).toBe("2024-02-29");
  });
  it("rejects impossible dates", () => {
    expect(() => getJournalHistoryWeeks("2026-02-30")).toThrow(RangeError);
    expect(() => getJournalHistoryWeeks("2026-13-01")).toThrow(RangeError);
  });
  it("rejects non-ISO dates", () => {
    expect(() => getJournalHistoryWeeks("2026-9-1")).toThrow(RangeError);
    expect(() => getJournalHistoryWeeks("")).toThrow(RangeError);
  });
});

describe("journal history student/subject selection", () => {
  const week = getJournalHistoryWeeks("2026-09-18")[1];
  const row = (studentId: number, classGroupId: number, content: string) => ({
    student: { id: studentId, name: "동명이인" },
    classGroup: { id: classGroupId },
    journal: { content, homework: "", notes: "" },
  });
  it("matches both student ID and class ID even when names match", () => {
    const wanted = row(1, 10, "수학 기록");
    const days = [{ journalDate: "2026-09-14", rows: [row(2, 10, "다른 학생"), row(1, 20, "영어 기록"), wanted] }];
    expect(selectJournalHistoryDays(week, days, 1, 10)[0].row).toBe(wanted);
  });
  it("does not fall back to another subject", () => {
    const days = [{ journalDate: "2026-09-14", rows: [row(1, 20, "영어 기록")] }];
    expect(selectJournalHistoryDays(week, days, 1, 10)[0].row).toBeUndefined();
  });
  it("keeps weekend makeup records even when dates are unordered", () => {
    const saturday = row(1, 10, "토요일 보강");
    const sunday = row(1, 10, "일요일 보강");
    const days = [
      { journalDate: "2026-09-20", rows: [sunday] },
      { journalDate: "2026-09-19", rows: [saturday] },
    ];
    const selected = selectJournalHistoryDays(week, days, 1, 10);
    expect(selected[5].row).toBe(saturday);
    expect(selected[6].row).toBe(sunday);
  });
  it("ignores records outside the requested calendar week", () => {
    const days = [{ journalDate: "2026-09-21", rows: [row(1, 10, "다음 주")] }];
    expect(selectJournalHistoryDays(week, days, 1, 10).every(day => day.row === undefined)).toBe(true);
  });
  it("retains empty dates rather than inventing attendance or journals", () => {
    const selected = selectJournalHistoryDays(week, [], 1, 10);
    expect(selected.length).toBe(7);
    expect(selected.every(day => day.row === undefined)).toBe(true);
    expect(selected.map(day => day.journalDate)).toEqual(week.dates);
  });
  it("does not mutate query data", () => {
    const original = row(1, 10, "수정하지 않음");
    const days = [{ journalDate: "2026-09-14", rows: [original] }];
    const before = JSON.stringify(days);
    selectJournalHistoryDays(week, days, 1, 10);
    expect(JSON.stringify(days)).toBe(before);
  });
});


describe("standalone history window target", () => {
  it("round-trips the two IDs without carrying personal data", () => {
    const url = buildJournalHistoryUrl(123, 4);
    expect(url).toBe("/journal/history?studentId=123&classGroupId=4");
    expect(parseJournalHistoryTarget(url.split("?")[1])).toEqual({ studentId: 123, classGroupId: 4, includeWeekend: false });
  });
  it("carries the weekend setting only when it is enabled", () => {
    const url = buildJournalHistoryUrl(123, 4, true);
    expect(url).toBe("/journal/history?studentId=123&classGroupId=4&includeWeekend=1");
    expect(parseJournalHistoryTarget(url.split("?")[1])).toEqual({ studentId: 123, classGroupId: 4, includeWeekend: true });
  });
  it("rejects malformed or duplicated weekend settings", () => {
    for (const value of ["true", "yes", "2", "-1", ""])
      expect(parseJournalHistoryTarget(`studentId=1&classGroupId=4&includeWeekend=${value}`)).toBe(null);
    expect(parseJournalHistoryTarget("studentId=1&classGroupId=4&includeWeekend=1&includeWeekend=0")).toBe(null);
  });
  it("rejects missing, zero, negative, fractional, and duplicated IDs", () => {
    for (const query of ["", "studentId=1", "studentId=0&classGroupId=4", "studentId=-1&classGroupId=4", "studentId=1.5&classGroupId=4", "studentId=1&studentId=2&classGroupId=4", "studentId=1&classGroupId=4&classGroupId=5"]) {
      expect(parseJournalHistoryTarget(query)).toBe(null);
    }
  });
  it("rejects unsafe integer IDs and alternate numeric notations", () => {
    for (const value of ["9007199254740992", "1e2", "0x10", "NaN", "Infinity", "01", "%201"])
      expect(parseJournalHistoryTarget(`studentId=${value}&classGroupId=4`)).toBe(null);
  });
  it("refuses to build malformed deep links", () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => buildJournalHistoryUrl(value, 1)).toThrow(RangeError);
    expect(() => buildJournalHistoryUrl(1, 0)).toThrow(RangeError);
  });
});
