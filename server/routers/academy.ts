import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { matchesAutomaticCalendarStatus } from "../../shared/closureRules";
import {
  isJournalWriteBlocked,
  selectableAttendanceStatusValues,
  type AttendanceStatus,
} from "../../shared/journalRules";
import * as academyDb from "../db";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getKoreanHolidaySchedules,
  shouldAutomaticallyApplyLegalHoliday,
} from "../koreanHolidays";
import { storagePut } from "../storage";
import {
  attendancePushPayload,
  getVapidPublicKey,
  sendStudentPush,
  totalCountPushPayload,
} from "../pushNotifications";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");
const classInput = z.object({
  subject: z.string().trim().min(1, "과목을 입력해 주세요.").max(80),
  description: z.string().trim().max(2000).optional(),
  meetingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "수업 요일을 하나 이상 선택해 주세요.")
    .max(7)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "색상 형식이 올바르지 않습니다.")
    .optional(),
});
const studentInput = z.object({
  name: z.string().trim().min(1, "학생 이름을 입력해 주세요.").max(80),
  grade: z.string().trim().min(1, "학년을 입력해 주세요.").max(80),
  studentNumber: z.string().trim().max(80).optional(),
  studentPhone: z.string().trim().max(40).optional(),
  parentPhone: z.string().trim().max(40).optional(),
  memo: z.string().trim().max(5000).optional(),
  tuition: z.number().finite().min(0),
  tuitionMode: z.enum(["automatic", "manual"]).default("manual"),
  registrationCount: z.number().finite().min(0),
  lastWeekCount: z.number().finite().min(0),
  totalCount: z.number().finite().min(0),
  validUntil: z.string().trim().max(32).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  remainingTwoAlertMessage: z.string().trim().max(1000).optional(),
  attendanceCode: z.union([z.literal(""), z.string().regex(/^\d{4}$/, "출결번호는 숫자 4자리여야 합니다.")]).optional(),
  classGroupIds: z.array(z.number().int().positive()).max(20),
  portalEnabled: z.boolean(),
});
const tuitionStandardInput = z.object({
  schoolLevel: z.enum(["elementary", "middle", "high"]),
  monthlySessionCount: z.union([z.literal(12), z.literal(16), z.literal(20)]),
  subjectCountTier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  tuition: z.number().finite().min(0).max(10_000_000),
});
const tuitionStandardsInput = z
  .object({
    standards: z
      .array(tuitionStandardInput)
      .length(15, "원비 기준 15개를 모두 저장해 주세요."),
  })
  .superRefine((value, ctx) => {
    const keys = value.standards.map(
      item =>
        `${item.schoolLevel}-${item.monthlySessionCount}-${item.subjectCountTier}`
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "같은 원비 기준을 중복 저장할 수 없습니다.",
      });
    for (const item of value.standards) {
      const validTier =
        item.schoolLevel === "elementary"
          ? item.subjectCountTier === 0
          : item.subjectCountTier === 1 || item.subjectCountTier === 2;
      if (!validTier)
        ctx.addIssue({
          code: "custom",
          message: "학교급별 과목 수 기준이 올바르지 않습니다.",
        });
    }
  });
const externalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "http 또는 https 주소를 입력해 주세요.");
const closureInput = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    name: z.string().trim().min(1, "휴강명을 입력해 주세요.").max(120),
    description: z.string().trim().max(4_000).optional(),
    imageKey: z
      .string()
      .startsWith("academy-closures/")
      .max(512)
      .nullable()
      .optional(),
    imageUrl: z
      .string()
      .startsWith("/manus-storage/academy-closures/")
      .max(2048)
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일보다 빠를 수 없습니다.",
      });
    if (Boolean(value.imageKey) !== Boolean(value.imageUrl))
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "업로드 이미지 정보가 올바르지 않습니다.",
      });
  });
