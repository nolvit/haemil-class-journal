import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes, randomInt } from "node:crypto";
import {
  attendanceEntryEvents,
  attendanceRecords,
  classGroups,
  closurePeriods,
  InsertUser,
  legalHolidayNotices,
  lessonJournals,
  notificationDeliveryLogs,
  parentPortalMonthlyViews,
  parentPushSubscriptions,
  registrationCountHistories,
  studentRemainingCountNotifications,
  studentEnrollments,
  students,
  tuitionStandards,
  users,
  weeklyCountAccruals,
  weeklySubjectComments,
} from "../drizzle/schema";
import {
  getAttendanceSessionUnits,
  getHolidayAdjustedTarget,
  isAttendanceDay,
  isAttendancePending,
  buildParentAttendanceMessage,
} from "../shared/attendanceSummaryRules";
import {
  getClosureForDate,
  hasOverlappingClosureRange,
} from "../shared/closureRules";
import {
  getAdjacentJournalDate,
  getBusinessWeekDates,
  getHistoricalLessonCount,
  getJournalCompleteness,
  getJournalDeletionTargetDates,
  getJournalInsertionMoves,
  getMonday,
  getNextBusinessDate,
  getPreviousWeekStart,
  getUnenteredAttendanceDates,
  getWeeklyDates,
  isCalendarScheduleVisibleToParent,
  isDateVisibleToParent,
  isFinalJournalVisibleToParent,
  shouldPullJournalForAttendance,
  shouldTransferJournalForAttendance,
  type AttendanceStatus,
} from "../shared/journalRules";
import { getValidUntilAfterTotalCountChange } from "../shared/studentExpiryRules";
import { getAutomaticTuitionMatch } from "../shared/tuitionRules";
import { shouldSendRemainingTwoNotification } from "../shared/remainingCountNotificationRules";
import { getPushDeviceLabel } from "../shared/pushDeviceLabels";
import {
  getKoreanHolidayDates,
  shouldAutomaticallyApplyLegalHoliday,
} from "./koreanHolidays";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let weeklyCountSettlementCache: {
  weekStart: string;
  checkedAt: number;
} | null = null;
const WEEKLY_COUNT_SETTLEMENT_CACHE_MS = 30_000;

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다.");
  return db;
}

