import { and, eq, sql, asc } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb, getPortalFamilyByToken } from "./db";
import {
  students,
  studentEnrollments,
  classGroups,
  lessonJournals,
  mathProgressCache,
  mathProgressOverrides,
  mathProgressBaselines,
} from "../drizzle/schema";
import {
  calculateMathProgress,
  type MathProgress,
  createProgressBaseline,
  type ProgressBaseline,
} from "../shared/mathProgress";
import type { ProgressState } from "../shared/mathCurriculum";
type StoredMathProgress = MathProgress & {
  baseline: Pick<
    ProgressBaseline,
    "sourceId" | "sourceDate" | "sourceText" | "recognized"
  >;
};
let schema: Promise<void> | undefined;
async function database() {
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
  // Include advanced elementary students studying a middle-school course, as well as middle students.
  return rows;
}
async function readMathJournals(studentId: number) {
  const db = await database();
  return db
    .select({
      id: lessonJournals.id,
      content: lessonJournals.content,
      journalDate: lessonJournals.journalDate,
      isDraft: lessonJournals.isDraft,
    })
    .from(lessonJournals)
    .innerJoin(classGroups, eq(classGroups.id, lessonJournals.classGroupId))
    .where(
      and(
        eq(lessonJournals.studentId, studentId),
        eq(classGroups.subject, "수학")
      )
    );
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
    .select({ grade: students.grade })
    .from(students)
    .where(eq(students.id, studentId));
  if (!student) throw new Error("학생을 찾을 수 없습니다.");
  const baseline = await ensureBaseline(studentId, student.grade);
  const [fingerprints, overrides, cached] = await Promise.all([
    db
      .select({
        id: lessonJournals.id,
        hash: sql<string>`SHA2(CONCAT_WS('|', COALESCE(${lessonJournals.content},''), ${lessonJournals.journalDate}, ${lessonJournals.isDraft}),256)`,
      })
      .from(lessonJournals)
      .innerJoin(classGroups, eq(classGroups.id, lessonJournals.classGroupId))
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
  ]);
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  const signature = createHash("sha256")
    .update(
      JSON.stringify([
        "v2-baseline-sequence",
        today,
        student.grade,
        baseline,
        fingerprints,
        overrides,
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
  const result: StoredMathProgress = {
    ...calculated,
    baseline: {
      sourceId: baseline.sourceId,
      sourceDate: baseline.sourceDate,
      sourceText: baseline.sourceText,
      recognized: baseline.recognized,
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
  const output = [];
  // Bound database concurrency even for a large roster.
  for (let i = 0; i < rows.length; i += 5)
    output.push(
      ...(await Promise.all(
        rows
          .slice(i, i + 5)
          .map(async s => ({ ...s, progress: await studentProgress(s.id) }))
      ))
    );
  return output;
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
export async function publicProgress(token: string, studentId?: number) {
  const family = await getPortalFamilyByToken(token);
  const student = studentId
    ? family.find(s => s.id === studentId)
    : family.find(s => s.publicToken === token);
  if (!student || !(await progressStudents()).some(s => s.id === student.id))
    return null;
  const { baseline: _baseline, ...progress } = await studentProgress(
    student.id
  );
  // Raw journal text and staff correction notes are admin-only.
  return {
    ...progress,
    unmatched: [],
    terms: progress.terms.map(t => ({
      ...t,
      units: t.units.map(u => ({
        ...u,
        cells: u.cells.map(c => ({ ...c, override: null })),
      })),
    })),
  };
}
