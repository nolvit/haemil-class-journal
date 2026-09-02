import { describe, expect, it } from "vitest";
import { attendanceStatusLabels, chooseJournalClassId, chooseRememberedGrade, findJournalTransferConflict, formatArrivalElapsed, getHistoricalLessonCount, formatArrivalTimeForDisplay, formatAttendanceProgressLabel, formatLessonDuration, getAdjacentJournalDate, getBusinessWeekDates, getJournalCompleteness, getJournalDeletionTargetDates, getJournalFocusDates, getJournalInsertionMoves, getMonday, getNextBusinessDate, getPreviousWeekStart, getNextScheduledClassDate, getUnenteredAttendanceDates, getWeeklyDates, isCalendarScheduleVisibleToParent, isDateVisibleToParent, isFinalJournalVisibleToParent, isJournalAttentionDue, isJournalWriteBlocked, normalizeAfternoonArrivalTime, selectableAttendanceStatusValues, shouldPullJournalForAttendance, shouldTransferJournalForAttendance } from "../shared/journalRules";
import { getClosureDatesInRange, getClosureForDate, hasOverlappingClosureRange, matchesAutomaticCalendarStatus } from "../shared/closureRules";
import { dashboardAttendanceHref, dashboardJournalHref, dashboardStudentJournalHref, shouldShowDashboardPendingList } from "../shared/dashboardNavigation";
import { getRegistrationCountPreview } from "../shared/studentCountRules";
import { getDaysUntilValidUntil, getValidUntilAfterTotalCountChange, isValidUntilDueSoon } from "../shared/studentExpiryRules";
import { getAutomaticTuitionMatch } from "../shared/tuitionRules";
import { getMobileSwipeDestination } from "../shared/mobileSwipeNavigation";
import { countSavedLearningLinks, getOpenableLearningLink } from "../shared/learningLinksRules";
import { buildParentAttendanceMessage, getAttendanceSessionUnits, getHolidayAdjustedTarget, isAttendancePending } from "../shared/attendanceSummaryRules";
import { appendClosureNoticeTemplate, getClosureNoticeTemplates } from "../shared/closureNoticeTemplates";
import { getKoreanHolidayDates, getVerifiedFallbackHoliday, groupKoreanHolidaySchedules, parseOfficialHolidayPayload, shouldAutomaticallyApplyLegalHoliday } from "./koreanHolidays";

describe("과거 주차 수업 횟수", () => {
  it("현재 누계에 이미 적립된 주차를 과거 화면에서 다시 더하지 않는다", () => {
    expect(getHistoricalLessonCount({
      currentSettledCount: 35,
      requestedWeekStart: "2026-08-24",
      currentWeekStart: "2026-08-31",
      requestedWeekSessions: 2,
      laterSettledWeeks: [],
    })).toBe(35);
  });

  it("더 오래된 주차는 그 이후 이미 적립된 주차를 제외해 종료 누계를 복원한다", () => {
    expect(getHistoricalLessonCount({
      currentSettledCount: 35,
      requestedWeekStart: "2026-08-17",
      currentWeekStart: "2026-08-31",
      requestedWeekSessions: 3,
      laterSettledWeeks: [{ weekStart: "2026-08-24", sessionCount: 2 }],
    })).toBe(33);
  });
});

describe("출결 표시 라벨", () => {
  it("미입력 상태를 모든 화면 공통으로 등원 전이라고 표시한다", () => {
    expect(attendanceStatusLabels.not_entered).toBe("등원 전");
  });
});