export async function ensureRemainingCountNotificationSchema() {
  const db = await requireDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS student_remaining_count_notifications (
      studentId int NOT NULL,
      message text NOT NULL,
      sentTotalCount double,
      lastAttemptedAt timestamp NULL,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (studentId)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notification_delivery_logs (
      id int AUTO_INCREMENT NOT NULL,
      studentId int NOT NULL,
      notificationType varchar(40) NOT NULL,
      title varchar(200) NOT NULL,
      body text NOT NULL,
      eventDate date NULL,
      targetCount int DEFAULT 0 NOT NULL,
      sentCount int DEFAULT 0 NOT NULL,
      failedCount int DEFAULT 0 NOT NULL,
      unavailable boolean DEFAULT false NOT NULL,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (id),
      INDEX notification_delivery_logs_created_index (createdAt),
      INDEX notification_delivery_logs_student_created_index (studentId, createdAt),
      INDEX notification_delivery_logs_event_date_index (eventDate)
    )
  `);
}

export type CalendarEvent = {
  type: "official_holiday" | "closure";
  status: "holiday" | "closed";
  name: string;
  description: string | null;
  imageUrl: string | null;
  closureId: number | null;
  legalHolidayNoticeId: number | null;
  startDate: string;
  endDate: string;
};

export type ClosurePeriodInput = {
  startDate: string;
  endDate: string;
  name: string;
  description?: string;
  imageKey?: string | null;
  imageUrl?: string | null;
};

export type LegalHolidayNoticeInput = {
  startDate: string;
  endDate: string;
  name: string;
  description?: string;
  imageKey?: string | null;
  imageUrl?: string | null;
};

export async function listClosurePeriods(range?: {
  startDate: string;
  endDate: string;
}) {
  const db = await requireDb();
  if (!range)
    return db
      .select()
      .from(closurePeriods)
      .orderBy(asc(closurePeriods.startDate), asc(closurePeriods.id));
  return db
    .select()
    .from(closurePeriods)
    .where(
      and(
        lte(closurePeriods.startDate, range.endDate),
        gte(closurePeriods.endDate, range.startDate)
      )
    )
    .orderBy(asc(closurePeriods.startDate), asc(closurePeriods.id));
}

export async function listLegalHolidayNotices(range?: {
  startDate: string;
  endDate: string;
}) {
  const db = await requireDb();
  if (!range)
    return db
      .select()
      .from(legalHolidayNotices)
      .orderBy(asc(legalHolidayNotices.startDate), asc(legalHolidayNotices.id));
  return db
    .select()
    .from(legalHolidayNotices)
    .where(
      and(
        lte(legalHolidayNotices.startDate, range.endDate),
        gte(legalHolidayNotices.endDate, range.startDate)
      )
    )
    .orderBy(asc(legalHolidayNotices.startDate), asc(legalHolidayNotices.id));
}

export async function createLegalHolidayNotice(
  input: LegalHolidayNoticeInput,
  userId: number
) {
  const db = await requireDb();
  const overlaps = await listLegalHolidayNotices({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (hasOverlappingClosureRange(input.startDate, input.endDate, overlaps))
    throw new Error(
      "이미 등록된 법정공휴일 안내 기간과 겹칩니다. 기존 안내를 수정하거나 기간을 조정해 주세요."
    );
  const inserted = await db
    .insert(legalHolidayNotices)
    .values({
      ...input,
      description: input.description?.trim() || null,
      imageKey: input.imageKey ?? null,
      imageUrl: input.imageUrl ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .$returningId();
  return inserted[0]?.id ?? null;
}

export async function updateLegalHolidayNotice(
  id: number,
  input: LegalHolidayNoticeInput,
  userId: number
) {
  const db = await requireDb();
  const existing = await db
    .select({ id: legalHolidayNotices.id })
    .from(legalHolidayNotices)
    .where(eq(legalHolidayNotices.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("법정공휴일 안내를 찾을 수 없습니다.");
  const overlaps = await listLegalHolidayNotices({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (hasOverlappingClosureRange(input.startDate, input.endDate, overlaps, id))
    throw new Error(
      "이미 등록된 법정공휴일 안내 기간과 겹칩니다. 기존 안내를 수정하거나 기간을 조정해 주세요."
    );
  await db
    .update(legalHolidayNotices)
    .set({
      ...input,
      description: input.description?.trim() || null,
      imageKey: input.imageKey ?? null,
      imageUrl: input.imageUrl ?? null,
      updatedByUserId: userId,
    })
    .where(eq(legalHolidayNotices.id, id));
}

export async function deleteLegalHolidayNotice(id: number) {
  const db = await requireDb();
  const result = await db
    .delete(legalHolidayNotices)
    .where(eq(legalHolidayNotices.id, id));
  if (!result[0]?.affectedRows)
    throw new Error("법정공휴일 안내를 찾을 수 없습니다.");
}

export async function getCalendarEventsForDates(isoDates: string[]) {
  const dates = Array.from(new Set(isoDates))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (!dates.length) return new Map<string, CalendarEvent>();
  const [closures, legalNotices, officialHolidayByDate] = await Promise.all([
    listClosurePeriods({
      startDate: dates[0]!,
      endDate: dates[dates.length - 1]!,
    }),
    listLegalHolidayNotices({
      startDate: dates[0]!,
      endDate: dates[dates.length - 1]!,
    }),
    getKoreanHolidayDates(dates),
  ]);
  return new Map<string, CalendarEvent>(
    dates.flatMap(date => {
      const closure = getClosureForDate(date, closures);
      if (closure)
        return [
          [
            date,
            {
              type: "closure" as const,
              status: "closed" as const,
              name: closure.name,
              description: closure.description,
              imageUrl: closure.imageUrl,
              closureId: closure.id,
              legalHolidayNoticeId: null,
              startDate: closure.startDate,
              endDate: closure.endDate,
            },
          ],
        ] as Array<[string, CalendarEvent]>;
      const officialHoliday = shouldAutomaticallyApplyLegalHoliday(date)
        ? officialHolidayByDate.get(date)
        : null;
      if (!officialHoliday) return [] as Array<[string, CalendarEvent]>;
      const legalNotice = getClosureForDate(date, legalNotices);
      return [
        [
          date,
          {
            type: "official_holiday" as const,
            status: "holiday" as const,
            name: officialHoliday.name,
            description: legalNotice?.description ?? null,
            imageUrl: legalNotice?.imageUrl ?? null,
            closureId: null,
            legalHolidayNoticeId: legalNotice?.id ?? null,
            startDate: legalNotice?.startDate ?? date,
            endDate: legalNotice?.endDate ?? date,
          },
        ],
      ] as Array<[string, CalendarEvent]>;
    })
  );
}

export async function getCalendarEventForDate(journalDate: string) {
  return (
    (await getCalendarEventsForDates([journalDate])).get(journalDate) ?? null
  );
}

export async function createClosurePeriod(
  input: ClosurePeriodInput,
  userId: number
) {
  const db = await requireDb();
  const overlaps = await listClosurePeriods({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (hasOverlappingClosureRange(input.startDate, input.endDate, overlaps))
    throw new Error(
      "이미 등록된 휴강 기간과 겹칩니다. 기존 휴강을 수정하거나 기간을 조정해 주세요."
    );
  const inserted = await db
    .insert(closurePeriods)
    .values({
      ...input,
      description: input.description?.trim() || null,
      imageKey: input.imageKey ?? null,
      imageUrl: input.imageUrl ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .$returningId();
  return inserted[0]?.id ?? null;
}

export async function updateClosurePeriod(
  id: number,
  input: ClosurePeriodInput,
  userId: number
) {
  const db = await requireDb();
  const existing = await db
    .select({ id: closurePeriods.id })
    .from(closurePeriods)
    .where(eq(closurePeriods.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("휴강 기간을 찾을 수 없습니다.");
  const overlaps = await listClosurePeriods({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (hasOverlappingClosureRange(input.startDate, input.endDate, overlaps, id))
    throw new Error(
      "이미 등록된 휴강 기간과 겹칩니다. 기존 휴강을 수정하거나 기간을 조정해 주세요."
    );
  await db
    .update(closurePeriods)
    .set({
      ...input,
      description: input.description?.trim() || null,
      imageKey: input.imageKey ?? null,
      imageUrl: input.imageUrl ?? null,
      updatedByUserId: userId,
    })
    .where(eq(closurePeriods.id, id));
}

export async function deleteClosurePeriod(id: number) {
  const db = await requireDb();
  const result = await db
    .delete(closurePeriods)
    .where(eq(closurePeriods.id, id));
  if (!result[0]?.affectedRows)
    throw new Error("휴강 기간을 찾을 수 없습니다.");
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role =
    user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  if (user.role !== undefined || user.openId === ENV.ownerOpenId)
    updateSet.role = values.role;
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export type ClassGroupInput = {
  name: string;
  subject: string;
  description?: string;
  meetingDays?: number[];
  accentColor?: string;
};

function serializeMeetingDays(days?: number[]) {
  const safeDays = Array.from(
    new Set(
      (days?.length ? days : [1, 2, 3, 4, 5]).filter(
        day => Number.isInteger(day) && day >= 0 && day <= 6
      )
    )
  ).sort((a, b) => a - b);
  return safeDays.join(",");
}

function parseMeetingDays(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map(day => day.trim())
    .filter(Boolean)
    .map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
}

export async function settlePreviousWeekCounts(today = todayInKorea()) {
  const weekStart = getPreviousWeekStart(today);
  const now = Date.now();
  if (
    weeklyCountSettlementCache?.weekStart === weekStart &&
    now - weeklyCountSettlementCache.checkedAt <
      WEEKLY_COUNT_SETTLEMENT_CACHE_MS
  )
    return;

  const db = await requireDb();
  const weekDates = getBusinessWeekDates(weekStart);
  const [studentRows, attendanceRows, accrualRows] = await Promise.all([
    db
      .select({ id: students.id, lastWeekCount: students.lastWeekCount })
      .from(students),
    db
      .select({
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .where(inArray(attendanceRecords.journalDate, weekDates)),
    db
      .select({
        id: weeklyCountAccruals.id,
        studentId: weeklyCountAccruals.studentId,
        sessionCount: weeklyCountAccruals.sessionCount,
      })
      .from(weeklyCountAccruals)
      .where(eq(weeklyCountAccruals.weekStart, weekStart)),
  ]);
  const sessionsByStudent = new Map<number, number>();
  for (const attendance of attendanceRows) {
    const units = getAttendanceSessionUnits(
      attendance.status as AttendanceStatus
    );
    sessionsByStudent.set(
      attendance.studentId,
      (sessionsByStudent.get(attendance.studentId) ?? 0) + units
    );
  }
  const accrualByStudent = new Map(
    accrualRows.map(row => [row.studentId, row])
  );

  await db.transaction(async tx => {
    for (const student of studentRows) {
      const nextSessionCount = sessionsByStudent.get(student.id) ?? 0;
      const existing = accrualByStudent.get(student.id);
      const previousSessionCount = Number(existing?.sessionCount ?? 0);
      const delta = nextSessionCount - previousSessionCount;
      if (existing) {
        if (delta !== 0) {
          await tx
            .update(students)
            .set({ lastWeekCount: sql`${students.lastWeekCount} + ${delta}` })
            .where(eq(students.id, student.id));
        }
        await tx
          .update(weeklyCountAccruals)
          .set({ sessionCount: nextSessionCount })
          .where(eq(weeklyCountAccruals.id, existing.id));
      } else {
        await tx
          .insert(weeklyCountAccruals)
          .values({
            studentId: student.id,
            weekStart,
            sessionCount: nextSessionCount,
          });
        if (nextSessionCount !== 0) {
          await tx
            .update(students)
            .set({
              lastWeekCount: sql`${students.lastWeekCount} + ${nextSessionCount}`,
            })
            .where(eq(students.id, student.id));
        }
      }
    }
  });
  weeklyCountSettlementCache = { weekStart, checkedAt: Date.now() };
}

export type StudentInput = {
  name: string;
  grade: string;
  studentNumber?: string;
  studentPhone?: string;
  parentPhone?: string;
  memo?: string;
  tuition: number;
  tuitionMode: "automatic" | "manual";
  registrationCount: number;
  lastWeekCount: number;
  totalCount: number;
  validUntil?: string;
  paymentMethod?: string;
  remainingTwoAlertMessage?: string;
  attendanceCode?: string;
  classGroupIds: number[];
  portalEnabled: boolean;
};

export type TuitionStandardInput = {
  schoolLevel: "elementary" | "middle" | "high";
  monthlySessionCount: number;
  subjectCountTier: number;
  tuition: number;
};

export async function listTuitionStandards() {
  const db = await requireDb();
  return db
    .select()
    .from(tuitionStandards)
    .orderBy(
      asc(tuitionStandards.monthlySessionCount),
      asc(tuitionStandards.schoolLevel),
      asc(tuitionStandards.subjectCountTier)
    );
}

export async function updateTuitionStandards(
  standards: TuitionStandardInput[]
) {
  const db = await requireDb();
  await db.transaction(async tx => {
    for (const standard of standards) {
      await tx
        .insert(tuitionStandards)
        .values(standard)
        .onDuplicateKeyUpdate({ set: { tuition: standard.tuition } });
    }
  });
}

async function resolveStudentTuition(input: StudentInput) {
  if (input.tuitionMode === "manual") return input.tuition;
  const standard = getAutomaticTuitionMatch(
    input.grade,
    input.registrationCount,
    new Set(input.classGroupIds).size,
    await listTuitionStandards()
  );
  if (!standard)
    throw new Error(
      "선택한 학년·수강 과목·등록 횟수에 맞는 원비 기준이 없습니다. 개별 원비를 입력해 주세요."
    );
  return standard.tuition;
}

export async function listClassGroups() {
  const db = await requireDb();
  return db
    .select()
    .from(classGroups)
    .where(eq(classGroups.active, true))
    .orderBy(asc(classGroups.name));
}

export async function listStudents(
  weekAnchor = new Date().toISOString().slice(0, 10),
  active = true
) {
  await settlePreviousWeekCounts();
  const db = await requireDb();
  const rows = await db
    .select({
      studentId: students.id,
      name: students.name,
      grade: students.grade,
      studentNumber: students.studentNumber,
      studentPhone: students.studentPhone,
      parentPhone: students.parentPhone,
      memo: students.memo,
      tuition: students.tuition,
      tuitionMode: students.tuitionMode,
      registrationCount: students.registrationCount,
      lastWeekCount: students.lastWeekCount,
      totalCount: students.totalCount,
      validUntil: students.validUntil,
      paymentMethod: students.paymentMethod,
      tuitionAlert: students.tuitionAlert,
      vocabularyResultUrl: students.vocabularyResultUrl,
      englishSpeakingUrl: students.englishSpeakingUrl,
      mathUnitEvaluationUrl: students.mathUnitEvaluationUrl,
      familyKey: students.familyKey,
      publicToken: students.publicToken,
      attendanceCode: students.attendanceCode,
      portalEnabled: students.portalEnabled,
      classGroupId: classGroups.id,
      classGroupName: classGroups.name,
      classSubject: classGroups.subject,
    })
    .from(students)
    .leftJoin(
      studentEnrollments,
      and(
        eq(studentEnrollments.studentId, students.id),
        eq(studentEnrollments.active, true)
      )
    )
    .leftJoin(
      classGroups,
      and(
        eq(classGroups.id, studentEnrollments.classGroupId),
        eq(classGroups.active, true)
      )
    )
    .where(eq(students.active, active))
    .orderBy(asc(students.grade), asc(students.name));

  const result = new Map<
    number,
    {
      id: number;
      name: string;
      grade: string;
      studentNumber: string | null;
      studentPhone: string | null;
      parentPhone: string | null;
      memo: string | null;
      tuition: number;
      tuitionMode: "automatic" | "manual";
      registrationCount: number;
      lastWeekCount: number;
      totalCount: number;
      validUntil: string | null;
      paymentMethod: string | null;
      tuitionAlert: string | null;
      vocabularyResultUrl: string | null;
      englishSpeakingUrl: string | null;
      mathUnitEvaluationUrl: string | null;
      familyKey: string | null;
      publicToken: string;
      attendanceCode: string;
      portalEnabled: boolean;
      active: boolean;
      classGroups: Array<{ id: number; name: string; subject: string }>;
    }
  >();
  for (const row of rows) {
    if (!result.has(row.studentId)) {
      result.set(row.studentId, {
        id: row.studentId,
        name: row.name,
        grade: row.grade,
        studentNumber: row.studentNumber,
        studentPhone: row.studentPhone,
        parentPhone: row.parentPhone,
        memo: row.memo,
        tuition: Number(row.tuition ?? 0),
        tuitionMode: row.tuitionMode,
        registrationCount: Number(row.registrationCount ?? 0),
        lastWeekCount: Number(row.lastWeekCount ?? 0),
        totalCount: Number(row.totalCount ?? 0),
        validUntil: row.validUntil,
        paymentMethod: row.paymentMethod,
        tuitionAlert: row.tuitionAlert,
        vocabularyResultUrl: row.vocabularyResultUrl,
        englishSpeakingUrl: row.englishSpeakingUrl,
        mathUnitEvaluationUrl: row.mathUnitEvaluationUrl,
        familyKey: row.familyKey,
        publicToken: row.publicToken,
        attendanceCode: row.attendanceCode,
        portalEnabled: row.portalEnabled,
        active,
        classGroups: [],
      });
    }
    if (row.classGroupId && row.classGroupName && row.classSubject) {
      result
        .get(row.studentId)
        ?.classGroups.push({
          id: row.classGroupId,
          name: row.classGroupName,
          subject: row.classSubject,
        });
    }
  }
  const records = Array.from(result.values());
  const notificationSettings = records.length
    ? await db
        .select()
        .from(studentRemainingCountNotifications)
        .where(
          inArray(
            studentRemainingCountNotifications.studentId,
            records.map(student => student.id)
          )
        )
    : [];
  const notificationSettingsByStudent = new Map(
    notificationSettings.map(setting => [setting.studentId, setting])
  );
  const pushSubscriptionRows = records.length
    ? await db
        .select({
          id: parentPushSubscriptions.id,
          studentId: parentPushSubscriptions.studentId,
          userAgent: parentPushSubscriptions.userAgent,
          updatedAt: parentPushSubscriptions.updatedAt,
        })
        .from(parentPushSubscriptions)
        .where(
          inArray(
            parentPushSubscriptions.studentId,
            records.map(student => student.id)
          )
        )
        .orderBy(asc(parentPushSubscriptions.createdAt))
    : [];
  const pushDevicesByStudent = new Map<
    number,
    Array<{ id: number; label: string; updatedAt: Date }>
  >();
  for (const subscription of pushSubscriptionRows) {
    const devices = pushDevicesByStudent.get(subscription.studentId) ?? [];
    devices.push({
      id: subscription.id,
      label: getPushDeviceLabel(subscription.userAgent),
      updatedAt: subscription.updatedAt,
    });
    pushDevicesByStudent.set(subscription.studentId, devices);
  }
  const currentMonth = todayInKorea().slice(0, 7);
  const monthlyViews = records.length
    ? await db
        .select({
          studentId: parentPortalMonthlyViews.studentId,
          viewCount: parentPortalMonthlyViews.viewCount,
        })
        .from(parentPortalMonthlyViews)
        .where(
          and(
            eq(parentPortalMonthlyViews.monthKey, currentMonth),
            inArray(parentPortalMonthlyViews.studentId, records.map(student => student.id))
          )
        )
    : [];
  const monthlyViewsByStudent = new Map(
    monthlyViews.map(item => [item.studentId, Number(item.viewCount ?? 0)])
  );
  const studentIds = records.map(student => student.id);
  const dates = getBusinessWeekDates(weekAnchor);
  const attendance = studentIds.length
    ? await db
        .select({
          studentId: attendanceRecords.studentId,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .where(
          and(
            inArray(attendanceRecords.studentId, studentIds),
            inArray(attendanceRecords.journalDate, dates)
          )
        )
    : [];
  const weeklySessions = new Map<number, number>();
  for (const record of attendance) {
    const increment = getAttendanceSessionUnits(
      record.status as AttendanceStatus
    );
    weeklySessions.set(
      record.studentId,
      (weeklySessions.get(record.studentId) ?? 0) + increment
    );
  }
  return records.map(student => {
    const afterCount =
      student.lastWeekCount + (weeklySessions.get(student.id) ?? 0);
    const remainingCount = student.totalCount - afterCount;
    const dynamicAlert =
      remainingCount <= 0
        ? "미납★☆"
        : remainingCount < student.registrationCount
          ? `발송 ${Number(remainingCount.toFixed(1))}일★`
          : "";
    return {
      ...student,
      remainingTwoAlertMessage:
        notificationSettingsByStudent.get(student.id)?.message ?? "",
      remainingTwoAlertSentTotalCount:
        notificationSettingsByStudent.get(student.id)?.sentTotalCount ?? null,
      remainingTwoAlertLastAttemptedAt:
        notificationSettingsByStudent.get(student.id)?.lastAttemptedAt ?? null,
      pushDevices: pushDevicesByStudent.get(student.id) ?? [],
      monthlyViewCount: monthlyViewsByStudent.get(student.id) ?? 0,
      countInfo: {
        afterCount,
        remainingCount,
        weeklySessions: weeklySessions.get(student.id) ?? 0,
        alert: dynamicAlert || student.tuitionAlert || "",
      },
    };
  });
}

export async function getJournalWorkspace(
  journalDate: string,
  classGroupId?: number
) {
  const db = await requireDb();
  const conditions = [
    eq(studentEnrollments.active, true),
    eq(students.active, true),
    eq(classGroups.active, true),
  ];
  if (classGroupId) conditions.push(eq(classGroups.id, classGroupId));

  const rows = await db
    .select({
      classGroupId: classGroups.id,
      classGroupName: classGroups.name,
      classSubject: classGroups.subject,
      accentColor: classGroups.accentColor,
      studentId: students.id,
      studentName: students.name,
      studentGrade: students.grade,
      attendanceId: attendanceRecords.id,
      attendanceStatus: attendanceRecords.status,
      attendanceArrivalTime: attendanceRecords.arrivalTime,
      attendanceDepartureTime: attendanceRecords.departureTime,
      attendanceRecordedBy: attendanceRecords.recordedByUserId,
      journalId: lessonJournals.id,
      content: lessonJournals.content,
      homework: lessonJournals.homework,
      notes: lessonJournals.notes,
      journalIsDraft: lessonJournals.isDraft,
      journalCreatedBy: lessonJournals.createdByUserId,
      journalUpdatedBy: lessonJournals.updatedByUserId,
      journalUpdatedAt: lessonJournals.updatedAt,
    })
    .from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId))
    .innerJoin(classGroups, eq(classGroups.id, studentEnrollments.classGroupId))
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.studentId, students.id),
        eq(attendanceRecords.journalDate, journalDate)
      )
    )
    .leftJoin(
      lessonJournals,
      and(
        eq(lessonJournals.studentId, students.id),
        eq(lessonJournals.classGroupId, classGroups.id),
        eq(lessonJournals.journalDate, journalDate)
      )
    )
    .where(and(...conditions))
    .orderBy(asc(classGroups.name), asc(students.grade), asc(students.name));

  const calendarEvent = await getCalendarEventForDate(journalDate);
  return rows.map(row => {
    const hasManualAttendance = Boolean(
      row.attendanceId && row.attendanceStatus !== "not_entered"
    );
    const effectiveStatus = hasManualAttendance
      ? (row.attendanceStatus as AttendanceStatus)
      : (calendarEvent?.status ??
        (row.attendanceId ? (row.attendanceStatus as AttendanceStatus) : null));
    return {
      classGroup: {
        id: row.classGroupId,
        name: row.classGroupName,
        subject: row.classSubject,
        accentColor: row.accentColor,
      },
      student: {
        id: row.studentId,
        name: row.studentName,
        grade: row.studentGrade,
      },
      attendance: effectiveStatus
        ? {
            status: effectiveStatus,
            arrivalTime: hasManualAttendance ? row.attendanceArrivalTime : null,
            departureTime: hasManualAttendance ? row.attendanceDepartureTime : null,
            recordedByUserId: row.attendanceRecordedBy,
          }
        : null,
      calendarEvent,
      journal: row.journalId
        ? {
            id: row.journalId,
            content: row.content ?? "",
            homework: row.homework ?? "",
            notes: row.notes ?? "",
            isDraft: Boolean(row.journalIsDraft),
            createdByUserId: row.journalCreatedBy,
            updatedByUserId: row.journalUpdatedBy,
            updatedAt: row.journalUpdatedAt,
          }
        : null,
      completeness: getJournalCompleteness(
        effectiveStatus,
        row.content,
        row.homework,
        row.journalIsDraft ?? false
      ),
    };
  });
}

export async function getWeeklyWorkspace(
  weekAnchor: string,
  includeWeekend: boolean,
  classGroupId?: number,
  displayDates?: string[]
) {
  const dates =
    displayDates?.length === 3
      ? Array.from(new Set(displayDates)).sort()
      : getWeeklyDates(weekAnchor, includeWeekend);
  const days = await Promise.all(
    dates.map(async journalDate => ({
      journalDate,
      rows: await getJournalWorkspace(journalDate, classGroupId),
    }))
  );
  const studentIds = Array.from(
    new Set(days.flatMap(day => day.rows.map(row => row.student.id)))
  );
  const classGroupIds = Array.from(
    new Set(days.flatMap(day => day.rows.map(row => row.classGroup.id)))
  );
  const db = await requireDb();
  const comments =
    studentIds.length && classGroupIds.length
      ? await db
          .select({
            studentId: weeklySubjectComments.studentId,
            classGroupId: weeklySubjectComments.classGroupId,
            comment: weeklySubjectComments.comment,
          })
          .from(weeklySubjectComments)
          .where(
            and(
              eq(weeklySubjectComments.weekStart, getMonday(weekAnchor)),
              inArray(weeklySubjectComments.studentId, studentIds),
              inArray(weeklySubjectComments.classGroupId, classGroupIds)
            )
          )
      : [];
  return { dates, days, comments };
}

async function getDashboardWorkspace(journalDate: string) {
  const db = await requireDb();
  const rows = await db
    .select({
      classGroupId: classGroups.id,
      classGroupName: classGroups.name,
      classSubject: classGroups.subject,
      studentId: students.id,
      studentName: students.name,
      studentGrade: students.grade,
      attendanceId: attendanceRecords.id,
      attendanceStatus: attendanceRecords.status,
      attendanceArrivalTime: attendanceRecords.arrivalTime,
      attendanceDepartureTime: attendanceRecords.departureTime,
      attendanceRecordedBy: attendanceRecords.recordedByUserId,
      journalId: lessonJournals.id,
      content: lessonJournals.content,
      homework: lessonJournals.homework,
      journalIsDraft: lessonJournals.isDraft,
    })
    .from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId))
    .innerJoin(classGroups, eq(classGroups.id, studentEnrollments.classGroupId))
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.studentId, students.id),
        eq(attendanceRecords.journalDate, journalDate)
      )
    )
    .leftJoin(
      lessonJournals,
      and(
        eq(lessonJournals.studentId, students.id),
        eq(lessonJournals.classGroupId, classGroups.id),
        eq(lessonJournals.journalDate, journalDate)
      )
    )
    .where(
      and(
        eq(studentEnrollments.active, true),
        eq(students.active, true),
        eq(classGroups.active, true)
      )
    )
    .orderBy(asc(classGroups.name), asc(students.grade), asc(students.name));
  const calendarEvent = await getCalendarEventForDate(journalDate);
  return rows.map(row => {
    const hasManualAttendance = Boolean(
      row.attendanceId && row.attendanceStatus !== "not_entered"
    );
    const effectiveStatus = hasManualAttendance
      ? (row.attendanceStatus as AttendanceStatus)
      : (calendarEvent?.status ??
        (row.attendanceId ? (row.attendanceStatus as AttendanceStatus) : null));
    return {
      classGroup: {
        id: row.classGroupId,
        name: row.classGroupName,
        subject: row.classSubject,
      },
      student: {
        id: row.studentId,
        name: row.studentName,
        grade: row.studentGrade,
      },
      attendance: effectiveStatus
        ? {
            status: effectiveStatus,
            arrivalTime: hasManualAttendance ? row.attendanceArrivalTime : null,
            departureTime: hasManualAttendance ? row.attendanceDepartureTime : null,
            recordedByUserId: row.attendanceRecordedBy,
          }
        : null,
      journal: row.journalId
        ? {
            content: row.content ?? "",
            homework: row.homework ?? "",
            isDraft: Boolean(row.journalIsDraft),
          }
        : null,
      completeness: getJournalCompleteness(
        effectiveStatus,
        row.content,
        row.homework,
        row.journalIsDraft ?? false
      ),
    };
  });
}

export async function getDashboard(journalDate: string) {
  const workspace = await getDashboardWorkspace(journalDate);
  const studentSummary = new Map<
    number,
    {
      id: number;
      name: string;
      grade: string;
      attendanceStatus: AttendanceStatus | null;
      arrivalTime: string | null;
      departureTime: string | null;
      total: number;
      complete: number;
      attention: number;
      classGroups: Map<
        number,
        {
          id: number;
          subject: string;
          journalState: "complete" | "attention" | "not_required";
        }
      >;
    }
  >();
  for (const row of workspace) {
    const existing = studentSummary.get(row.student.id) ?? {
      id: row.student.id,
      name: row.student.name,
      grade: row.student.grade,
      attendanceStatus: row.attendance?.status ?? null,
      arrivalTime: row.attendance?.arrivalTime ?? null,
      departureTime: row.attendance?.departureTime ?? null,
      total: 0,
      complete: 0,
      attention: 0,
      classGroups: new Map(),
    };
    existing.attendanceStatus =
      row.attendance?.status ?? existing.attendanceStatus;
    existing.arrivalTime = row.attendance?.arrivalTime ?? existing.arrivalTime;
    existing.departureTime = row.attendance?.departureTime ?? existing.departureTime;
    existing.classGroups.set(row.classGroup.id, {
      id: row.classGroup.id,
      subject: row.classGroup.subject,
      journalState: row.completeness.state,
    });
    existing.total += 1;
    if (
      row.completeness.state === "complete" ||
      row.completeness.state === "not_required"
    )
      existing.complete += 1;
    if (row.completeness.state === "attention") existing.attention += 1;
    studentSummary.set(row.student.id, existing);
  }
  const studentsForDay = Array.from(studentSummary.values())
    .map(({ classGroups, ...student }) => ({
      ...student,
      classGroups: Array.from(classGroups.values()).sort((a, b) =>
        a.subject.localeCompare(b.subject, "ko")
      ),
    }))
    .sort(
      (a, b) =>
        a.grade.localeCompare(b.grade, "ko") ||
        a.name.localeCompare(b.name, "ko")
    );
  const attendancePendingStudents = studentsForDay
    .filter(student => isAttendancePending(student.attendanceStatus))
    .map(student => ({
      id: student.id,
      name: student.name,
      grade: student.grade,
    }));
  const journalAttentionItems = workspace
    .filter(row => row.completeness.state === "attention")
    .map(row => ({
      studentId: row.student.id,
      studentName: row.student.name,
      studentGrade: row.student.grade,
      classGroupId: row.classGroup.id,
      subject: row.classGroup.subject,
    }));
  const countAlertStudents = (await listStudents(journalDate, true))
    .filter(student => Boolean(student.countInfo.alert))
    .sort(
      (a, b) =>
        a.countInfo.remainingCount - b.countInfo.remainingCount ||
        a.name.localeCompare(b.name, "ko")
    )
    .map(student => ({
      id: student.id,
      name: student.name,
      remainingCount: student.countInfo.remainingCount,
    }));
  return {
    stats: {
      enrolledStudents: studentsForDay.length,
      journalsTotal: workspace.length,
      journalsComplete: workspace.filter(
        row => row.completeness.state !== "attention"
      ).length,
      needsAttention: workspace.filter(
        row => row.completeness.state === "attention"
      ).length,
      attendancePending: attendancePendingStudents.length,
    },
    students: studentsForDay,
    attendancePendingStudents,
    journalAttentionItems,
    countAlertStudents,
  };
}

export async function createClassGroup(input: ClassGroupInput, userId: number) {
  const db = await requireDb();
  await db
    .insert(classGroups)
    .values({
      ...input,
      meetingDays: serializeMeetingDays(input.meetingDays),
      description: input.description || null,
      accentColor: input.accentColor || "#234E52",
      createdByUserId: userId,
    });
}

export async function updateClassGroup(id: number, input: ClassGroupInput) {
  const db = await requireDb();
  await db
    .update(classGroups)
    .set({
      ...input,
      meetingDays: serializeMeetingDays(input.meetingDays),
      description: input.description || null,
      accentColor: input.accentColor || "#234E52",
    })
    .where(eq(classGroups.id, id));
}

export async function archiveClassGroup(id: number) {
  const db = await requireDb();
  await db
    .update(classGroups)
    .set({ active: false })
    .where(eq(classGroups.id, id));
  await db
    .update(studentEnrollments)
    .set({ active: false })
    .where(eq(studentEnrollments.classGroupId, id));
}

export async function createStudent(
  input: StudentInput,
  userId: number,
  publicToken: string
) {
  const db = await requireDb();
  const tuition = await resolveStudentTuition(input);
  const attendanceCode = await generateUniqueAttendanceCode();
  const inserted = await db
    .insert(students)
    .values({
      name: input.name,
      grade: input.grade,
      studentNumber: input.studentNumber || null,
      studentPhone: input.studentPhone || null,
      parentPhone: input.parentPhone || null,
      memo: input.memo || null,
      tuition,
      tuitionMode: input.tuitionMode,
      registrationCount: input.registrationCount,
      lastWeekCount: input.lastWeekCount,
      totalCount: input.totalCount,
      validUntil: input.validUntil || null,
      paymentMethod: input.paymentMethod || null,
      portalEnabled: input.portalEnabled,
      publicToken,
      attendanceCode,
      createdByUserId: userId,
    })
    .$returningId();
  const studentId = inserted[0]?.id;
  if (!studentId) throw new Error("학생을 생성하지 못했습니다.");
  await db.insert(studentRemainingCountNotifications).values({
    studentId,
    message: input.remainingTwoAlertMessage || "",
  });
  if (input.classGroupIds.length) {
    await db
      .insert(studentEnrollments)
      .values(
        input.classGroupIds.map(classGroupId => ({
          studentId,
          classGroupId,
          active: true,
        }))
      );
  }
  return studentId;
}

export async function updateStudent(
  id: number,
  input: StudentInput,
  userId: number
) {
  const db = await requireDb();
  const tuition = await resolveStudentTuition(input);
  return db.transaction(async tx => {
    const found = await tx
      .select({
        name: students.name,
        totalCount: students.totalCount,
        registrationCount: students.registrationCount,
      })
      .from(students)
      .where(and(eq(students.id, id), eq(students.active, true)))
      .limit(1);
    const student = found[0];
    if (!student) throw new Error("등록된 학생을 찾을 수 없습니다.");
    const beforeTotalCount = Number(student.totalCount ?? 0);
    const afterTotalCount = input.totalCount;
    const totalCountChanged = beforeTotalCount !== afterTotalCount;
    if (input.attendanceCode) {
      const duplicate = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.attendanceCode, input.attendanceCode),
            ne(students.id, id)
          )
        )
        .limit(1);
      if (duplicate[0]) throw new Error("이미 다른 학생이 사용 중인 출결번호입니다.");
    }
    await tx
      .update(students)
      .set({
        name: input.name,
        grade: input.grade,
        studentNumber: input.studentNumber || null,
        studentPhone: input.studentPhone || null,
        parentPhone: input.parentPhone || null,
        memo: input.memo || null,
        tuition,
        tuitionMode: input.tuitionMode,
        registrationCount: input.registrationCount,
        lastWeekCount: input.lastWeekCount,
        totalCount: input.totalCount,
        validUntil: totalCountChanged
          ? getValidUntilAfterTotalCountChange(todayInKorea())
          : input.validUntil || null,
        paymentMethod: input.paymentMethod || null,
        portalEnabled: input.portalEnabled,
        ...(input.attendanceCode ? { attendanceCode: input.attendanceCode } : {}),
      })
      .where(eq(students.id, id));
    await tx
      .insert(studentRemainingCountNotifications)
      .values({
        studentId: id,
        message: input.remainingTwoAlertMessage || "",
      })
      .onDuplicateKeyUpdate({
        set: { message: input.remainingTwoAlertMessage || "" },
      });
    if (totalCountChanged) {
      await tx
        .insert(registrationCountHistories)
        .values({
          studentId: id,
          changeType: "manual_adjustment",
          registrationCount: Number(student.registrationCount ?? 0),
          addedCount: afterTotalCount - beforeTotalCount,
          beforeTotalCount,
          afterTotalCount,
          createdByUserId: userId,
        });
    }
    await tx
      .update(studentEnrollments)
      .set({ active: false })
      .where(eq(studentEnrollments.studentId, id));
    if (input.classGroupIds.length) {
      await tx
        .insert(studentEnrollments)
        .values(
          input.classGroupIds.map(classGroupId => ({
            studentId: id,
            classGroupId,
            active: true,
          }))
        )
        .onDuplicateKeyUpdate({ set: { active: true } });
    }
    return {
      studentId: id,
      studentName: input.name || student.name,
      beforeTotalCount,
      afterTotalCount,
      totalCountChanged,
    };
  });
}

export async function archiveStudent(id: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(students).set({ active: false }).where(eq(students.id, id));
    await tx
      .update(studentEnrollments)
      .set({ active: false })
      .where(eq(studentEnrollments.studentId, id));
  });
}

export async function restoreStudent(id: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const found = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.active, false)))
      .limit(1);
    if (!found[0]) throw new Error("비활성 학생을 찾을 수 없습니다.");
    await tx.update(students).set({ active: true }).where(eq(students.id, id));
    await tx
      .update(studentEnrollments)
      .set({ active: true })
      .where(eq(studentEnrollments.studentId, id));
  });
}

export async function purgeStudent(id: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const found = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.active, false)))
      .limit(1);
    if (!found[0]) throw new Error("완전 삭제는 비활성 학생만 할 수 있습니다.");
    await tx
      .delete(registrationCountHistories)
      .where(eq(registrationCountHistories.studentId, id));
    await tx
      .delete(attendanceEntryEvents)
      .where(eq(attendanceEntryEvents.studentId, id));
    await tx
      .delete(parentPushSubscriptions)
      .where(eq(parentPushSubscriptions.studentId, id));
    await tx
      .delete(studentRemainingCountNotifications)
      .where(eq(studentRemainingCountNotifications.studentId, id));
    await tx
      .delete(notificationDeliveryLogs)
      .where(eq(notificationDeliveryLogs.studentId, id));
    await tx
      .delete(weeklyCountAccruals)
      .where(eq(weeklyCountAccruals.studentId, id));
    await tx
      .delete(weeklySubjectComments)
      .where(eq(weeklySubjectComments.studentId, id));
    await tx.delete(lessonJournals).where(eq(lessonJournals.studentId, id));
    await tx
      .delete(attendanceRecords)
      .where(eq(attendanceRecords.studentId, id));
    await tx
      .delete(studentEnrollments)
      .where(eq(studentEnrollments.studentId, id));
    await tx.delete(students).where(eq(students.id, id));
  });
}

export async function addStudentRegistrationCount(id: number, userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const found = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.active, true)))
      .limit(1);
    const student = found[0];
    if (!student) throw new Error("등록된 학생을 찾을 수 없습니다.");
    const registrationCount = Number(student.registrationCount ?? 0);
    if (registrationCount <= 0)
      throw new Error(
        "등록 횟수가 0입니다. 학생 정보에서 등록 횟수를 먼저 입력해 주세요."
      );
    const oldTotal = Number(student.totalCount ?? 0);
    const added = registrationCount * 4;
    const newTotal = oldTotal + added;
    await tx
      .update(students)
      .set({
        totalCount: newTotal,
        validUntil: getValidUntilAfterTotalCountChange(todayInKorea()),
        tuitionAlert: null,
      })
      .where(eq(students.id, id));
    await tx
      .insert(registrationCountHistories)
      .values({
        studentId: id,
        changeType: "registration_add",
        registrationCount,
        addedCount: added,
        beforeTotalCount: oldTotal,
        afterTotalCount: newTotal,
        createdByUserId: userId,
      });
    return { registrationCount, added, oldTotal, newTotal };
  });
}

export async function adjustStudentTotalCount(
  id: number,
  delta: number,
  userId: number
) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const found = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.active, true)))
      .limit(1);
    const student = found[0];
    if (!student) throw new Error("등록된 학생을 찾을 수 없습니다.");
    const oldTotal = Number(student.totalCount ?? 0);
    const newTotal = oldTotal + delta;
    if (newTotal < 0)
      throw new Error("총 횟수는 0회보다 작게 조정할 수 없습니다.");
    await tx
      .update(students)
      .set({
        totalCount: newTotal,
        validUntil: getValidUntilAfterTotalCountChange(todayInKorea()),
        tuitionAlert: null,
      })
      .where(eq(students.id, id));
    await tx
      .insert(registrationCountHistories)
      .values({
        studentId: id,
        changeType: "manual_adjustment",
        registrationCount: Number(student.registrationCount ?? 0),
        addedCount: delta,
        beforeTotalCount: oldTotal,
        afterTotalCount: newTotal,
        createdByUserId: userId,
      });
    return { added: delta, oldTotal, newTotal };
  });
}

export async function getStudentRegistrationCountHistories(studentId: number) {
  const db = await requireDb();
  return db
    .select({
      id: registrationCountHistories.id,
      changeType: registrationCountHistories.changeType,
      registrationCount: registrationCountHistories.registrationCount,
      addedCount: registrationCountHistories.addedCount,
      beforeTotalCount: registrationCountHistories.beforeTotalCount,
      afterTotalCount: registrationCountHistories.afterTotalCount,
      createdAt: registrationCountHistories.createdAt,
      recordedBy: users.name,
    })
    .from(registrationCountHistories)
    .leftJoin(users, eq(users.id, registrationCountHistories.createdByUserId))
    .where(eq(registrationCountHistories.studentId, studentId))
    .orderBy(
      desc(registrationCountHistories.createdAt),
      desc(registrationCountHistories.id)
    );
}

export async function updateStudentLearningLinks(
  id: number,
  input: {
    vocabularyResultUrl: string;
    englishSpeakingUrl: string;
    mathUnitEvaluationUrl: string;
  }
) {
  const db = await requireDb();
  const found = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, id), eq(students.active, true)))
    .limit(1);
  if (!found[0]) throw new Error("등록된 학생을 찾을 수 없습니다.");
  await db
    .update(students)
    .set({
      vocabularyResultUrl: input.vocabularyResultUrl || null,
      englishSpeakingUrl: input.englishSpeakingUrl || null,
      mathUnitEvaluationUrl: input.mathUnitEvaluationUrl || null,
    })
    .where(eq(students.id, id));
}

export async function rotateStudentPublicToken(
  id: number,
  publicToken: string
) {
  const db = await requireDb();
  const found = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, id), eq(students.active, true)))
    .limit(1);
  if (!found[0]) throw new Error("등록된 학생을 찾을 수 없습니다.");
  await db
    .update(students)
    .set({ publicToken, portalEnabled: true })
    .where(eq(students.id, id));
  return { publicToken };
}

/**
 * 보호자 공유 링크 화면에서 관리자가 형제·자매를 직접 묶어 하나의
 * familyKey를 공유하게 한다. 이미 형제·자매 그룹이 있는 학생을 선택하면
 * 그 그룹을 그대로 재사용(병합)하고, 아무도 그룹이 없으면 새 키를 만든다.
 */
export async function setStudentFamily(studentId: number, siblingIds: number[]) {
  const db = await requireDb();
  const memberIds = Array.from(new Set([studentId, ...siblingIds]));
  if (memberIds.length < 2)
    throw new Error("함께 묶을 형제·자매 학생을 한 명 이상 선택해 주세요.");
  const members = await db
    .select({ id: students.id, familyKey: students.familyKey })
    .from(students)
    .where(and(inArray(students.id, memberIds), eq(students.active, true)));
  if (members.length !== memberIds.length)
    throw new Error("선택한 학생 중 일부를 찾을 수 없습니다.");
  const existingKey = members.find(member => member.familyKey)?.familyKey;
  const familyKey = existingKey ?? `family-${randomBytes(6).toString("hex")}`;
  await db
    .update(students)
    .set({ familyKey })
    .where(inArray(students.id, memberIds));
  return { familyKey, memberIds };
}

/**
 * 학생 한 명을 형제·자매 공동 PWA 그룹에서 제외한다. 제외 후 그룹에
 * 한 명만 남으면 의미가 없으므로 그 학생의 familyKey도 함께 지운다.
 */
export async function removeStudentFromFamily(studentId: number) {
  const db = await requireDb();
  const found = await db
    .select({ id: students.id, familyKey: students.familyKey })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.active, true)))
    .limit(1);
  if (!found[0]) throw new Error("등록된 학생을 찾을 수 없습니다.");
  const { familyKey } = found[0];
  if (!familyKey) return { familyKey: null };
  await db
    .update(students)
    .set({ familyKey: null })
    .where(eq(students.id, studentId));
  const remaining = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.familyKey, familyKey), eq(students.active, true)));
  if (remaining.length === 1)
    await db
      .update(students)
      .set({ familyKey: null })
      .where(eq(students.id, remaining[0]!.id));
  return { familyKey: null };
}

async function generateUniqueAttendanceCode() {
  const db = await requireDb();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(randomInt(1000, 10000));
    const found = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.attendanceCode, code))
      .limit(1);
    if (!found[0]) return code;
  }
  throw new Error("학생 출결번호를 생성하지 못했습니다. 다시 시도해 주세요.");
}

export async function getAttendanceCodePreview(
  code: string,
  eventDate: string
) {
  const db = await requireDb();
  const found = await db
    .select({ id: students.id, name: students.name, grade: students.grade })
    .from(students)
    .where(and(eq(students.attendanceCode, code), eq(students.active, true)))
    .limit(1);
  const student = found[0];
  if (!student) return null;
  const events = await db
    .select({
      eventType: attendanceEntryEvents.eventType,
      occurredAt: attendanceEntryEvents.occurredAt,
    })
    .from(attendanceEntryEvents)
    .where(
      and(
        eq(attendanceEntryEvents.studentId, student.id),
        eq(attendanceEntryEvents.eventDate, eventDate)
      )
    )
    .orderBy(asc(attendanceEntryEvents.occurredAt));
  const hasCheckIn = events.some(event => event.eventType === "check_in");
  const hasCheckOut = events.some(event => event.eventType === "check_out");
  return {
    student,
    nextEventType: !hasCheckIn
      ? ("check_in" as const)
      : !hasCheckOut
        ? ("check_out" as const)
        : null,
    events,
  };
}

export async function recordAttendanceCodeEvent(
  code: string,
  eventDate: string
) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const found = await tx
      .select({
        id: students.id,
        name: students.name,
        grade: students.grade,
        createdByUserId: students.createdByUserId,
      })
      .from(students)
      .where(and(eq(students.attendanceCode, code), eq(students.active, true)))
      .limit(1);
    const student = found[0];
    if (!student)
      throw new Error("출결번호와 일치하는 학생을 찾을 수 없습니다.");
    const events = await tx
      .select({ eventType: attendanceEntryEvents.eventType })
      .from(attendanceEntryEvents)
      .where(
        and(
          eq(attendanceEntryEvents.studentId, student.id),
          eq(attendanceEntryEvents.eventDate, eventDate)
        )
      );
    const hasCheckIn = events.some(event => event.eventType === "check_in");
    const hasCheckOut = events.some(event => event.eventType === "check_out");
    const eventType = !hasCheckIn
      ? ("check_in" as const)
      : !hasCheckOut
        ? ("check_out" as const)
        : null;
    if (!eventType)
      throw new Error("오늘 등원과 하원 입력이 모두 완료되었습니다.");
    const occurredAt = new Date();
    await tx
      .insert(attendanceEntryEvents)
      .values({ studentId: student.id, eventDate, eventType, occurredAt });
    const eventTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(occurredAt);
    if (eventType === "check_in") {
      await tx
        .insert(attendanceRecords)
        .values({
          studentId: student.id,
          journalDate: eventDate,
          status: "present",
          arrivalTime: eventTime,
          recordedByUserId: student.createdByUserId,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "present",
            arrivalTime: eventTime,
            recordedByUserId: student.createdByUserId,
          },
        });
    } else {
      await tx
        .insert(attendanceRecords)
        .values({
          studentId: student.id,
          journalDate: eventDate,
          status: "present",
          departureTime: eventTime,
          recordedByUserId: student.createdByUserId,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "present",
            departureTime: eventTime,
            recordedByUserId: student.createdByUserId,
          },
        });
    }
    return {
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      eventType,
      occurredAt,
    };
  });
}

export async function resetAttendanceCodeEvents(
  studentId: number,
  eventDate: string
) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const events = await tx
      .select({ id: attendanceEntryEvents.id })
      .from(attendanceEntryEvents)
      .where(
        and(
          eq(attendanceEntryEvents.studentId, studentId),
          eq(attendanceEntryEvents.eventDate, eventDate)
        )
      );
    if (!events.length) return { reset: false, deletedEvents: 0 };
    await tx
      .delete(attendanceEntryEvents)
      .where(
        and(
          eq(attendanceEntryEvents.studentId, studentId),
          eq(attendanceEntryEvents.eventDate, eventDate)
        )
      );
    await tx
      .update(attendanceRecords)
      .set({ arrivalTime: null, departureTime: null })
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.journalDate, eventDate)
        )
      );
    return { reset: true, deletedEvents: events.length };
  });
}

export async function getPushStudentByToken(token: string) {
  const family = await getPortalFamilyByToken(token);
  return family.find(student => student.publicToken === token) ?? null;
}

export async function getStudentNotificationIdentity(studentId: number) {
  const db = await requireDb();
  const result = await db
    .select({
      id: students.id,
      name: students.name,
      publicToken: students.publicToken,
      portalEnabled: students.portalEnabled,
    })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.active, true)))
    .limit(1);
  return result[0] ?? null;
}

export async function listRemainingTwoNotificationCandidates(
  today = todayInKorea()
) {
  const studentRows = await listStudents(today, true);
  return studentRows
    .filter(student =>
      shouldSendRemainingTwoNotification({
        portalEnabled: student.portalEnabled,
        message: student.remainingTwoAlertMessage,
        remainingCount: student.countInfo.remainingCount,
        totalCount: student.totalCount,
        sentTotalCount: student.remainingTwoAlertSentTotalCount,
      })
    )
    .map(student => ({
      id: student.id,
      name: student.name,
      publicToken: student.publicToken,
      totalCount: student.totalCount,
      message: student.remainingTwoAlertMessage.trim(),
    }));
}

export async function markRemainingTwoNotificationAttempt(
  studentId: number,
  totalCount: number,
  attemptedAt: Date
) {
  const db = await requireDb();
  await db
    .update(studentRemainingCountNotifications)
    .set({ sentTotalCount: totalCount, lastAttemptedAt: attemptedAt })
    .where(eq(studentRemainingCountNotifications.studentId, studentId));
}

export type NotificationDeliveryType =
  | "attendance_check_in"
  | "attendance_check_out"
  | "remaining_two"
  | "total_count"
  | "test";

export async function createNotificationDeliveryLog(input: {
  studentId: number;
  notificationType: NotificationDeliveryType;
  title: string;
  body: string;
  eventDate?: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  unavailable: boolean;
}) {
  const db = await requireDb();
  await db.insert(notificationDeliveryLogs).values({
    ...input,
    eventDate: input.eventDate || null,
  });
}

export async function listNotificationDeliveryLogs(limit = 500) {
  const db = await requireDb();
  return db
    .select({
      id: notificationDeliveryLogs.id,
      studentId: notificationDeliveryLogs.studentId,
      studentName: students.name,
      notificationType: notificationDeliveryLogs.notificationType,
      title: notificationDeliveryLogs.title,
      body: notificationDeliveryLogs.body,
      eventDate: notificationDeliveryLogs.eventDate,
      targetCount: notificationDeliveryLogs.targetCount,
      sentCount: notificationDeliveryLogs.sentCount,
      failedCount: notificationDeliveryLogs.failedCount,
      unavailable: notificationDeliveryLogs.unavailable,
      createdAt: notificationDeliveryLogs.createdAt,
    })
    .from(notificationDeliveryLogs)
    .innerJoin(students, eq(students.id, notificationDeliveryLogs.studentId))
    .orderBy(desc(notificationDeliveryLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 1000));
}

export async function upsertParentPushSubscription(input: {
  studentId: number;
  endpointHash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const db = await requireDb();
  await db
    .insert(parentPushSubscriptions)
    .values({ ...input, userAgent: input.userAgent || null })
    .onDuplicateKeyUpdate({
      set: {
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent || null,
      },
    });
}

export async function removeParentPushSubscription(
  studentId: number,
  endpointHash: string
) {
  const db = await requireDb();
  await db
    .delete(parentPushSubscriptions)
    .where(
      and(
        eq(parentPushSubscriptions.studentId, studentId),
        eq(parentPushSubscriptions.endpointHash, endpointHash)
      )
    );
}

export async function removeParentPushSubscriptionsByEndpointHash(
  endpointHash: string
) {
  const db = await requireDb();
  const result = await db
    .delete(parentPushSubscriptions)
    .where(eq(parentPushSubscriptions.endpointHash, endpointHash));
  return { removed: Number(result[0]?.affectedRows ?? 0) };
}

export async function listParentPushSubscriptions(studentId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(parentPushSubscriptions)
    .where(eq(parentPushSubscriptions.studentId, studentId));
}

export async function deleteParentPushSubscription(id: number) {
  const db = await requireDb();
  await db
    .delete(parentPushSubscriptions)
    .where(eq(parentPushSubscriptions.id, id));
}

export async function getAttendanceRecord(
  studentId: number,
  journalDate: string
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.journalDate, journalDate)
      )
    )
    .limit(1);
  return rows[0];
}

function hasJournalValue(
  row: Pick<
    typeof lessonJournals.$inferSelect,
    "content" | "homework" | "notes"
  >
) {
  return shouldTransferJournalForAttendance("absent", row);
}

export async function saveAttendance(input: {
  studentId: number;
  journalDate: string;
  status: AttendanceStatus;
  arrivalTime?: string;
  departureTime?: string;
  overwriteCurrentJournal?: boolean;
  userId: number;
}) {
  const db = await requireDb();
  const arrivalTime =
    input.status === "absent" ||
    input.status === "not_registered" ||
    input.status === "holiday" ||
    input.status === "closed"
      ? null
      : input.arrivalTime?.trim() || null;
  const departureTime =
    input.status === "absent" ||
    input.status === "not_registered" ||
    input.status === "holiday" ||
    input.status === "closed"
      ? null
      : input.departureTime?.trim() || null;
  const requiresTransfer =
    input.status === "absent" ||
    input.status === "not_registered" ||
    input.status === "holiday" ||
    input.status === "closed";

  const result = await db.transaction(async tx => {
    const previousAttendance = await tx
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, input.studentId),
          eq(attendanceRecords.journalDate, input.journalDate)
        )
      )
      .limit(1);
    const requiresPull = shouldPullJournalForAttendance(
      previousAttendance[0]?.status as AttendanceStatus | undefined,
      input.status
    );
    const sourceJournals = requiresTransfer
      ? await tx
          .select()
          .from(lessonJournals)
          .where(
            and(
              eq(lessonJournals.studentId, input.studentId),
              eq(lessonJournals.journalDate, input.journalDate)
            )
          )
      : [];
    const journalsToTransfer = sourceJournals.filter(hasJournalValue);

    const transferredTo: string[] = [];
    if (journalsToTransfer.length) {
      for (const source of journalsToTransfer) {
        let carry = {
          content: source.content,
          homework: source.homework,
          notes: source.notes,
          isDraft: source.isDraft,
          createdByUserId: source.createdByUserId,
        };
        let targetDate = getNextBusinessDate(input.journalDate);
        let moved = false;
        for (let safety = 0; safety < 120; safety += 1) {
          const targetRows = await tx
            .select()
            .from(lessonJournals)
            .where(
              and(
                eq(lessonJournals.studentId, source.studentId),
                eq(lessonJournals.classGroupId, source.classGroupId),
                eq(lessonJournals.journalDate, targetDate)
              )
            )
            .limit(1);
          const target = targetRows[0];
          const journalValues = {
            content: carry.content,
            homework: carry.homework,
            notes: carry.notes,
            isDraft: carry.isDraft,
            updatedByUserId: input.userId,
          };
          if (!target) {
            await tx
              .insert(lessonJournals)
              .values({
                studentId: source.studentId,
                classGroupId: source.classGroupId,
                journalDate: targetDate,
                ...journalValues,
                createdByUserId: carry.createdByUserId,
              });
            moved = true;
            break;
          }
          if (!hasJournalValue(target)) {
            await tx
              .update(lessonJournals)
              .set(journalValues)
              .where(eq(lessonJournals.id, target.id));
            moved = true;
            break;
          }
          await tx
            .update(lessonJournals)
            .set(journalValues)
            .where(eq(lessonJournals.id, target.id));
          carry = {
            content: target.content,
            homework: target.homework,
            notes: target.notes,
            isDraft: target.isDraft,
            createdByUserId: target.createdByUserId,
          };
          targetDate = getNextBusinessDate(targetDate);
        }
        if (!moved) throw new Error("수업일지 이관 범위를 초과했습니다.");
        transferredTo.push(targetDate);
        await tx
          .update(lessonJournals)
          .set({
            content: "",
            homework: "",
            notes: "",
            isDraft: false,
            updatedByUserId: input.userId,
          })
          .where(eq(lessonJournals.id, source.id));
      }
    }

    const pulledFrom: string[] = [];
    if (requiresPull) {
      const currentJournals = await tx
        .select()
        .from(lessonJournals)
        .where(
          and(
            eq(lessonJournals.studentId, input.studentId),
            eq(lessonJournals.journalDate, input.journalDate)
          )
        );
      if (
        currentJournals.some(hasJournalValue) &&
        !input.overwriteCurrentJournal
      ) {
        return {
          success: false as const,
          reason: "current_journal_conflict" as const,
          targetDate: null,
        };
      }
      if (input.overwriteCurrentJournal && currentJournals.length)
        await tx.update(lessonJournals).set({ content: "", homework: "", notes: "", isDraft: false, updatedByUserId: input.userId }).where(inArray(lessonJournals.id, currentJournals.map(row => row.id)));
      const futureJournals = await tx
        .select()
        .from(lessonJournals)
        .where(
          and(
            eq(lessonJournals.studentId, input.studentId),
            gt(lessonJournals.journalDate, input.journalDate),
            or(ne(lessonJournals.content, ""), ne(lessonJournals.homework, ""), ne(lessonJournals.notes, ""))
          )
        )
        .orderBy(asc(lessonJournals.classGroupId), asc(lessonJournals.journalDate));
      const horizon = new Date(`${futureJournals.at(-1)?.journalDate ?? input.journalDate}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + 366);
      const horizonDate = horizon.toISOString().slice(0, 10);
      const rangeDates: string[] = [];
      for (let date = input.journalDate; date <= horizonDate; date = getAdjacentJournalDate(date, 1, true)) rangeDates.push(date);
      const [blockedAttendances, calendarEvents] = await Promise.all([
        tx.select({ journalDate: attendanceRecords.journalDate, status: attendanceRecords.status })
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.studentId, input.studentId), gte(attendanceRecords.journalDate, input.journalDate), lte(attendanceRecords.journalDate, horizonDate))),
        getCalendarEventsForDates(rangeDates),
      ]);
      const blockedDates = new Set(calendarEvents.keys());
      for (const attendance of blockedAttendances)
        if (["absent", "not_registered", "holiday", "closed"].includes(attendance.status)) blockedDates.add(attendance.journalDate);
      blockedDates.delete(input.journalDate);
      const futureByClass = new Map<number, typeof futureJournals>();
      for (const journal of futureJournals) {
        const group = futureByClass.get(journal.classGroupId) ?? [];
        group.push(journal);
        futureByClass.set(journal.classGroupId, group);
      }
      for (const [classGroupId, sources] of Array.from(futureByClass.entries())) {
        const targetDates: string[] = [];
        for (let date = input.journalDate; targetDates.length < sources.length && date <= horizonDate; date = getAdjacentJournalDate(date, 1, true)) {
          const day = new Date(`${date}T00:00:00Z`).getUTCDay();
          if (day !== 0 && day !== 6 && !blockedDates.has(date)) targetDates.push(date);
        }
        if (targetDates.length < sources.length) throw new Error("수업일지를 당길 수 있는 날짜가 부족합니다.");
        const idsToClear = [
          ...currentJournals.filter(row => row.classGroupId === classGroupId).map(row => row.id),
          ...sources.map(row => row.id),
        ];
        if (idsToClear.length)
          await tx.update(lessonJournals).set({ content: "", homework: "", notes: "", isDraft: false, updatedByUserId: input.userId }).where(inArray(lessonJournals.id, idsToClear));
        for (let index = 0; index < sources.length; index += 1) {
          const source = sources[index]!;
          const targetDate = targetDates[index]!;
          await tx.insert(lessonJournals).values({
            studentId: input.studentId, classGroupId, journalDate: targetDate,
            content: source.content, homework: source.homework, notes: source.notes, isDraft: source.isDraft,
            createdByUserId: source.createdByUserId, updatedByUserId: input.userId,
          }).onDuplicateKeyUpdate({ set: {
            content: source.content, homework: source.homework, notes: source.notes, isDraft: source.isDraft, updatedByUserId: input.userId,
          }});
          pulledFrom.push(source.journalDate);
        }
      }
    }

    await tx
      .insert(attendanceRecords)
      .values({
        studentId: input.studentId,
        journalDate: input.journalDate,
        status: input.status,
        arrivalTime,
        departureTime,
        recordedByUserId: input.userId,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: input.status,
          arrivalTime,
          departureTime,
          recordedByUserId: input.userId,
        },
      });
    return { success: true as const, transferredTo, pulledFrom };
  });
  if (result.success) weeklyCountSettlementCache = null;
  return result;
}

