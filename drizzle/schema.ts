import {
  boolean,
  date,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { attendanceStatusValues } from "../shared/journalRules";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const classGroups = mysqlTable(
  "class_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    subject: varchar("subject", { length: 80 }).notNull(),
    description: text("description"),
    meetingDays: varchar("meetingDays", { length: 32 })
      .default("1,2,3,4,5")
      .notNull(),
    accentColor: varchar("accentColor", { length: 16 })
      .default("#234E52")
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    nameUnique: uniqueIndex("class_groups_name_unique").on(table.name),
    activeIndex: index("class_groups_active_index").on(table.active),
  })
);

/** 학년·월 수업 횟수·과목 수 구간별 자동 월 원비 기준표다. */
export const tuitionStandards = mysqlTable(
  "tuition_standards",
  {
    id: int("id").autoincrement().primaryKey(),
    /** elementary, middle, high */
    schoolLevel: varchar("schoolLevel", { length: 20 }).notNull(),
    /** 월 수업 횟수. 예: 12, 16, 20 */
    monthlySessionCount: int("monthlySessionCount").notNull(),
    /** 초등부 공통 패키지는 0, 중·고등부는 1 또는 2과목 이상 구간을 뜻한다. */
    subjectCountTier: int("subjectCountTier").notNull(),
    tuition: double("tuition").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    standardUnique: uniqueIndex("tuition_standards_unique").on(
      table.schoolLevel,
      table.monthlySessionCount,
      table.subjectCountTier
    ),
    levelSessionIndex: index("tuition_standards_level_session_index").on(
      table.schoolLevel,
      table.monthlySessionCount
    ),
  })
);

export const students = mysqlTable(
  "students",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    grade: varchar("grade", { length: 80 }).notNull(),
    studentNumber: varchar("studentNumber", { length: 80 }),
    studentPhone: varchar("studentPhone", { length: 40 }),
    parentPhone: varchar("parentPhone", { length: 40 }),
    memo: text("memo"),
    tuition: double("tuition").default(0).notNull(),
    /** automatic은 기준표 적용 상태, manual은 개별 협의 금액이다. */
    tuitionMode: mysqlEnum("tuitionMode", ["automatic", "manual"])
      .default("manual")
      .notNull(),
    registrationCount: double("registrationCount").default(0).notNull(),
    lastWeekCount: double("lastWeekCount").default(0).notNull(),
    totalCount: double("totalCount").default(0).notNull(),
    validUntil: varchar("validUntil", { length: 32 }),
    paymentMethod: varchar("paymentMethod", { length: 80 }),
    tuitionAlert: varchar("tuitionAlert", { length: 160 }),
    vocabularyResultUrl: varchar("vocabularyResultUrl", { length: 2048 }),
    englishSpeakingUrl: varchar("englishSpeakingUrl", { length: 2048 }),
    mathUnitEvaluationUrl: varchar("mathUnitEvaluationUrl", { length: 2048 }),
    publicToken: varchar("publicToken", { length: 64 }).notNull(),
    attendanceCode: varchar("attendanceCode", { length: 4 }).notNull(),
    portalEnabled: boolean("portalEnabled").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    publicTokenUnique: uniqueIndex("students_public_token_unique").on(
      table.publicToken
    ),
    attendanceCodeUnique: uniqueIndex("students_attendance_code_unique").on(
      table.attendanceCode
    ),
    activeIndex: index("students_active_index").on(table.active),
  })
);

/** 학생의 일별 등원·하원 확정 기록이다. */
export const attendanceEntryEvents = mysqlTable(
  "attendance_entry_events",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    eventDate: date("eventDate", { mode: "string" }).notNull(),
    eventType: mysqlEnum("eventType", ["check_in", "check_out"]).notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    studentDateTypeUnique: uniqueIndex(
      "attendance_entry_events_student_date_type_unique"
    ).on(table.studentId, table.eventDate, table.eventType),
    dateIndex: index("attendance_entry_events_date_index").on(table.eventDate),
  })
);

/** 보호자 기기별 Web Push 구독 정보다. */
export const parentPushSubscriptions = mysqlTable(
  "parent_push_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    endpointHash: varchar("endpointHash", { length: 64 }).notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: varchar("p256dh", { length: 512 }).notNull(),
    auth: varchar("auth", { length: 256 }).notNull(),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    studentEndpointUnique: uniqueIndex(
      "parent_push_subscriptions_student_endpoint_unique"
    ).on(table.studentId, table.endpointHash),
    studentIndex: index("parent_push_subscriptions_student_index").on(
      table.studentId
    ),
  })
);