const legalHolidayNoticeInput = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    name: z.string().trim().min(1, "법정공휴일 이름을 입력해 주세요.").max(120),
    description: z.string().trim().max(4_000).optional(),
    imageKey: z
      .string()
      .startsWith("academy-legal-holidays/")
      .max(512)
      .nullable()
      .optional(),
    imageUrl: z
      .string()
      .startsWith("/manus-storage/academy-legal-holidays/")
      .max(2048)
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일보다 빠를 수 없습니다.",
      });
    if (Boolean(value.imageKey) !== Boolean(value.imageUrl))
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "업로드 이미지 정보가 올바르지 않습니다.",
      });
  });
const legalHolidayScheduleInput = z.object({
  year: z.number().int().min(2000).max(2100),
  id: z.string().min(1).max(320),
});
const legalHolidayNoticeCreateInput = z.object({
  values: legalHolidayNoticeInput,
  schedule: legalHolidayScheduleInput,
});
const closureImageInput = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(4).max(7_000_000),
});
const attendanceSaveStatusValues = [
  ...selectableAttendanceStatusValues,
  "holiday",
] as const;
const pushSubscriptionInput = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
});
const attendanceAttemptWindow = new Map<
  string,
  { count: number; resetAt: number }
>();

function enforceAttendanceAttemptLimit(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}) {
  const forwarded = req.headers["x-forwarded-for"];
  const key =
    (typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined) ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  const current = attendanceAttemptWindow.get(key);
  if (!current || current.resetAt <= now) {
    attendanceAttemptWindow.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 30)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "입력 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });
}

async function notifyTotalCount(
  studentId: number,
  before: number,
  after: number
) {
  if (before === after) return;
  const student = await academyDb.getStudentNotificationIdentity(studentId);
  if (!student?.portalEnabled) return;
  await sendStudentPush(
    student.id,
    totalCountPushPayload(student.publicToken, student.name, before, after),
    { type: "total_count" }
  );
}

function decodeClosureImage(
  dataBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp"
) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "이미지 파일 형식이 올바르지 않습니다.",
    });
  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "이미지는 5MB 이하만 업로드할 수 있습니다.",
    });
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const valid =
    (mimeType === "image/jpeg" && isJpeg) ||
    (mimeType === "image/png" && isPng) ||
    (mimeType === "image/webp" && isWebp);
  if (!valid)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "JPG, PNG 또는 WebP 원본 파일만 업로드할 수 있습니다.",
    });
  return bytes;
}

function isAdmin(user: { role: string }) {
  return user.role === "admin";
}

async function assertAttendanceEditable(
  user: { id: number; role: string },
  studentId: number,
  journalDate: string
) {
  const existing = await academyDb.getAttendanceRecord(studentId, journalDate);
  if (existing && existing.recordedByUserId !== user.id && !isAdmin(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "다른 강사가 기록한 출석 상태는 관리자만 수정할 수 있습니다.",
    });
  }
}

async function assertJournalEditable(
  user: { id: number; role: string },
  studentId: number,
  classGroupId: number,
  journalDate: string
) {
  const existing = await academyDb.getLessonJournal(
    studentId,
    classGroupId,
    journalDate
  );
  if (existing && existing.createdByUserId !== user.id && !isAdmin(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "다른 강사가 작성한 일지는 관리자만 수정할 수 있습니다.",
    });
  }
}