export async function fillUnenteredWeekdayAttendance(input: {
  studentId: number;
  journalDates: string[];
  userId: number;
}) {
  const db = await requireDb();
  const uniqueDates = Array.from(new Set(input.journalDates));
  if (!uniqueDates.length) return { saved: 0 };

  const calendarEvents = await getCalendarEventsForDates(uniqueDates);
  return db.transaction(async tx => {
    const existing = await tx
      .select({
        journalDate: attendanceRecords.journalDate,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, input.studentId),
          inArray(attendanceRecords.journalDate, uniqueDates)
        )
      );
    const targets = getUnenteredAttendanceDates(
      uniqueDates,
      existing as Array<{ journalDate: string; status: AttendanceStatus }>
    ).filter(journalDate => !calendarEvents.has(journalDate));
    if (!targets.length) return { saved: 0 };
    await tx
      .insert(attendanceRecords)
      .values(
        targets.map(journalDate => ({
          studentId: input.studentId,
          journalDate,
          status: "present" as const,
          arrivalTime: null,
          recordedByUserId: input.userId,
        }))
      )
      .onDuplicateKeyUpdate({
        set: {
          status: "present",
          arrivalTime: null,
          recordedByUserId: input.userId,
        },
      });
    return { saved: targets.length };
  });
}