export const registrationCountHistories = mysqlTable(
  "registration_count_histories",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    changeType: varchar("changeType", { length: 32 })
      .default("registration_add")
      .notNull(),
    registrationCount: double("registrationCount").notNull(),
    addedCount: double("addedCount").notNull(),
    beforeTotalCount: double("beforeTotalCount").notNull(),
    afterTotalCount: double("afterTotalCount").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    studentCreatedIndex: index(
      "registration_count_histories_student_created_index"
    ).on(table.studentId, table.createdAt),
  })
);

/** 주간 출석·보강 횟수의 자동 적립을 학생별 주차 단위로 한 번만 기록한다. */
export const weeklyCountAccruals = mysqlTable(
  "weekly_count_accruals",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    weekStart: date("weekStart", { mode: "string" }).notNull(),
    sessionCount: double("sessionCount").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    studentWeekUnique: uniqueIndex(
      "weekly_count_accruals_student_week_unique"
    ).on(table.studentId, table.weekStart),
    studentWeekIndex: index("weekly_count_accruals_student_week_index").on(
      table.studentId,
      table.weekStart
    ),
  })
);

export const studentEnrollments = mysqlTable(
  "student_enrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    classGroupId: int("classGroupId").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    studentClassUnique: uniqueIndex(
      "student_enrollments_student_class_unique"
    ).on(table.studentId, table.classGroupId),
    classActiveIndex: index("student_enrollments_class_active_index").on(
      table.classGroupId,
      table.active
    ),
  })
);

export const attendanceRecords = mysqlTable(
  "attendance_records",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    journalDate: date("journalDate", { mode: "string" }).notNull(),
    status: mysqlEnum("status", attendanceStatusValues)
      .default("not_entered")
      .notNull(),
    arrivalTime: varchar("arrivalTime", { length: 32 }),
    departureTime: varchar("departureTime", { length: 32 }),
    recordedByUserId: int("recordedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    studentDateUnique: uniqueIndex("attendance_records_student_date_unique").on(
      table.studentId,
      table.journalDate
    ),
    dateIndex: index("attendance_records_date_index").on(table.journalDate),
  })
);

/** 관리자 등록 휴강일. 시작·종료일이 같으면 단일 휴강일이다. */
export const closurePeriods = mysqlTable(
  "closure_periods",
  {
    id: int("id").autoincrement().primaryKey(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 512 }),
    imageUrl: varchar("imageUrl", { length: 2048 }),
    createdByUserId: int("createdByUserId").notNull(),
    updatedByUserId: int("updatedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dateRangeIndex: index("closure_periods_date_range_index").on(
      table.startDate,
      table.endDate
    ),
  })
);

/** 자동 법정공휴일에 연결하는 보호자 안내 이미지·문구. 출석 상태에는 영향을 주지 않는다. */
export const legalHolidayNotices = mysqlTable(
  "legal_holiday_notices",
  {
    id: int("id").autoincrement().primaryKey(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 512 }),
    imageUrl: varchar("imageUrl", { length: 2048 }),
    createdByUserId: int("createdByUserId").notNull(),
    updatedByUserId: int("updatedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dateRangeIndex: index("legal_holiday_notices_date_range_index").on(
      table.startDate,
      table.endDate
    ),
  })
);

export const lessonJournals = mysqlTable(
  "lesson_journals",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    classGroupId: int("classGroupId").notNull(),
    journalDate: date("journalDate", { mode: "string" }).notNull(),
    content: text("content"),
    homework: text("homework"),
    notes: text("notes"),
    /** 내용은 보존하되 수업일지 작성 완료로 집계하지 않는 임시 저장 표시다. */
    isDraft: boolean("isDraft").default(false).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    updatedByUserId: int("updatedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    studentClassDateUnique: uniqueIndex(
      "lesson_journals_student_class_date_unique"
    ).on(table.studentId, table.classGroupId, table.journalDate),
    classDateIndex: index("lesson_journals_class_date_index").on(
      table.classGroupId,
      table.journalDate
    ),
  })
);

export const weeklySubjectComments = mysqlTable(
  "weekly_subject_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    classGroupId: int("classGroupId").notNull(),
    weekStart: date("weekStart", { mode: "string" }).notNull(),
    comment: text("comment").notNull(),
    updatedByUserId: int("updatedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    studentClassWeekUnique: uniqueIndex(
      "weekly_subject_comments_student_class_week_unique"
    ).on(table.studentId, table.classGroupId, table.weekStart),
    studentWeekIndex: index("weekly_subject_comments_student_week_index").on(
      table.studentId,
      table.weekStart
    ),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ClassGroup = typeof classGroups.$inferSelect;
export type Student = typeof students.$inferSelect;
export type TuitionStandard = typeof tuitionStandards.$inferSelect;