export const academyRouter = router({
  dashboard: adminProcedure
    .input(z.object({ journalDate: isoDate }))
    .query(({ input }) => academyDb.getDashboard(input.journalDate)),
  workspace: adminProcedure
    .input(
      z.object({
        journalDate: isoDate,
        classGroupId: z.number().int().positive().optional(),
      })
    )
    .query(({ input }) =>
      academyDb.getJournalWorkspace(input.journalDate, input.classGroupId)
    ),
  weeklyWorkspace: adminProcedure
    .input(
      z.object({
        weekAnchor: isoDate,
        includeWeekend: z.boolean(),
        classGroupId: z.number().int().positive().optional(),
        displayDates: z.array(isoDate).length(3).optional(),
      })
    )
    .query(({ input }) =>
      academyDb.getWeeklyWorkspace(
        input.weekAnchor,
        input.includeWeekend,
        input.classGroupId,
        input.displayDates
      )
    ),
  classGroups: router({
    list: adminProcedure.query(() => academyDb.listClassGroups()),
    create: adminProcedure
      .input(classInput)
      .mutation(({ input, ctx }) =>
        academyDb.createClassGroup(
          { ...input, name: input.subject },
          ctx.user.id
        )
      ),
    update: adminProcedure
      .input(z.object({ id: z.number().int().positive(), values: classInput }))
      .mutation(({ input }) =>
        academyDb.updateClassGroup(input.id, {
          ...input.values,
          name: input.values.subject,
        })
      ),
    archive: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => academyDb.archiveClassGroup(input.id)),
  }),
  tuitionStandards: router({
    list: adminProcedure.query(() => academyDb.listTuitionStandards()),
    update: adminProcedure
      .input(tuitionStandardsInput)
      .mutation(async ({ input }) => {
        await academyDb.updateTuitionStandards(input.standards);
        return { success: true };
      }),
  }),
  students: router({
    list: adminProcedure
      .input(z.object({ active: z.boolean().optional() }).optional())
      .query(({ input }) =>
        academyDb.listStudents(undefined, input?.active ?? true)
      ),
    create: adminProcedure
      .input(studentInput)
      .mutation(async ({ input, ctx }) => {
        const publicToken = randomBytes(24).toString("base64url");
        return {
          id: await academyDb.createStudent(input, ctx.user.id, publicToken),
        };
      }),
    update: adminProcedure
      .input(
        z.object({ id: z.number().int().positive(), values: studentInput })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await academyDb.updateStudent(
          input.id,
          input.values,
          ctx.user.id
        );
        await notifyTotalCount(
          input.id,
          result.beforeTotalCount,
          result.afterTotalCount
        );
        return result;
      }),
    archive: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => academyDb.archiveStudent(input.id)),
    restore: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => academyDb.restoreStudent(input.id)),
    purge: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => academyDb.purgeStudent(input.id)),
    addRegistrationCount: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const result = await academyDb.addStudentRegistrationCount(
          input.id,
          ctx.user.id
        );
        await notifyTotalCount(input.id, result.oldTotal, result.newTotal);
        return result;
      }),
    adjustTotalCount: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          delta: z
            .number()
            .finite()
            .refine(value => value !== 0, "증감 횟수를 입력해 주세요."),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await academyDb.adjustStudentTotalCount(
          input.id,
          input.delta,
          ctx.user.id
        );
        await notifyTotalCount(input.id, result.oldTotal, result.newTotal);
        return result;
      }),
    registrationHistory: adminProcedure
      .input(z.object({ studentId: z.number().int().positive() }))
      .query(({ input }) =>
        academyDb.getStudentRegistrationCountHistories(input.studentId)
      ),
    updateLearningLinks: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          vocabularyResultUrl: externalUrl,
          englishSpeakingUrl: externalUrl,
          mathUnitEvaluationUrl: externalUrl,
        })
      )
      .mutation(({ input }) =>
        academyDb.updateStudentLearningLinks(input.id, input)
      ),
    rotatePortalLink: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) =>
        academyDb.rotateStudentPublicToken(
          input.id,
          randomBytes(24).toString("base64url")
        )
      ),
  }),
  notificationLogs: router({
    list: adminProcedure.query(() =>
      academyDb.listNotificationDeliveryLogs(500)
    ),
  }),
  attendance: router({
    save: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          journalDate: isoDate,
          status: z.enum(attendanceSaveStatusValues),
          arrivalTime: z.string().trim().max(32).optional(),
          departureTime: z.string().trim().max(32).optional(),
          overwriteCurrentJournal: z.boolean().optional().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const status = input.status as AttendanceStatus;
        const calendarEvent = await academyDb.getCalendarEventForDate(
          input.journalDate
        );
        if (matchesAutomaticCalendarStatus(status, calendarEvent?.status))
          return { success: true, pulledFrom: [], skippedAutomatic: true };
        if (status === "holiday")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "공휴일은 자동 적용되며 직접 저장할 수 없습니다.",
          });
        await assertAttendanceEditable(
          ctx.user,
          input.studentId,
          input.journalDate
        );
        const result = await academyDb.saveAttendance({
          ...input,
          status,
          userId: ctx.user.id,
        });
        return result;
      }),
    fillWeekdays: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          journalDates: z.array(isoDate).min(1).max(5),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const calendarEvents = await academyDb.getCalendarEventsForDates(
          input.journalDates
        );
        const editableDates = input.journalDates.filter(
          journalDate => !calendarEvents.has(journalDate)
        );
        if (!editableDates.length) return { success: true, saved: 0 };
        const result = await academyDb.fillUnenteredWeekdayAttendance({
          ...input,
          journalDates: editableDates,
          userId: ctx.user.id,
        });
        return { success: true, ...result };
      }),
    resetCodeEvents: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          eventDate: isoDate,
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertAttendanceEditable(ctx.user, input.studentId, input.eventDate);
        return academyDb.resetAttendanceCodeEvents(
          input.studentId,
          input.eventDate
        );
      }),
  }),
  closures: router({
    list: adminProcedure
      .input(
        z
          .object({
            startDate: isoDate.optional(),
            endDate: isoDate.optional(),
          })
          .optional()
      )
      .query(({ input }) => {
        if (
          input?.startDate &&
          input?.endDate &&
          input.startDate > input.endDate
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "조회 종료일은 시작일보다 빠를 수 없습니다.",
          });
        const range =
          input?.startDate && input.endDate
            ? { startDate: input.startDate, endDate: input.endDate }
            : undefined;
        return academyDb.listClosurePeriods(range);
      }),
    create: adminProcedure
      .input(closureInput)
      .mutation(async ({ input, ctx }) => ({
        id: await academyDb.createClosurePeriod(input, ctx.user.id),
      })),
    update: adminProcedure
      .input(
        z.object({ id: z.number().int().positive(), values: closureInput })
      )
      .mutation(async ({ input, ctx }) => {
        await academyDb.updateClosurePeriod(
          input.id,
          input.values,
          ctx.user.id
        );
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await academyDb.deleteClosurePeriod(input.id);
        return { success: true };
      }),
    uploadImage: adminProcedure
      .input(closureImageInput)
      .mutation(async ({ input }) => {
        const bytes = decodeClosureImage(input.dataBase64, input.mimeType);
        const extension =
          input.mimeType === "image/jpeg"
            ? "jpg"
            : input.mimeType === "image/png"
              ? "png"
              : "webp";
        const stored = await storagePut(
          `academy-closures/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`,
          bytes,
          input.mimeType
        );
        return stored;
      }),
  }),
  legalHolidayNotices: router({
    list: adminProcedure
      .input(
        z
          .object({
            startDate: isoDate.optional(),
            endDate: isoDate.optional(),
          })
          .optional()
      )
      .query(({ input }) => {
        if (
          input?.startDate &&
          input?.endDate &&
          input.startDate > input.endDate
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "조회 종료일은 시작일보다 빠를 수 없습니다.",
          });
        const range =
          input?.startDate && input.endDate
            ? { startDate: input.startDate, endDate: input.endDate }
            : undefined;
        return academyDb.listLegalHolidayNotices(range);
      }),
    availableSchedules: adminProcedure
      .input(z.object({ year: z.number().int().min(2000).max(2100) }))
      .query(async ({ input }) => {
        const schedules = await getKoreanHolidaySchedules(input.year);
        return schedules
          .filter(schedule =>
            schedule.dates.some(shouldAutomaticallyApplyLegalHoliday)
          )
          .map(schedule => ({
            ...schedule,
            weekdayDates: schedule.dates.filter(
              shouldAutomaticallyApplyLegalHoliday
            ),
          }));
      }),
    create: adminProcedure
      .input(legalHolidayNoticeCreateInput)
      .mutation(async ({ input, ctx }) => {
        const schedules = await getKoreanHolidaySchedules(input.schedule.year);
        const selected = schedules.find(
          schedule =>
            schedule.id === input.schedule.id &&
            schedule.dates.some(shouldAutomaticallyApplyLegalHoliday)
        );
        if (!selected)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "선택한 법정공휴일 자동 일정을 다시 확인해 주세요.",
          });
        if (
          input.values.name !== selected.name ||
          input.values.startDate !== selected.startDate ||
          input.values.endDate !== selected.endDate
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "법정공휴일의 이름과 기간은 자동 일정과 같아야 합니다.",
          });
        }
        return {
          id: await academyDb.createLegalHolidayNotice(
            input.values,
            ctx.user.id
          ),
        };
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          values: legalHolidayNoticeInput,
        })
      )
      .mutation(async ({ input, ctx }) => {
        await academyDb.updateLegalHolidayNotice(
          input.id,
          input.values,
          ctx.user.id
        );
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await academyDb.deleteLegalHolidayNotice(input.id);
        return { success: true };
      }),
    uploadImage: adminProcedure
      .input(closureImageInput)
      .mutation(async ({ input }) => {
        const bytes = decodeClosureImage(input.dataBase64, input.mimeType);
        const extension =
          input.mimeType === "image/jpeg"
            ? "jpg"
            : input.mimeType === "image/png"
              ? "png"
              : "webp";
        return storagePut(
          `academy-legal-holidays/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`,
          bytes,
          input.mimeType
        );
      }),
  }),
  journals: router({
    recent: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          classGroupId: z.number().int().positive(),
          journalDate: isoDate,
        })
      )
      .query(({ input }) =>
        academyDb.getMostRecentLesson(
          input.studentId,
          input.classGroupId,
          input.journalDate
        )
      ),
    insert: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          classGroupId: z.number().int().positive(),
          journalDate: isoDate,
          includeWeekend: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertJournalEditable(
          ctx.user,
          input.studentId,
          input.classGroupId,
          input.journalDate
        );
        return academyDb.insertLessonJournal({ ...input, userId: ctx.user.id });
      }),
    deleteAndPull: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          classGroupId: z.number().int().positive(),
          journalDate: isoDate,
          includeWeekend: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertJournalEditable(
          ctx.user,
          input.studentId,
          input.classGroupId,
          input.journalDate
        );
        return academyDb.deleteAndPullLessonJournal({
          ...input,
          userId: ctx.user.id,
        });
      }),
    save: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          classGroupId: z.number().int().positive(),
          journalDate: isoDate,
          content: z.string().trim().max(10000),
          homework: z.string().trim().max(10000),
          notes: z.string().trim().max(10000),
          isDraft: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertJournalEditable(
          ctx.user,
          input.studentId,
          input.classGroupId,
          input.journalDate
        );
        const [attendance, calendarEvent] = await Promise.all([
          academyDb.getAttendanceRecord(input.studentId, input.journalDate),
          academyDb.getCalendarEventForDate(input.journalDate),
        ]);
        const effectiveStatus =
          attendance?.status && attendance.status !== "not_entered"
            ? (attendance.status as AttendanceStatus)
            : (calendarEvent?.status ??
              (attendance?.status as AttendanceStatus | undefined));
        if (
          isJournalWriteBlocked(
            effectiveStatus,
            input.content,
            input.homework,
            input.notes
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "결석·미등록·공휴일·휴강 상태인 학생의 수업일지는 저장할 수 없습니다. 출석 상태를 먼저 확인해 주세요.",
          });
        }
        await academyDb.saveLessonJournal({ ...input, userId: ctx.user.id });
        return { success: true };
      }),
  }),
  weeklyComments: router({
    list: adminProcedure
      .input(
        z.object({ studentId: z.number().int().positive(), weekStart: isoDate })
      )
      .query(({ input }) =>
        academyDb.getWeeklySubjectComments(input.studentId, input.weekStart)
      ),
    save: adminProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          classGroupId: z.number().int().positive(),
          weekStart: isoDate,
          comment: z.string().trim().max(4000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await academyDb.saveWeeklySubjectComment({
          ...input,
          userId: ctx.user.id,
        });
        return { success: true };
      }),
  }),
  parentPush: router({
    config: publicProcedure
      .input(z.object({ token: z.string().min(8).max(64) }))
      .query(async ({ input }) => {
        const family = await academyDb.getPortalFamilyByToken(input.token);
        if (!family.length) return null;
        return {
          available: Boolean(getVapidPublicKey()),
          publicKey: getVapidPublicKey(),
          studentName: family.map(student => student.name).join(" · "),
        };
      }),
    subscribe: publicProcedure
      .input(
        z.object({
          token: z.string().min(8).max(64),
          subscription: pushSubscriptionInput,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const family = await academyDb.getPortalFamilyByToken(input.token);
        if (!family.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "사용할 수 없는 보호자 링크입니다.",
          });
        const endpointHash = createHash("sha256")
          .update(input.subscription.endpoint)
          .digest("hex");
        await Promise.all(
          family.map(student =>
            academyDb.upsertParentPushSubscription({
              studentId: student.id,
              endpointHash,
              endpoint: input.subscription.endpoint,
              p256dh: input.subscription.keys.p256dh,
              auth: input.subscription.keys.auth,
              userAgent: ctx.req.headers["user-agent"],
            })
          )
        );
        return { success: true, studentCount: family.length };
      }),
    test: publicProcedure
      .input(z.object({ token: z.string().min(8).max(64) }))
      .mutation(async ({ input, ctx }) => {
        enforceAttendanceAttemptLimit(ctx.req);
        const student = await academyDb.getPushStudentByToken(input.token);
        if (!student)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "사용할 수 없는 보호자 링크입니다.",
          });
        return sendStudentPush(
          student.id,
          {
            title: "해밀학원 알림 테스트",
            body: `${student.name} 학생의 등하원 알림이 정상적으로 연결되었습니다.`,
            url: `/p/${input.token}`,
            tag: `push-test-${student.id}-${Date.now()}`,
          },
          { type: "test" }
        );
      }),
    unsubscribe: publicProcedure
      .input(
        z.object({
          token: z.string().min(8).max(64),
          endpoint: z.string().url().max(4096),
        })
      )
      .mutation(async ({ input }) => {
        const family = await academyDb.getPortalFamilyByToken(input.token);
        if (!family.length) return { success: true };
        const endpointHash = createHash("sha256")
          .update(input.endpoint)
          .digest("hex");
        await Promise.all(
          family.map(student =>
            academyDb.removeParentPushSubscription(student.id, endpointHash)
          )
        );
        return { success: true };
      }),
  }),
  attendanceCode: router({
    preview: publicProcedure
      .input(
        z.object({ code: z.string().regex(/^\d{4}$/), eventDate: isoDate })
      )
      .query(async ({ input, ctx }) => {
        enforceAttendanceAttemptLimit(ctx.req);
        return academyDb.getAttendanceCodePreview(input.code, input.eventDate);
      }),
    confirm: publicProcedure
      .input(
        z.object({ code: z.string().regex(/^\d{4}$/), eventDate: isoDate })
      )
      .mutation(async ({ input, ctx }) => {
        enforceAttendanceAttemptLimit(ctx.req);
        const result = await academyDb.recordAttendanceCodeEvent(
          input.code,
          input.eventDate
        );
        const student = await academyDb.getStudentNotificationIdentity(
          result.studentId
        );
        let notification = { sent: 0, unavailable: false };
        if (student?.portalEnabled)
          notification = await sendStudentPush(
            student.id,
            attendancePushPayload(
              student.publicToken,
              student.name,
              result.eventType,
              result.occurredAt
            ),
            {
              type:
                result.eventType === "check_in"
                  ? "attendance_check_in"
                  : "attendance_check_out",
              eventDate: input.eventDate,
            }
          );
        return { ...result, notification };
      }),
  }),
  publicStudent: publicProcedure
    .input(
      z.object({
        token: z.string().min(8).max(64),
        journalDate: isoDate,
        includeWeekend: z.boolean().optional(),
        studentId: z.number().int().positive().optional(),
      })
    )
    .query(({ input }) =>
      academyDb.getPublicStudentWeek(
        input.token,
        input.journalDate,
        input.includeWeekend,
        input.studentId
      )
    ),
  portalView: router({
    record: publicProcedure
      .input(z.object({ token: z.string().min(8).max(64) }))
      .mutation(({ input, ctx }) =>
        ctx.user && isAdmin(ctx.user)
          ? { recorded: false as const, excludedAdmin: true as const }
          : academyDb.recordParentPortalView(input.token)
      ),
  }),
});