export async function getLessonJournal(
  studentId: number,
  classGroupId: number,
  journalDate: string
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(lessonJournals)
    .where(
      and(
        eq(lessonJournals.studentId, studentId),
        eq(lessonJournals.classGroupId, classGroupId),
        eq(lessonJournals.journalDate, journalDate)
      )
    )
    .limit(1);
  return rows[0];
}

export async function getMostRecentLesson(
  studentId: number,
  classGroupId: number,
  journalDate: string
) {
  const db = await requireDb();
  const rows = await db
    .select({
      journalDate: lessonJournals.journalDate,
      content: lessonJournals.content,
      homework: lessonJournals.homework,
      notes: lessonJournals.notes,
      isDraft: lessonJournals.isDraft,
    })
    .from(lessonJournals)
    .where(
      and(
        eq(lessonJournals.studentId, studentId),
        eq(lessonJournals.classGroupId, classGroupId),
        lt(lessonJournals.journalDate, journalDate),
        or(eq(lessonJournals.isDraft, false), isNull(lessonJournals.isDraft)),
        or(
          ne(lessonJournals.content, ""),
          ne(lessonJournals.homework, ""),
          ne(lessonJournals.notes, "")
        )
      )
    )
    .orderBy(desc(lessonJournals.journalDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveLessonJournal(input: {
  studentId: number;
  classGroupId: number;
  journalDate: string;
  content: string;
  homework: string;
  notes: string;
  isDraft?: boolean;
  userId: number;
}) {
  const db = await requireDb();
  const existing = await getLessonJournal(
    input.studentId,
    input.classGroupId,
    input.journalDate
  );
  if (!existing) {
    await db
      .insert(lessonJournals)
      .values({
        ...input,
        isDraft: input.isDraft ?? false,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      });
  } else {
    await db
      .update(lessonJournals)
      .set({
        content: input.content,
        homework: input.homework,
        notes: input.notes,
        isDraft: input.isDraft ?? false,
        updatedByUserId: input.userId,
      })
      .where(eq(lessonJournals.id, existing.id));
  }
}

/** 새 수업일지를 현재 날짜에 삽입하고, 같은 학생·과목의 이후 기록을 다음 입력 가능 날짜로 순차 이동한다. */
export async function insertLessonJournal(input: {
  studentId: number;
  classGroupId: number;
  journalDate: string;
  includeWeekend: boolean;
  userId: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const sourceRows = await tx
      .select()
      .from(lessonJournals)
      .where(
        and(
          eq(lessonJournals.studentId, input.studentId),
          eq(lessonJournals.classGroupId, input.classGroupId),
          gte(lessonJournals.journalDate, input.journalDate),
          or(
            ne(lessonJournals.content, ""),
            ne(lessonJournals.homework, ""),
            ne(lessonJournals.notes, "")
          )
        )
      )
      .orderBy(asc(lessonJournals.journalDate));
    const sourceByDate = new Map(sourceRows.map(row => [row.journalDate, row]));
    const lastSourceDate = sourceRows.at(-1)?.journalDate ?? input.journalDate;
    const calendarHorizon = new Date(`${lastSourceDate}T00:00:00.000Z`);
    calendarHorizon.setUTCDate(
      calendarHorizon.getUTCDate() + Math.max(366, sourceRows.length * 3 + 60)
    );
    const calendarDates: string[] = [];
    for (
      let date = input.journalDate;
      date <= calendarHorizon.toISOString().slice(0, 10);
      date = getAdjacentJournalDate(date, 1, true)
    )
      calendarDates.push(date);
    const calendarEvents = await getCalendarEventsForDates(calendarDates);
    const moves = getJournalInsertionMoves(
      sourceRows.map(row => row.journalDate),
      input.includeWeekend,
      new Set(calendarEvents.keys())
    );

    for (const move of moves) {
      const source = sourceByDate.get(move.sourceDate);
      if (!source) continue;
      const values = {
        content: source.content,
        homework: source.homework,
        notes: source.notes,
        isDraft: source.isDraft,
        updatedByUserId: input.userId,
      };
      const existingTarget = await tx
        .select({ id: lessonJournals.id })
        .from(lessonJournals)
        .where(
          and(
            eq(lessonJournals.studentId, input.studentId),
            eq(lessonJournals.classGroupId, input.classGroupId),
            eq(lessonJournals.journalDate, move.targetDate)
          )
        )
        .limit(1);
      if (existingTarget[0]) {
        await tx
          .update(lessonJournals)
          .set(values)
          .where(eq(lessonJournals.id, existingTarget[0].id));
      } else {
        await tx
          .insert(lessonJournals)
          .values({
            studentId: input.studentId,
            classGroupId: input.classGroupId,
            journalDate: move.targetDate,
            ...values,
            createdByUserId: source.createdByUserId,
          });
      }
    }

    const current = sourceByDate.get(input.journalDate);
    if (current) {
      await tx
        .update(lessonJournals)
        .set({
          content: "",
          homework: "",
          notes: "",
          isDraft: false,
          updatedByUserId: input.userId,
        })
        .where(eq(lessonJournals.id, current.id));
    }
    return {
      movedCount: sourceRows.length,
      movedDates: moves.map(move => move.targetDate),
    };
  });
}

export async function deleteAndPullLessonJournal(input: {
  studentId: number;
  classGroupId: number;
  journalDate: string;
  includeWeekend: boolean;
  userId: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const sourceRows = await tx
      .select()
      .from(lessonJournals)
      .where(
        and(
          eq(lessonJournals.studentId, input.studentId),
          eq(lessonJournals.classGroupId, input.classGroupId),
          gt(lessonJournals.journalDate, input.journalDate),
          or(
            ne(lessonJournals.content, ""),
            ne(lessonJournals.homework, ""),
            ne(lessonJournals.notes, "")
          )
        )
      )
      .orderBy(asc(lessonJournals.journalDate));
    const horizon = new Date(`${sourceRows.at(-1)?.journalDate ?? input.journalDate}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + Math.max(366, sourceRows.length * 3));
    const horizonDate = horizon.toISOString().slice(0, 10);
    const [blockedAttendances, calendarEvents] = await Promise.all([
      tx.select({ journalDate: attendanceRecords.journalDate, status: attendanceRecords.status })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.studentId, input.studentId), gte(attendanceRecords.journalDate, input.journalDate), lte(attendanceRecords.journalDate, horizonDate))),
      getCalendarEventsForDates(Array.from({ length: 367 }, (_, offset) => {
        const date = new Date(`${input.journalDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
      })),
    ]);
    const blockedDates = new Set(calendarEvents.keys());
    for (const attendance of blockedAttendances)
      if (["absent", "not_registered", "holiday", "closed"].includes(attendance.status)) blockedDates.add(attendance.journalDate);
    const targetDates: string[] = [];
    for (let date = input.journalDate; targetDates.length < sourceRows.length && date <= horizonDate; date = getAdjacentJournalDate(date, 1, true)) {
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if ((input.includeWeekend || (day !== 0 && day !== 6)) && !blockedDates.has(date)) targetDates.push(date);
    }
    if (targetDates.length < sourceRows.length) throw new Error("수업일지를 당길 수 있는 날짜가 부족합니다.");
    const rowsToClear = await tx
      .select({ id: lessonJournals.id })
      .from(lessonJournals)
      .where(
        and(
          eq(lessonJournals.studentId, input.studentId),
          eq(lessonJournals.classGroupId, input.classGroupId),
          inArray(lessonJournals.journalDate, [input.journalDate, ...sourceRows.map(row => row.journalDate)])
        )
      );
    if (rowsToClear.length)
      await tx
        .update(lessonJournals)
        .set({
          content: "",
          homework: "",
          notes: "",
          isDraft: false,
          updatedByUserId: input.userId,
        })
        .where(inArray(lessonJournals.id, rowsToClear.map(row => row.id)));
    for (let index = 0; index < sourceRows.length; index += 1) {
      const source = sourceRows[index]!;
      const targetDate = targetDates[index]!;
      await tx.insert(lessonJournals).values({
        studentId: input.studentId, classGroupId: input.classGroupId, journalDate: targetDate,
        content: source.content, homework: source.homework, notes: source.notes, isDraft: source.isDraft,
        createdByUserId: source.createdByUserId, updatedByUserId: input.userId,
      }).onDuplicateKeyUpdate({ set: {
        content: source.content, homework: source.homework, notes: source.notes, isDraft: source.isDraft, updatedByUserId: input.userId,
      }});
    }
    return { movedCount: sourceRows.length, movedFrom: sourceRows.map(row => row.journalDate), targetDates };
  });
}