describe("수업일지 완성 상태", () => {
  it("출석한 학생의 수업 내용이 비어 있으면 확인 필요 상태로 분류한다", () => {
    expect(getJournalCompleteness("present", "분수의 덧셈", "")).toEqual({
      state: "complete",
      missingFields: [],
    });
    expect(getJournalCompleteness("present", "", "문제집 3쪽")).toEqual({ state: "attention", missingFields: ["content"] });
    expect(getJournalCompleteness("not_entered", "분수의 덧셈", "")).toEqual({ state: "complete", missingFields: [] });
    expect(getJournalCompleteness("not_entered", "", "")).toEqual({ state: "attention", missingFields: ["content"] });
  });

  it("임시 저장 수업일지는 내용이 있어도 최종 저장 전까지 미입력으로 분류한다", () => {
    expect(getJournalCompleteness("present", "분수의 덧셈", "문제집 3쪽", true)).toEqual({
      state: "attention",
      missingFields: [],
      isDraft: true,
    });
    expect(getJournalCompleteness("present", "분수의 덧셈", "문제집 3쪽", false)).toEqual({ state: "complete", missingFields: [] });
  });

  it("결석·미등록·공휴일·휴강 학생에게는 일지 입력을 요구하지 않는다", () => {
    expect(getJournalCompleteness("absent", "", "")).toEqual({
      state: "not_required",
      missingFields: [],
    });
    expect(getJournalCompleteness("holiday", "", "")).toEqual({ state: "not_required", missingFields: [] });
    expect(getJournalCompleteness("closed", "", "")).toEqual({ state: "not_required", missingFields: [] });
  });

  it("결석·미등록·공휴일·휴강 상태에는 수업일지 저장을 차단한다", () => {
    expect(isJournalWriteBlocked("absent", "방정식 풀이", "문제집 3쪽", "")).toBe(true);
    expect(isJournalWriteBlocked("not_registered", "", "", "")).toBe(false);
    expect(isJournalWriteBlocked("closed", "방정식 풀이", "", "")).toBe(true);
    expect(isJournalWriteBlocked("present", "방정식 풀이", "문제집 3쪽", "")).toBe(false);
  });

  it("월요일 기준으로 평일 수업 주간을 계산한다", () => {
    expect(getMonday("2026-08-30")).toBe("2026-08-24");
    expect(getBusinessWeekDates("2026-08-26")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
  });

  it("현재 날짜에서 적립할 이전 주의 월요일을 계산한다", () => {
    expect(getPreviousWeekStart("2026-08-31")).toBe("2026-08-24");
    expect(getPreviousWeekStart("2026-09-06")).toBe("2026-08-24");
  });

  it("필요할 때 주말을 포함한 월요일~일요일 입력 범위를 계산한다", () => {
    expect(getWeeklyDates("2026-08-26", true)).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("삭제 후 미래 일지는 주말과 차단일을 건너뛰며 현재 날짜부터 당길 날짜를 계산한다", () => {
    expect(getJournalDeletionTargetDates("2026-08-28", ["2026-09-01", "2026-09-02"], false, new Set(["2026-08-31"]))).toEqual(["2026-08-28", "2026-09-01"]);
    expect(getJournalDeletionTargetDates("2026-08-28", ["2026-08-30"], true, new Set())).toEqual(["2026-08-28"]);
  });

  it("수업일지 기본 과목은 영어이고 저장된 과목이 있으면 그 과목을 복원한다", () => {
    const groups = [{ id: 1, subject: "수학" }, { id: 2, subject: "영어" }];
    expect(chooseJournalClassId(groups, undefined)).toBe(2);
    expect(chooseJournalClassId(groups, 1)).toBe(1);
    expect(chooseJournalClassId(groups, 99)).toBe(2);
  });

  it("출석 관리 학년은 저장된 값이 유효할 때 복원하고 아니면 첫 학년을 선택한다", () => {
    expect(chooseRememberedGrade(["고2", "중1", "중2"], "중2")).toBe("중2");
    expect(chooseRememberedGrade(["고2", "중1", "중2"], "초6")).toBe("고2");
    expect(chooseRememberedGrade([], "중2")).toBeUndefined();
  });

  it("수업일지는 오늘 기준 전날·오늘·다음날의 3일만 빠르게 표시한다", () => {
    expect(getJournalFocusDates("2026-08-26", false)).toEqual(["2026-08-25", "2026-08-26", "2026-08-27"]);
    expect(getJournalFocusDates("2026-08-24", false)).toEqual(["2026-08-21", "2026-08-24", "2026-08-25"]);
    expect(getJournalFocusDates("2026-08-28", true)).toEqual(["2026-08-27", "2026-08-28", "2026-08-29"]);
  });

  it("주말 입력이 꺼진 수업일지 팝업은 전날·다음날 이동에서 토요일과 일요일을 건너뛴다", () => {
    expect(getAdjacentJournalDate("2026-08-28", 1, false)).toBe("2026-08-31");
    expect(getAdjacentJournalDate("2026-08-31", -1, false)).toBe("2026-08-28");
    expect(getAdjacentJournalDate("2026-08-28", 1, true)).toBe("2026-08-29");
    expect(getAdjacentJournalDate("2026-08-31", -1, true)).toBe("2026-08-30");
  });

  it("수업일지 추가하기는 주말 설정에 따라 이후 기록을 충돌 없이 역순 이동한다", () => {
    expect(getJournalInsertionMoves(["2026-08-28", "2026-08-31", "2026-09-02"], false)).toEqual([
      { sourceDate: "2026-09-02", targetDate: "2026-09-03" },
      { sourceDate: "2026-08-31", targetDate: "2026-09-01" },
      { sourceDate: "2026-08-28", targetDate: "2026-08-31" },
    ]);
    expect(getJournalInsertionMoves(["2026-08-28", "2026-08-29", "2026-08-30"], false)).toEqual([
      { sourceDate: "2026-08-30", targetDate: "2026-09-02" },
      { sourceDate: "2026-08-29", targetDate: "2026-09-01" },
      { sourceDate: "2026-08-28", targetDate: "2026-08-31" },
    ]);
    expect(getJournalInsertionMoves(["2026-08-28", "2026-08-29", "2026-08-30"], true)).toEqual([
      { sourceDate: "2026-08-30", targetDate: "2026-08-31" },
      { sourceDate: "2026-08-29", targetDate: "2026-08-30" },
      { sourceDate: "2026-08-28", targetDate: "2026-08-29" },
    ]);
  });

  it("수업일지 추가하기는 법정공휴일과 수동 휴강일도 건너뛰어 다음 입력 가능 날짜로 이동한다", () => {
    const unavailableDates = new Set(["2026-09-23", "2026-09-24"]);
    expect(getJournalInsertionMoves(["2026-09-21", "2026-09-22"], false, unavailableDates)).toEqual([
      { sourceDate: "2026-09-22", targetDate: "2026-09-25" },
      { sourceDate: "2026-09-21", targetDate: "2026-09-22" },
    ]);
    expect(getJournalInsertionMoves(["2026-09-22"], true, unavailableDates)).toEqual([
      { sourceDate: "2026-09-22", targetDate: "2026-09-25" },
    ]);
  });

  it("보호자에게는 미래 실제 출석을 공개하지 않고 미래 일정 안내만 공개한다", () => {
    expect(isDateVisibleToParent("2026-08-26", "2026-08-26")).toBe(true);
    expect(isDateVisibleToParent("2026-08-27", "2026-08-26")).toBe(false);
    expect(isCalendarScheduleVisibleToParent("2026-09-24", "2026-08-27", true)).toBe(true);
    expect(isCalendarScheduleVisibleToParent("2026-09-24", "2026-08-27", false)).toBe(false);
  });

  it("미래 날짜라도 최종 저장 수업일지는 예정으로 공개하고 임시 저장은 숨긴다", () => {
    expect(isFinalJournalVisibleToParent(false)).toBe(true);
    expect(isFinalJournalVisibleToParent(null)).toBe(true);
    expect(isFinalJournalVisibleToParent(undefined)).toBe(true);
    expect(isFinalJournalVisibleToParent(true)).toBe(false);
  });

  it("평일 일괄 입력은 미입력인 날짜만 출석 처리 대상으로 고른다", () => {
    const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
    expect(getUnenteredAttendanceDates(dates, [
      { journalDate: "2026-08-24", status: "absent" },
      { journalDate: "2026-08-25", status: "present" },
      { journalDate: "2026-08-26", status: "not_registered" },
      { journalDate: "2026-08-27", status: "not_entered" },
    ])).toEqual(["2026-08-27", "2026-08-28"]);
    expect(getUnenteredAttendanceDates(dates, [
      { journalDate: "2026-08-24", status: "holiday" },
      { journalDate: "2026-08-25", status: "closed" },
      { journalDate: "2026-08-26", status: "not_entered" },
    ])).toEqual(["2026-08-26", "2026-08-27", "2026-08-28"]);
  });

  it("결석·미등록 전환 시 내용이 있는 수업일지만 다음 수업일로 이관한다", () => {
    expect(shouldTransferJournalForAttendance("absent", { content: "연립방정식", homework: "3쪽", notes: "" })).toBe(true);
    expect(shouldTransferJournalForAttendance("not_registered", { content: "", homework: "", notes: "공개 비고" })).toBe(true);
    expect(shouldTransferJournalForAttendance("present", { content: "연립방정식" })).toBe(false);
    expect(shouldTransferJournalForAttendance("closed", { content: "연립방정식" })).toBe(true);
    expect(shouldTransferJournalForAttendance("absent", { content: "", homework: "", notes: "" })).toBe(false);
    expect(getNextBusinessDate("2026-08-28")).toBe("2026-08-31");
    expect(getNextBusinessDate("2026-08-29")).toBe("2026-08-31");
    expect(getNextScheduledClassDate("2026-08-26", [1, 3, 5])).toBe("2026-08-28");
    expect(getNextScheduledClassDate("2026-08-28", [1, 3, 5])).toBe("2026-08-31");
    expect(shouldPullJournalForAttendance("absent", "present")).toBe(true);
    expect(shouldPullJournalForAttendance("not_registered", "makeup_double")).toBe(true);
    expect(shouldPullJournalForAttendance("closed", "present")).toBe(true);
    expect(shouldPullJournalForAttendance("present", "makeup")).toBe(false);
    expect(findJournalTransferConflict(
      [{ classGroupId: 1, content: "연립방정식" }, { classGroupId: 2, notes: "공개 비고" }],
      [{ classGroupId: 1, content: "다음 수업 내용" }, { classGroupId: 2, content: "" }],
    )).toBe(1);
    expect(findJournalTransferConflict([{ classGroupId: 1, content: "연립방정식" }], [{ classGroupId: 1, content: "" }])).toBeNull();
  });

  it("미입력 전용 목록은 오늘과 과거 날짜만 대상으로 한다", () => {
    expect(isJournalAttentionDue("2026-08-24", "2026-08-24", "attention")).toBe(true);
    expect(isJournalAttentionDue("2026-08-21", "2026-08-24", "attention")).toBe(true);
    expect(isJournalAttentionDue("2026-08-28", "2026-08-24", "attention")).toBe(false);
    expect(isJournalAttentionDue("2026-08-24", "2026-08-24", "complete")).toBe(false);
  });

  it("업무 현황은 새로고침 시점의 등원 경과 시간을 한국 시간 기준으로 표시한다", () => {
    const now = new Date("2026-08-26T07:30:00.000Z");
    expect(normalizeAfternoonArrivalTime("3:15")).toBe("15:15");
    expect(normalizeAfternoonArrivalTime("12:15")).toBe("12:15");
    expect(formatArrivalTimeForDisplay("15:15")).toBe("3:15");
    expect(formatArrivalTimeForDisplay("3:15")).toBe("3:15");
    expect(formatArrivalElapsed("3:30", "2026-08-26", now, "2026-08-26")).toBe("등원 후 1시간 0분");
    expect(formatArrivalElapsed("15:30", "2026-08-26", now, "2026-08-26")).toBe("등원 후 1시간 0분");
    expect(formatArrivalElapsed("3:15", "2026-08-25", now, "2026-08-26")).toBe("등원 3:15");
    expect(formatArrivalElapsed(null, "2026-08-26", now, "2026-08-26")).toBeNull();
    expect(formatAttendanceProgressLabel("absent", null, "2026-08-26", now, "2026-08-26")).toBe("결석");
    expect(formatAttendanceProgressLabel("not_registered", null, "2026-08-26", now, "2026-08-26")).toBe("미등록");
    expect(formatAttendanceProgressLabel("not_entered", null, "2026-08-26", now, "2026-08-26")).toBe("—");
  });

  it("하원 후에는 등원 경과 대신 실제 수업 시간을 표시한다", () => {
    expect(formatLessonDuration("15:10", "17:05")).toBe("수업 1시간 55분");
    expect(formatLessonDuration("3:10", "5:05")).toBe("수업 1시간 55분");
    expect(
      formatAttendanceProgressLabel(
        "present",
        "15:10",
        "2026-08-26",
        new Date("2026-08-26T08:00:00.000Z"),
        "2026-08-26",
        "17:05"
      )
    ).toBe("수업 1시간 55분");
  });

  it("등원 미완료는 출석 행이 없는 학생과 명시적 미입력을 모두 포함한다", () => {
    expect(isAttendancePending(null)).toBe(true);
    expect(isAttendancePending(undefined)).toBe(true);
    expect(isAttendancePending("not_entered")).toBe(true);
    expect(isAttendancePending("present")).toBe(false);
    expect(isAttendancePending("makeup")).toBe(false);
    expect(isAttendancePending("makeup_double")).toBe(false);
    expect(isAttendancePending("absent")).toBe(false);
    expect(isAttendancePending("not_registered")).toBe(false);
    expect(isAttendancePending("holiday")).toBe(false);
    expect(isAttendancePending("closed")).toBe(false);
  });

  it("업무 현황의 미입력 대상은 학생·과목·날짜를 유지한 입력 화면 URL을 만든다", () => {
    expect(dashboardAttendanceHref("2026-08-24", 23)).toBe("/attendance?date=2026-08-24&studentId=23");
    expect(dashboardJournalHref("2026-08-24", 23, 7)).toBe("/journal?date=2026-08-24&studentId=23&classGroupId=7");
    expect(dashboardStudentJournalHref("2026-08-24", 23)).toBe("/journal?date=2026-08-24&studentId=23");
    expect(shouldShowDashboardPendingList(1)).toBe(true);
    expect(shouldShowDashboardPendingList(10)).toBe(true);
    expect(shouldShowDashboardPendingList(11)).toBe(false);
  });

  it("등록 횟수 추가 확인 창은 적용 전후 총 횟수와 추가분을 계산한다", () => {
    expect(getRegistrationCountPreview(20, 5)).toEqual({ beforeTotalCount: 20, addedCount: 20, afterTotalCount: 40 });
    expect(getRegistrationCountPreview(10.5, 2.5)).toEqual({ beforeTotalCount: 10.5, addedCount: 10, afterTotalCount: 20.5 });
  });

  it("모바일 가로 쓸기는 업무 현황·출석 관리·수업 일지 사이에서만 이동한다", () => {
    expect(getMobileSwipeDestination("/attendance", -100, 8)).toBe("/journal");
    expect(getMobileSwipeDestination("/attendance", 100, 8)).toBe("/");
    expect(getMobileSwipeDestination("/journal", -100, 8)).toBe("/learning-links");
    expect(getMobileSwipeDestination("/classes", -100, 8)).toBe("/parent-links");
    expect(getMobileSwipeDestination("/", 100, 8)).toBeNull();
    expect(getMobileSwipeDestination("/parent-links", -100, 8)).toBeNull();
    expect(getMobileSwipeDestination("/attendance", 50, 3)).toBeNull();
    expect(getMobileSwipeDestination("/attendance", 100, 90)).toBeNull();
  });

  it("수학 단원 평가 링크를 포함해 저장된 학습 링크 수를 계산한다", () => {
    expect(countSavedLearningLinks({ vocabularyResultUrl: "https://example.com/word", englishSpeakingUrl: "", mathUnitEvaluationUrl: "https://example.com/math" })).toBe(2);
    expect(countSavedLearningLinks({ mathUnitEvaluationUrl: "  " })).toBe(0);
  });

  it("학습 링크 열기는 프로토콜을 보완하고 HTTP(S) 주소만 허용한다", () => {
    expect(getOpenableLearningLink("example.com/result")).toBe("https://example.com/result");
    expect(getOpenableLearningLink(" https://example.com/speaking ")).toBe("https://example.com/speaking");
    expect(getOpenableLearningLink("javascript:alert(1)")).toBeNull();
    expect(getOpenableLearningLink("not a url")).toBeNull();
    expect(getOpenableLearningLink("")).toBeNull();
  });

  it("대한민국 공식 원천의 설날·추석 연휴와 선거일을 공휴일 데이터로 정규화한다", () => {
    const parsed = parseOfficialHolidayPayload([
      { date: "2026-02-16", name: "설날", holiday: true },
      { date: "2026-02-17", name: "설날", holiday: true },
      { date: "2026-02-18", name: "설날", holiday: true },
      { date: "2026-06-03", name: "제9회 전국동시지방선거", holiday: true },
      { date: "2026-09-24", name: "추석", holiday: true },
      { date: "2026-09-25", name: "추석", holiday: true },
      { date: "2026-09-26", name: "추석", holiday: true },
      { date: "2026-09-23", name: "추분", holiday: false },
    ]);
    expect(parsed.map(item => item.date)).toEqual(["2026-02-16", "2026-02-17", "2026-02-18", "2026-06-03", "2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(parsed.find(item => item.date === "2026-06-03")?.name).toBe("제9회 전국동시지방선거");
    expect(getVerifiedFallbackHoliday("2025-01-27")?.name).toBe("임시공휴일");
    expect(getVerifiedFallbackHoliday("2026-02-16")?.name).toBe("설날");
    expect(getVerifiedFallbackHoliday("2026-02-17")?.name).toBe("설날");
    expect(getVerifiedFallbackHoliday("2026-02-18")?.name).toBe("설날");
    expect(getVerifiedFallbackHoliday("2026-06-03")?.name).toBe("제9회 전국동시지방선거");
    expect(getVerifiedFallbackHoliday("2026-09-24")?.name).toBe("추석");
    expect(getVerifiedFallbackHoliday("2026-09-25")?.name).toBe("추석");
    expect(getVerifiedFallbackHoliday("2026-09-26")?.name).toBe("추석");
    expect(getVerifiedFallbackHoliday("2026-08-17")?.name).toBe("광복절 (대체공휴일)");
    expect(getVerifiedFallbackHoliday("2026-08-18")).toBeNull();
    expect(shouldAutomaticallyApplyLegalHoliday("2026-09-25")).toBe(true);
    expect(shouldAutomaticallyApplyLegalHoliday("2026-09-26")).toBe(false);
    expect(shouldAutomaticallyApplyLegalHoliday("2026-06-06")).toBe(false);
  });

  it("업무 화면의 공휴일 판정은 외부 요청 없이 로컬 연도 데이터로 즉시 조회한다", async () => {
    const dates = await getKoreanHolidayDates(["2026-06-03", "2026-09-24", "2026-08-29"]);
    expect(dates.get("2026-06-03")?.name).toContain("지방선거");
    expect(dates.get("2026-09-24")?.name).toBe("추석");
    expect(dates.has("2026-08-29")).toBe(false);
  });

  it("연속된 같은 법정공휴일은 하나의 관리자 선택 기간으로 묶는다", () => {
    const schedules = groupKoreanHolidaySchedules([
      { date: "2026-09-24", name: "추석", source: "official" },
      { date: "2026-09-25", name: "추석", source: "official" },
      { date: "2026-09-26", name: "추석", source: "official" },
      { date: "2026-10-05", name: "개천절 (대체공휴일)", source: "official" },
    ]);
    expect(schedules).toEqual([
      { id: "2026-09-24:2026-09-26:추석", name: "추석", startDate: "2026-09-24", endDate: "2026-09-26", dates: ["2026-09-24", "2026-09-25", "2026-09-26"] },
      { id: "2026-10-05:2026-10-05:개천절 (대체공휴일)", name: "개천절 (대체공휴일)", startDate: "2026-10-05", endDate: "2026-10-05", dates: ["2026-10-05"] },
    ]);
  });

  it("안내 문구 템플릿은 선택한 일정명을 채우고 기존 문구를 보존한다", () => {
    const holidayTemplate = getClosureNoticeTemplates("legal_holiday").find(template => template.id === "holiday-greeting");
    const closureTemplate = getClosureNoticeTemplates("closure").find(template => template.id === "closure-vacation");
    expect(holidayTemplate).toBeDefined();
    expect(closureTemplate).toBeDefined();
    expect(appendClosureNoticeTemplate("", holidayTemplate!, { name: "추석" })).toBe("추석을 맞아 가족과 함께 따뜻하고 풍성한 시간 보내시길 바랍니다.");
    expect(appendClosureNoticeTemplate("기존 안내입니다.", closureTemplate!, { name: "여름방학 휴강" })).toBe("기존 안내입니다.\n여름방학 휴강 기간에는 정규 수업이 없습니다. 즐겁고 안전한 방학 보내세요.");
  });

  it("공휴일은 선택 목록에서 제외하고 휴강은 포함한다", () => {
    expect(selectableAttendanceStatusValues).not.toContain("holiday");
    expect(selectableAttendanceStatusValues).toContain("closed");
  });

  it("연속 휴강의 날짜와 겹침 여부를 일관되게 계산한다", () => {
    const closure = { id: 7, startDate: "2026-09-24", endDate: "2026-09-26", name: "추석 연휴 휴강" };
    expect(getClosureForDate("2026-09-25", [closure])?.id).toBe(7);
    expect(getClosureForDate("2026-09-27", [closure])).toBeNull();
    expect(getClosureDatesInRange(closure, ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"])).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(hasOverlappingClosureRange("2026-09-25", "2026-09-27", [closure])).toBe(true);
    expect(hasOverlappingClosureRange("2026-09-27", "2026-09-28", [closure])).toBe(false);
    expect(hasOverlappingClosureRange("2026-09-25", "2026-09-27", [closure], 7)).toBe(false);
    expect(matchesAutomaticCalendarStatus("holiday", "holiday")).toBe(true);
    expect(matchesAutomaticCalendarStatus("closed", "closed")).toBe(true);
    expect(matchesAutomaticCalendarStatus("present", "holiday")).toBe(false);
    expect(matchesAutomaticCalendarStatus("holiday", undefined)).toBe(false);
  });

  it("공휴일을 반영한 출석 목표는 기존 목표보다 낮아지지 않는다", () => {
    expect(getHolidayAdjustedTarget(5, 1)).toBe(4);
    expect(getHolidayAdjustedTarget(5, 2)).toBe(3);
    expect(getHolidayAdjustedTarget(4, 2)).toBe(3);
    expect(getHolidayAdjustedTarget(3, 2)).toBe(3);
    expect(getHolidayAdjustedTarget(4, 3)).toBe(2);
  });

  it("보강 수업 단위와 보호자 주간 안내 문구를 구분한다", () => {
    expect(getAttendanceSessionUnits("present")).toBe(1);
    expect(getAttendanceSessionUnits("makeup")).toBe(1.5);
    expect(getAttendanceSessionUnits("makeup_double")).toBe(2);
    expect(getAttendanceSessionUnits("closed")).toBe(0);
    expect(buildParentAttendanceMessage({ target: 5, sessionCount: 5, attendanceDayCount: 4, makeupCount: 0, makeupDoubleCount: 1 })).toBe("이번 주 출석은 5회 목표 중 5회입니다. 출석일은 4일이나 보강×2로 목표 수업 횟수에 도달했습니다. 훌륭해요!");
    expect(buildParentAttendanceMessage({ target: 5, sessionCount: 4.5, attendanceDayCount: 4, makeupCount: 1, makeupDoubleCount: 0 })).toBe("이번 주 출석은 5회 목표 중 4.5회입니다. 출석일은 4일이나 보강으로 비록 목표 수업 횟수에 도달하지 못했지만 잘했어요!");
    expect(buildParentAttendanceMessage({ target: 5, sessionCount: 3, attendanceDayCount: 3, makeupCount: 0, makeupDoubleCount: 0 })).toBe("이번 주 출석은 5회 목표 중 3회입니다. 출석률을 더 높여봅시다!");
  });
});

describe("학생 만료확인일", () => {
  it("총 수업 횟수가 변경된 날부터 만료확인일을 60일 뒤로 계산한다", () => {
    expect(getValidUntilAfterTotalCountChange("2026-08-27")).toBe("2026-10-26");
  });

  it("만료확인일이 오늘부터 30일 이내인 재원 학생만 안내 대상으로 구분한다", () => {
    expect(getDaysUntilValidUntil("2026-08-27", "2026-08-27")).toBe(0);
    expect(getDaysUntilValidUntil("2026-09-26", "2026-08-27")).toBe(30);
    expect(isValidUntilDueSoon("2026-08-27", "2026-08-27")).toBe(true);
    expect(isValidUntilDueSoon("2026-09-26", "2026-08-27")).toBe(true);
    expect(isValidUntilDueSoon("2026-09-27", "2026-08-27")).toBe(false);
    expect(isValidUntilDueSoon("2026-08-26", "2026-08-27")).toBe(false);
    expect(isValidUntilDueSoon(null, "2026-08-27")).toBe(false);
  });
});

describe("원비 자동 산정", () => {
  const standards = [
    { schoolLevel: "elementary", monthlySessionCount: 12, subjectCountTier: 0, tuition: 150000 },
    { schoolLevel: "elementary", monthlySessionCount: 20, subjectCountTier: 0, tuition: 250000 },
    { schoolLevel: "middle", monthlySessionCount: 16, subjectCountTier: 1, tuition: 160000 },
    { schoolLevel: "middle", monthlySessionCount: 16, subjectCountTier: 2, tuition: 290000 },
    { schoolLevel: "high", monthlySessionCount: 20, subjectCountTier: 1, tuition: 250000 },
    { schoolLevel: "high", monthlySessionCount: 20, subjectCountTier: 2, tuition: 480000 },
  ];

  it("학년·주당 등록 횟수·수강 과목 수에 맞는 원비를 자동으로 찾는다", () => {
    expect(getAutomaticTuitionMatch("초5", 3, 2, standards)).toMatchObject({ tuition: 150000, label: "초등학생 · 5과목 패키지 · 월 12회" });
    expect(getAutomaticTuitionMatch("중2", 4, 1, standards)).toMatchObject({ tuition: 160000, label: "중학생 · 1과목 · 월 16회" });
    expect(getAutomaticTuitionMatch("중2", 4, 3, standards)).toMatchObject({ tuition: 290000, label: "중학생 · 2과목 이상 · 월 16회" });
    expect(getAutomaticTuitionMatch("고1", 5, 2, standards)).toMatchObject({ tuition: 480000, label: "고등학생 · 2과목 이상 · 월 20회" });
  });

  it("수강 과목이 없거나 기준표에 없는 월 수업 횟수에는 자동 원비를 제안하지 않는다", () => {
    expect(getAutomaticTuitionMatch("중1", 4, 0, standards)).toBeNull();
    expect(getAutomaticTuitionMatch("고2", 2, 1, standards)).toBeNull();
  });
});
