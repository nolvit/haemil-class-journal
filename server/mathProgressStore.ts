import {
  mathProgressCorrectionPlans,
  resolveCorrectionStudent,
  correctedProgressBaseline,
} from "../shared/mathProgressCorrections";
import { and, eq, sql, asc } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ensureMathJournalSchema, getDb, getPortalFamilyByToken } from "./db";
import {
  students,
  studentEnrollments,
  classGroups,
  lessonJournals,
  mathJournalProgress,
  mathProgressCache,
  mathProgressOverrides,
  mathProgressBaselines,
  mathProgressCorrectionHistory,
  closurePeriods,
} from "../drizzle/schema";
import {
  calculateMathProgress,
  calculateFocusedLearning,
  calculateRecentCourseStats,
  calculateLegacyRecentLearningStats,
  type MathProgress,
  type RecentCourseStats,
  type LegacyRecentLearningStats,
  createProgressBaseline,
  type ProgressBaseline,
  isMathProgressEligible,
  isMathProgressSession,
  progressKeys,
  BASELINE_DATE,
  type MathJournalPayload,
} from "../shared/mathProgress";
import type { ProgressState } from "../shared/mathCurriculum";
import { getKoreanHolidayDates } from "./koreanHolidays";
type StoredMathProgress = MathProgress & {
  recentCourse: RecentCourseStats;
  recentLearning: LegacyRecentLearningStats;
  baseline: Pick<
    ProgressBaseline,
    "sourceId" | "sourceDate" | "sourceText" | "recognized" | "termCorrection"
  >;
};

function comparePace(pace: number | null, validPaces: number[]) {
  const average = validPaces.length
    ? validPaces.reduce((sum, pace) => sum + pace, 0) / validPaces.length
    : null;
  if (pace === null || average === null)
    return { paceLabel: null, paceArrow: null };
  if (average === 0 ? pace > 0 : pace >= average * 1.2)
    return { paceLabel: "빠름" as const, paceArrow: "↑" as const };
  if (average > 0 && pace <= average * 0.8)
    return { paceLabel: "느림" as const, paceArrow: "↓" as const };
  return { paceLabel: "보통" as const, paceArrow: "→" as const };
}

function compareCoursePace(
  progress: { recentCourse: RecentCourseStats },
  cohort: Array<{ recentCourse: RecentCourseStats }>
) {
  const validPaces = cohort
    .filter(candidate => candidate.recentCourse.sufficientPaceData)
    .map(candidate => candidate.recentCourse.coursePointsPerSession)
    .filter((pace): pace is number => pace !== null);
  return comparePace(
    progress.recentCourse.sufficientPaceData
      ? progress.recentCourse.coursePointsPerSession
      : null,
    validPaces
  );
}

function compareLegacyLearningPace(
  progress: { recentLearning: LegacyRecentLearningStats },
  cohort: Array<{ recentLearning: LegacyRecentLearningStats }>
) {
  const validPaces = cohort
    .filter(candidate => candidate.recentLearning.sufficientData)
    .map(candidate => candidate.recentLearning.stepsPerSession)
    .filter((pace): pace is number => pace !== null);
  return comparePace(
    progress.recentLearning.sufficientData
      ? progress.recentLearning.stepsPerSession
      : null,
    validPaces
  );
}

let schema: Promise<void> | undefined;

function parseWeekdays(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map(v => Number(v.trim()))
        .filter(day => Number.isInteger(day) && day >= 1 && day <= 5)
    )
  ).sort((a, b) => a - b);
}

function shiftIsoDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inferRecentMathWeekdays(
  journals: Array<{
    journalDate: string;
    isDraft: boolean;
    content: string | null;
    id: number;
  }>,
  today: string,
  fallback: number[]
) {
  const start = shiftIsoDate(today, -56);
  const weeksByWeekday = new Map<number, Set<string>>();
  for (const row of journals) {
    if (
      row.journalDate < start ||
      row.journalDate > today ||
      !isMathProgressSession(row, today)
    )
      continue;
    const date = new Date(`${row.journalDate}T00:00:00Z`);
    const weekday = date.getUTCDay();
    if (weekday < 1 || weekday > 5) continue;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - (weekday - 1));
    const weekKey = monday.toISOString().slice(0, 10);
    const weeks = weeksByWeekday.get(weekday) ?? new Set<string>();
    weeks.add(weekKey);
    weeksByWeekday.set(weekday, weeks);
  }
  const inferred = Array.from(weeksByWeekday.entries())
    .filter(([, weeks]) => weeks.size >= 2)
    .map(([weekday]) => weekday)
    .sort((a, b) => a - b);
  return inferred.length ? inferred : fallback;
}

function futureDates(today: string, days = 365) {
  return Array.from({ length: days }, (_, index) =>
    shiftIsoDate(today, index + 1)
  );
}
async function database() {
  await ensureMathJournalSchema();
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다.");
  if (!schema)
    schema = (async () => {
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS math_progress_overrides (studentId INT NOT NULL, itemKey VARCHAR(100) NOT NULL, state VARCHAR(20) NOT NULL, reason TEXT NOT NULL, updatedByUserId INT NOT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY(studentId,itemKey))`
      );
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS math_progress_cache (studentId INT PRIMARY KEY, signature VARCHAR(64) NOT NULL, payload MEDIUMTEXT NOT NULL)`
      );
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS math_progress_baselines (studentId INT PRIMARY KEY, payload MEDIUMTEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
      );
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS math_progress_correction_history (correctionKey VARCHAR(120) PRIMARY KEY, studentId INT NOT NULL, previousPayload MEDIUMTEXT NULL, appliedPayload MEDIUMTEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
      );
    })().catch(e => {
      schema = undefined;
      throw e;
    });
  await schema;
  return db;
}
export async function progressStudents() {
  const db = await database();
  const rows = await db
    .selectDistinct({
      id: students.id,
      name: students.name,
      grade: students.grade,
    })
    .from(students)
    .innerJoin(
      studentEnrollments,
      and(
        eq(studentEnrollments.studentId, students.id),
        eq(studentEnrollments.active, true)
      )
    )
    .innerJoin(
      classGroups,
      and(
        eq(classGroups.id, studentEnrollments.classGroupId),
        eq(classGroups.active, true)
      )
    )
    .where(and(eq(students.active, true), eq(classGroups.subject, "수학")))
    .orderBy(asc(students.name));
  const baselines = await db.select().from(mathProgressBaselines);
  const baselineByStudent = new Map(
    baselines.map(b => [b.studentId, JSON.parse(b.payload) as ProgressBaseline])
  );
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  return rows.filter(s =>
    isMathProgressEligible(s.grade, baselineByStudent.get(s.id), today)
  );
}
async function readMathJournals(studentId: number) {
  const db = await database();
  const rows = await db
    .select({
      id: lessonJournals.id,
      content: lessonJournals.content,
      journalDate: lessonJournals.journalDate,
      isDraft: lessonJournals.isDraft,
      mathProgressPayload: mathJournalProgress.payload,
    })
    .from(lessonJournals)
    .innerJoin(classGroups, eq(classGroups.id, lessonJournals.classGroupId))
    .leftJoin(mathJournalProgress, eq(mathJournalProgress.journalId, lessonJournals.id))
    .where(
      and(
        eq(lessonJournals.studentId, studentId),
        eq(classGroups.subject, "수학")
      )
    );
  return rows.map(row => ({
    id: row.id,
    content: row.content,
    journalDate: row.journalDate,
    isDraft: row.isDraft,
    mathProgress: row.mathProgressPayload
      ? JSON.parse(row.mathProgressPayload) as MathJournalPayload
      : null,
  }));
}
export async function focusedLearningForStudent(studentId: number, throughDate: string) {
  return calculateFocusedLearning(await readMathJournals(studentId), throughDate);
}