export async function getPortalFamilyByToken(token: string) {
  const db = await requireDb();
  const anchorRows = await db
    .select({
      id: students.id,
      name: students.name,
      grade: students.grade,
      publicToken: students.publicToken,
      familyKey: students.familyKey,
    })
    .from(students)
    .where(
      and(
        eq(students.publicToken, token),
        eq(students.portalEnabled, true),
        eq(students.active, true)
      )
    )
    .limit(1);
  const anchor = anchorRows[0];
  if (!anchor) return [];
  if (!anchor.familyKey) return [anchor];
  return db
    .select({
      id: students.id,
      name: students.name,
      grade: students.grade,
      publicToken: students.publicToken,
      familyKey: students.familyKey,
    })
    .from(students)
    .where(
      and(
        eq(students.familyKey, anchor.familyKey),
        eq(students.portalEnabled, true),
        eq(students.active, true)
      )
    )
    .orderBy(asc(students.name), asc(students.id));
}

export async function getPublicStudentWeek(
  token: string,
  requestedDate: string,
  includeWeekend = false,
  requestedStudentId?: number
) {
  const db = await requireDb();
  const familyMembers = await getPortalFamilyByToken(token);
  const selectedMember = requestedStudentId
    ? familyMembers.find(member => member.id === requestedStudentId)
    : familyMembers.find(member => member.publicToken === token);
  if (!selectedMember) return null;
  const studentRows = await db
    .select({
      id: students.id,
      name: students.name,
      grade: students.grade,
      registrationCount: students.registrationCount,
      lastWeekCount: students.lastWeekCount,
      totalCount: students.totalCount,
      vocabularyResultUrl: students.vocabularyResultUrl,
      englishSpeakingUrl: students.englishSpeakingUrl,
      mathUnitEvaluationUrl: students.mathUnitEvaluationUrl,
    })
    .from(students)
    .where(eq(students.id, selectedMember.id))
    .limit(1);
  const student = studentRows[0];
  if (!student) return null;
  const businessDates = getBusinessWeekDates(requestedDate);
  const allWeekDates = getWeeklyDates(requestedDate, true);
  const weekStart = getMonday(requestedDate);
  const todayInKorea = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  const currentWeekStart = getMonday(todayInKorea);
  const groupRows = await db
    .select({
      id: classGroups.id,
      name: classGroups.name,
      subject: classGroups.subject,
    })
    .from(studentEnrollments)
    .innerJoin(classGroups, eq(classGroups.id, studentEnrollments.classGroupId))
    .where(
      and(
        eq(studentEnrollments.studentId, student.id),
        eq(studentEnrollments.active, true),
        eq(classGroups.active, true)
      )
    )
    .orderBy(asc(classGroups.name));
  const [allAttendances, allJournals, calendarEvents] = await Promise.all([
    db
      .select({
        journalDate: attendanceRecords.journalDate,
        status: attendanceRecords.status,
        arrivalTime: attendanceRecords.arrivalTime,
        departureTime: attendanceRecords.departureTime,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, student.id),
          inArray(attendanceRecords.journalDate, allWeekDates)
        )
      ),
    db
      .select()
      .from(lessonJournals)
      .where(
        and(
          eq(lessonJournals.studentId, student.id),
          inArray(lessonJournals.journalDate, allWeekDates)
        )
      ),
    getCalendarEventsForDates(allWeekDates),
  ]);
  const laterSettledWeeks =
    weekStart < currentWeekStart
      ? await db
          .select({
            weekStart: weeklyCountAccruals.weekStart,
            sessionCount: weeklyCountAccruals.sessionCount,
          })
          .from(weeklyCountAccruals)
          .where(
            and(
              eq(weeklyCountAccruals.studentId, student.id),
              gt(weeklyCountAccruals.weekStart, weekStart),
              lt(weeklyCountAccruals.weekStart, currentWeekStart)
            )
          )
      : [];
  const storedAttendanceByDate = new Map(
    allAttendances.map(attendance => [attendance.journalDate, attendance])
  );
  const effectiveAttendances: Array<{
    journalDate: string;
    status: AttendanceStatus;
    arrivalTime: string | null;
    departureTime: string | null;
    calendarEvent: CalendarEvent | null;
  }> = allWeekDates.flatMap(journalDate => {
    const stored = storedAttendanceByDate.get(journalDate);
    const calendarEvent = calendarEvents.get(journalDate) ?? null;
    if (stored && stored.status !== "not_entered")
      return [
        {
          journalDate,
          status: stored.status as AttendanceStatus,
          arrivalTime: stored.arrivalTime,
          departureTime: stored.departureTime,
          calendarEvent,
        },
      ];
    if (calendarEvent)
      return [
        {
          journalDate,
          status: calendarEvent.status,
          arrivalTime: null,
          departureTime: null,
          calendarEvent,
        },
      ];
    if (stored)
      return [
        {
          journalDate,
          status: stored.status as AttendanceStatus,
          arrivalTime: stored.arrivalTime,
          departureTime: stored.departureTime,
          calendarEvent: null,
        },
      ];
    return [];
  });
  // 수업 내용·실제 출석은 미래에 숨기되, 공휴일·등록 휴강은 보호자가 미리 일정을 알 수 있게 공개한다.
  const visibleAttendances = effectiveAttendances.filter(attendance =>
    isCalendarScheduleVisibleToParent(
      attendance.journalDate,
      todayInKorea,
      Boolean(
        attendance.calendarEvent &&
          attendance.status === attendance.calendarEvent.status
      )
    )
  );
  // 미래 수업 계획은 최종 저장했을 때만 예정으로 공개한다. 임시 저장은 날짜와 무관하게 보호자에게 숨긴다.
  const visibleJournals = allJournals.filter(journal =>
    isFinalJournalVisibleToParent(journal.isDraft)
  );
  const weekendDates = allWeekDates.slice(-2);
  const weekendActive =
    visibleAttendances.some(
      attendance =>
        weekendDates.includes(attendance.journalDate) &&
        attendance.status !== "not_entered"
    ) ||
    visibleJournals.some(
      journal =>
        weekendDates.includes(journal.journalDate) &&
        Boolean(
          journal.content?.trim() ||
            journal.homework?.trim() ||
            journal.notes?.trim()
        )
    );
  const dates = includeWeekend || weekendActive ? allWeekDates : businessDates;
  const attendances = visibleAttendances.filter(attendance =>
    dates.includes(attendance.journalDate)
  );
  const journals = visibleJournals.filter(journal =>
    dates.includes(journal.journalDate)
  );
  const comments = groupRows.length
    ? await db
        .select({
          classGroupId: weeklySubjectComments.classGroupId,
          comment: weeklySubjectComments.comment,
        })
        .from(weeklySubjectComments)
        .where(
          and(
            eq(weeklySubjectComments.studentId, student.id),
            eq(weeklySubjectComments.weekStart, weekStart),
            inArray(
              weeklySubjectComments.classGroupId,
              groupRows.map(group => group.id)
            )
          )
        )
    : [];
  // 과목 비고는 강사가 주간 학습 안내로 직접 작성한 경우에만 공개한다.
  // 날짜별 출석·수업일지와 달리 비고에는 특정 미래 날짜가 연결되지 않으므로 입력된 안내는 현재 주에도 보여 준다.
  const visibleComments = comments.filter(item =>
    Boolean(item.comment?.trim())
  );
  const businessAttendances = businessDates.map(
    journalDate =>
      effectiveAttendances.find(
        attendance => attendance.journalDate === journalDate
      ) ?? { journalDate, status: null, arrivalTime: null, departureTime: null, calendarEvent: null }
  );
  const weekSessions = businessAttendances.reduce(
    (total, attendance) => total + getAttendanceSessionUnits(attendance.status),
    0
  );
  const excludedWeekdayCount = businessAttendances.filter(
    attendance =>
      attendance.status === "holiday" || attendance.status === "closed"
  ).length;
  const target = getHolidayAdjustedTarget(
    Number(student.registrationCount ?? 0),
    excludedWeekdayCount
  );
  const attendanceDayCount = businessAttendances.filter(attendance =>
    isAttendanceDay(attendance.status)
  ).length;
  const makeupCount = businessAttendances.filter(
    attendance => attendance.status === "makeup"
  ).length;
  const makeupDoubleCount = businessAttendances.filter(
    attendance => attendance.status === "makeup_double"
  ).length;
  const attendanceMessage = buildParentAttendanceMessage({
    target,
    sessionCount: weekSessions,
    attendanceDayCount,
    makeupCount,
    makeupDoubleCount,
  });
  const lessons = getHistoricalLessonCount({
    currentSettledCount: Number(student.lastWeekCount ?? 0),
    requestedWeekStart: weekStart,
    currentWeekStart,
    requestedWeekSessions: weekSessions,
    laterSettledWeeks: laterSettledWeeks.map(item => ({
      weekStart: item.weekStart,
      sessionCount: Number(item.sessionCount ?? 0),
    })),
  });
  const registered = Number(student.totalCount ?? 0);
  return {
    student: { id: student.id, name: student.name, grade: student.grade },
    familyMembers: familyMembers.map(member => ({
      id: member.id,
      name: member.name,
      grade: member.grade,
    })),
    resources: {
      vocabularyResultUrl: student.vocabularyResultUrl,
      englishSpeakingUrl: student.englishSpeakingUrl,
      mathUnitEvaluationUrl: student.mathUnitEvaluationUrl,
    },
    dates,
    weekStart,
    weekendActive,
    classGroups: groupRows,
    attendances,
    journals,
    comments: visibleComments,
    summary: {
      target,
      weekSessions,
      lessons,
      registered,
      attendanceDayCount,
      makeupCount,
      makeupDoubleCount,
      holidayCount: businessAttendances.filter(
        attendance => attendance.status === "holiday"
      ).length,
      closureCount: businessAttendances.filter(
        attendance => attendance.status === "closed"
      ).length,
      excludedWeekdayCount,
      achieved: target > 0 && weekSessions >= target,
      attendanceMessage,
    },
  };
}