/** Frozen when a school score is recorded; never substitute today's progress. */
export async function historicalMathSnapshot(studentId: number, grade: string, examDate: string) {
  if (examDate < BASELINE_DATE) return null;
  const baseline = await ensureBaseline(studentId, grade);
  if (!baseline.recognized || (baseline.sourceDate && baseline.sourceDate > examDate)) return null;
  const progress = calculateMathProgress(await readMathJournals(studentId), [], examDate, { baseline, grade });
  if (!progress.terms.length) return null;
  return {
    asOfDate: examDate,
    percent: progress.percent,
    learningPercent: progress.learningPercent,
    evaluationPercent: progress.masteryPercent,
    terms: progress.terms.map(term => ({ term: term.term, percent: term.percent })),
  };
}
async function ensureBaseline(
  studentId: number,
  grade: string
): Promise<ProgressBaseline> {
  const db = await database();
  const stored = await db
    .select()
    .from(mathProgressBaselines)
    .where(eq(mathProgressBaselines.studentId, studentId));
  if (stored[0]) return JSON.parse(stored[0].payload);
  const baseline = createProgressBaseline(
    await readMathJournals(studentId),
    grade
  );
  // A concurrent page request or restart must never overwrite the first snapshot.
  await db
    .insert(mathProgressBaselines)
    .values({ studentId, payload: JSON.stringify(baseline) })
    .onDuplicateKeyUpdate({ set: { studentId } });
  const saved = await db
    .select()
    .from(mathProgressBaselines)
    .where(eq(mathProgressBaselines.studentId, studentId));
  return JSON.parse(saved[0].payload);
}
export async function applyRequestedMathProgressCorrections() {
  const db = await database();
  const applied = await db.select().from(mathProgressCorrectionHistory);
  const plans = mathProgressCorrectionPlans.filter(
    p => !applied.some(a => a.correctionKey === p.key)
  );
  if (!plans.length) return { applied: 0, failed: [] as string[] };

  const roster = await progressStudents();
  let appliedCount = 0;
  const failed: string[] = [];

  // Apply each authorized correction independently so one student's bad source
  // data never prevents the other explicitly requested corrections.
  for (const plan of plans) {
    try {
      const student = resolveCorrectionStudent(roster, plan.name);
      const baseline = correctedProgressBaseline(
        await readMathJournals(student.id),
        student.grade,
        plan
      );

      await db.transaction(async tx => {
        const [previous] = await tx
          .select()
          .from(mathProgressBaselines)
          .where(eq(mathProgressBaselines.studentId, student.id));
        const payload = JSON.stringify(baseline);
        await tx
          .insert(mathProgressBaselines)
          .values({ studentId: student.id, payload })
          .onDuplicateKeyUpdate({ set: { payload } });
        await tx.insert(mathProgressCorrectionHistory).values({
          correctionKey: plan.key,
          studentId: student.id,
          previousPayload: previous?.payload ?? null,
          appliedPayload: payload,
        });
      });
      appliedCount++;
    } catch (error) {
      // Another replica may have completed this immutable correction first.
      const completed = await db
        .select()
        .from(mathProgressCorrectionHistory)
        .where(eq(mathProgressCorrectionHistory.correctionKey, plan.key));
      if (completed.length) {
        appliedCount++;
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`${plan.name}: ${message}`);
      console.error("수학 과정 개별 기준 정정 실패", plan.name, error);
    }
  }

  return { applied: appliedCount, failed };
}
export async function initializeMathProgressBaselines() {
  const roster = await progressStudents();
  let recognized = 0,
    review = 0,
    empty = 0;
  for (const student of roster) {
    const b = await ensureBaseline(student.id, student.grade);
    if (b.recognized) recognized++;
    else if (b.sourceId) review++;
    else empty++;
  }
  return { students: roster.length, recognized, review, empty };
}
export async function studentProgress(studentId: number) {
  const db = await database();
  const [student] = await db
    .select({
      grade: students.grade,
      autoUnregisteredWeekdays: students.autoUnregisteredWeekdays,
    })
    .from(students)
    .where(eq(students.id, studentId));
  if (!student) throw new Error("학생을 찾을 수 없습니다.");
  const baseline = await ensureBaseline(studentId, student.grade);
  const [fingerprints, overrides, cached, scheduleRows, closures] =
    await Promise.all([
      db
        .select({
          id: lessonJournals.id,
          hash: sql<string>`SHA2(CONCAT_WS('|', COALESCE(${lessonJournals.content},''), ${lessonJournals.journalDate}, ${lessonJournals.isDraft}, COALESCE(${mathJournalProgress.payload},'')),256)`,
        })
        .from(lessonJournals)
        .innerJoin(classGroups, eq(classGroups.id, lessonJournals.classGroupId))
        .leftJoin(mathJournalProgress, eq(mathJournalProgress.journalId, lessonJournals.id))
        .where(
          and(
            eq(lessonJournals.studentId, studentId),
            eq(classGroups.subject, "수학")
          )
        )
        .orderBy(asc(lessonJournals.id)),
      db
        .select()
        .from(mathProgressOverrides)
        .where(eq(mathProgressOverrides.studentId, studentId)),
      db
        .select()
        .from(mathProgressCache)
        .where(eq(mathProgressCache.studentId, studentId)),
      db
        .select({ meetingDays: classGroups.meetingDays })
        .from(studentEnrollments)
        .innerJoin(
          classGroups,
          eq(classGroups.id, studentEnrollments.classGroupId)
        )
        .where(
          and(
            eq(studentEnrollments.studentId, studentId),
            eq(studentEnrollments.active, true),
            eq(classGroups.active, true),
            eq(classGroups.subject, "수학")
          )
        ),
      db
        .select({
          startDate: closurePeriods.startDate,
          endDate: closurePeriods.endDate,
        })
        .from(closurePeriods),
    ]);
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  const signature = createHash("sha256")
    .update(
      JSON.stringify([
        "v13-review-history-under-evaluations",
        progressKeys,
        today,
        student.grade,
        baseline,
        fingerprints,
        overrides,
        scheduleRows,
        student.autoUnregisteredWeekdays,
        closures,
      ])
    )
    .digest("hex");
  if (cached[0]?.signature === signature)
    return JSON.parse(cached[0].payload) as StoredMathProgress;
  const journals = await readMathJournals(studentId);
  const calculated = calculateMathProgress(
    journals,
    overrides.map(o => ({
      ...o,
      state: o.state as ProgressState,
      updatedAt: o.updatedAt.toISOString(),
    })),
    today,
    { baseline, grade: student.grade }
  );
  const configuredWeekdays = Array.from(
    new Set(scheduleRows.flatMap(row => parseWeekdays(row.meetingDays)))
  ).sort((a, b) => a - b);
  const excludedWeekdays = new Set(
    parseWeekdays(student.autoUnregisteredWeekdays)
  );
  const fallbackWeekdays = configuredWeekdays.filter(
    day => !excludedWeekdays.has(day)
  );
  const scheduleWeekdays = inferRecentMathWeekdays(
    journals,
    today,
    fallbackWeekdays
  );
  const dates = futureDates(today);
  const holidays = await getKoreanHolidayDates(dates);
  const blockedDates = new Set<string>(holidays.keys());
  for (const date of dates)
    if (
      closures.some(
        closure => date >= closure.startDate && date <= closure.endDate
      )
    )
      blockedDates.add(date);
  const forecast = { scheduleWeekdays, blockedDates };
  const recentCourse = calculateRecentCourseStats(
    journals,
    student.grade,
    calculated,
    today,
    forecast,
    baseline
  );

  const result: StoredMathProgress = {
    ...calculated,
    recentCourse,
    recentLearning: calculateLegacyRecentLearningStats(
      recentCourse,
      journals,
      calculated,
      today,
      forecast
    ),
    baseline: {
      sourceId: baseline.sourceId,
      sourceDate: baseline.sourceDate,
      sourceText: baseline.sourceText,
      recognized: baseline.recognized,
      termCorrection: baseline.termCorrection,
    },
  };
  await db
    .insert(mathProgressCache)
    .values({ studentId, signature, payload: JSON.stringify(result) })
    .onDuplicateKeyUpdate({
      set: { signature, payload: JSON.stringify(result) },
    });
  return result;
}
export async function allProgress() {
  const rows = await progressStudents();
  const output: Array<
    (typeof rows)[number] & { progress: StoredMathProgress }
  > = [];
  // Bound database concurrency even for a large roster.
  for (let i = 0; i < rows.length; i += 5)
    output.push(
      ...(await Promise.all(
        rows
          .slice(i, i + 5)
          .map(async s => ({ ...s, progress: await studentProgress(s.id) }))
      ))
    );
  return output.map(student => {
    const term = student.progress.terms.at(-1)?.term;
    const cohort = output
      .filter(candidate => candidate.progress.terms.at(-1)?.term === term)
      .map(candidate => candidate.progress);
    return {
      ...student,
      progress: {
        ...student.progress,
        recentCourse: {
          ...student.progress.recentCourse,
          ...compareCoursePace(student.progress, cohort),
        },
        recentLearning: {
          ...student.progress.recentLearning,
          ...compareLegacyLearningPace(student.progress, cohort),
        },
      },
    };
  });
}
export async function saveProgressOverride(
  input: {
    studentId: number;
    key: string;
    state: ProgressState | null;
    reason: string;
  },
  userId: number
) {
  const db = await database();
  if (!(await progressStudents()).some(s => s.id === input.studentId))
    throw new Error("수학 수강 학생을 찾을 수 없습니다.");
  if (input.state === null)
    await db
      .delete(mathProgressOverrides)
      .where(
        and(
          eq(mathProgressOverrides.studentId, input.studentId),
          eq(mathProgressOverrides.key, input.key)
        )
      );
  else
    await db
      .insert(mathProgressOverrides)
      .values({ ...input, state: input.state, updatedByUserId: userId })
      .onDuplicateKeyUpdate({
        set: {
          state: input.state,
          reason: input.reason,
          updatedByUserId: userId,
          updatedAt: new Date(),
        },
      });
  return studentProgress(input.studentId);
}
export async function publicProgress(token: string, studentId?: number, version: 1 | 2 = 1) {
  const family = await getPortalFamilyByToken(token);
  const student = studentId
    ? family.find(s => s.id === studentId)
    : family.find(s => s.publicToken === token);
  if (!student) return null;
  const roster = await progressStudents();
  if (!roster.some(s => s.id === student.id)) return null;

  const { baseline: _baseline, ...progress } = await studentProgress(
    student.id
  );
  const currentTerm = progress.terms.at(-1)?.term ?? null;
  let sameCourseAverage: { term: string; percent: number } | null = null;
  const cohort: StoredMathProgress[] = [];

  if (currentTerm) {
    for (let i = 0; i < roster.length; i += 5) {
      const batch = await Promise.all(
        roster.slice(i, i + 5).map(candidate => studentProgress(candidate.id))
      );
      cohort.push(
        ...batch.filter(
          candidate => candidate.terms.at(-1)?.term === currentTerm
        )
      );
    }
    if (cohort.length)
      sameCourseAverage = {
        term: currentTerm,
        percent: Math.round(
          cohort.reduce(
            (sum, candidate) => sum + (version === 1 ? candidate.learningPercent : candidate.percent),
            0
          ) / cohort.length
        ),
      };
  }

  const paceComparison = compareCoursePace(progress, cohort);
  const legacyPaceComparison = compareLegacyLearningPace(progress, cohort);

  // Raw journal text and staff correction notes are admin-only.
  return {
    ...progress,
    focusedLearning: progress.focusedLearning.map(
      ({ journalId: _journalId, ...item }) => item
    ),
    recentCourse: {
      ...progress.recentCourse,
      ...paceComparison,
    },
    recentLearning: {
      ...progress.recentLearning,
      ...legacyPaceComparison,
    },
    sameCourseAverage,
    unmatched: [],
    terms: progress.terms.map(t => ({
      ...t,
      units: t.units.map(u => ({
        ...u,
        cells: u.cells.map(c => ({
          ...c,
          state: version === 1 && c.state === "skipped" ? "waiting" as const : c.state,
          automatic: version === 1 && c.automatic === "skipped" ? "waiting" as const : c.automatic,
          override: null,
        })),
      })),
    })),
  };
}