export async function recordParentPortalView(token: string) {
  const db = await requireDb();
  const student = (await getPortalFamilyByToken(token)).find(
    member => member.publicToken === token
  );
  if (!student) return { recorded: false as const };
  const monthKey = todayInKorea().slice(0, 7);
  await db
    .insert(parentPortalMonthlyViews)
    .values({ studentId: student.id, monthKey, viewCount: 1 })
    .onDuplicateKeyUpdate({
      set: { viewCount: sql`${parentPortalMonthlyViews.viewCount} + 1` },
    });
  return { recorded: true as const };
}

export async function getWeeklySubjectComments(
  studentId: number,
  weekStart: string
) {
  const db = await requireDb();
  return db
    .select()
    .from(weeklySubjectComments)
    .where(
      and(
        eq(weeklySubjectComments.studentId, studentId),
        eq(weeklySubjectComments.weekStart, weekStart)
      )
    );
}

export async function saveWeeklySubjectComment(input: {
  studentId: number;
  classGroupId: number;
  weekStart: string;
  comment: string;
  userId: number;
}) {
  const db = await requireDb();
  await db
    .insert(weeklySubjectComments)
    .values({
      studentId: input.studentId,
      classGroupId: input.classGroupId,
      weekStart: input.weekStart,
      comment: input.comment,
      updatedByUserId: input.userId,
    })
    .onDuplicateKeyUpdate({
      set: { comment: input.comment, updatedByUserId: input.userId },
    });
}
