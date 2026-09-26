import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  attendanceRecords, classGroups, examSchools, lessonJournals, mathJournalProgress,
  schoolExams, schoolExamSubjects, studentExamResults, students,
} from "../drizzle/schema";
import { countLessonsBeforeExam, examComparison, type ExamLessonEvidence } from "../shared/schoolExamRules";
import { sameGrade, sameSchool } from "../shared/schoolExamIdentity";
import type { MathJournalPayload } from "../shared/mathProgress";
import { getDb } from "./db";
import { historicalMathSnapshot } from "./mathProgressStore";

let schemaPromise: Promise<void> | undefined;
async function database() {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다.");
  if (!schemaPromise) schemaPromise = (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS exam_schools (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, UNIQUE KEY exam_schools_name_unique(name))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS school_exams (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NOT NULL, grade VARCHAR(80) NOT NULL, academicYear INT NOT NULL, semester INT NOT NULL, examType VARCHAR(30) NOT NULL, title VARCHAR(100) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY school_exams_school_index(schoolId,academicYear), UNIQUE KEY school_exams_identity_unique(schoolId,grade,academicYear,semester,examType,title))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS school_exam_subjects (id INT AUTO_INCREMENT PRIMARY KEY, examId INT NOT NULL, subject VARCHAR(80) NOT NULL, examDate DATE NOT NULL, maxScore DOUBLE NOT NULL DEFAULT 100, schoolAverage DOUBLE NULL, averageSource VARCHAR(500) NULL, UNIQUE KEY school_exam_subject_unique(examId,subject))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS student_exam_results (id INT AUTO_INCREMENT PRIMARY KEY, examSubjectId INT NOT NULL, studentId INT NOT NULL, score DOUBLE NOT NULL, lessonCount INT NULL, lessonCountStatus VARCHAR(20) NOT NULL, lessonCountNote VARCHAR(500) NULL, mathSnapshot TEXT NULL, recordedByUserId INT NOT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY student_exam_result_unique(examSubjectId,studentId), KEY student_exam_results_student_index(studentId))`);
  })().catch(error => { schemaPromise = undefined; throw error; });
  await schemaPromise;
  return db;
}

export async function listExamStudents() {
  const db = await database();
  return db.select({ id: students.id, name: students.name, grade: students.grade,
    schoolHint: students.studentNumber, active: students.active })
    .from(students).orderBy(asc(students.name));
}

export async function listSchoolExams() {
  const db = await database();
  const [schools, exams, subjects, results, people] = await Promise.all([
    db.select().from(examSchools), db.select().from(schoolExams),
    db.select().from(schoolExamSubjects), db.select().from(studentExamResults),
    db.select({ id: students.id, name: students.name }).from(students),
  ]);
  const schoolById = new Map(schools.map(row => [row.id, row.name]));
  const studentById = new Map(people.map(row => [row.id, row.name]));
  return exams.sort((a, b) => b.academicYear - a.academicYear || b.id - a.id).map(exam => ({
    ...exam,
    schoolName: schoolById.get(exam.schoolId) ?? "학교 미확인",
    subjects: subjects.filter(item => item.examId === exam.id).map(item => {
      const studentResults = results.filter(row => row.examSubjectId === item.id).map(row => ({
        ...row,
        studentName: studentById.get(row.studentId) ?? "학생 미확인",
        mathSnapshot: row.mathSnapshot ? JSON.parse(row.mathSnapshot) as Awaited<ReturnType<typeof historicalMathSnapshot>> : null,
      }));
      return { ...item, results: studentResults,
        comparison: examComparison(studentResults.map(row => row.score), item.schoolAverage) };
    }),
  }));
}

export async function createSchoolExam(input: {
  schoolName: string; grade: string; academicYear: number; semester: number;
  examType: string; title: string;
}) {
  const db = await database();
  const name = input.schoolName.trim().replace(/\s+/g, " ");
  await db.insert(examSchools).values({ name }).onDuplicateKeyUpdate({ set: { name } });
  const [school] = await db.select().from(examSchools).where(eq(examSchools.name, name));
  const matches = await db.select().from(schoolExams).where(and(
    eq(schoolExams.schoolId, school.id), eq(schoolExams.grade, input.grade),
    eq(schoolExams.academicYear, input.academicYear), eq(schoolExams.semester, input.semester),
    eq(schoolExams.examType, input.examType), eq(schoolExams.title, input.title)
  ));
  if (matches[0]) return matches[0];
  // Earlier versions used "중간고사 2학기" as the default title. Reuse it rather
  // than creating a second exam when the simplified default is submitted again.
  if (input.title === input.examType) {
    const [legacy] = await db.select().from(schoolExams).where(and(
      eq(schoolExams.schoolId, school.id), eq(schoolExams.grade, input.grade),
      eq(schoolExams.academicYear, input.academicYear), eq(schoolExams.semester, input.semester),
      eq(schoolExams.examType, input.examType),
      eq(schoolExams.title, `${input.examType} ${input.semester}학기`)
    ));
    if (legacy) return legacy;
  }
  await db.insert(schoolExams).values({ ...input, schoolId: school.id })
    .onDuplicateKeyUpdate({ set: { title: input.title } });
  const [created] = await db.select().from(schoolExams).where(and(
    eq(schoolExams.schoolId, school.id), eq(schoolExams.grade, input.grade),
    eq(schoolExams.academicYear, input.academicYear), eq(schoolExams.semester, input.semester),
    eq(schoolExams.examType, input.examType), eq(schoolExams.title, input.title)
  ));
  return created;
}

export async function saveExamSubject(input: {
  examId: number; subject: string; examDate: string; maxScore: number;
  schoolAverage: number | null; averageSource: string | null;
}) {
  const db = await database();
  const [exam] = await db.select().from(schoolExams).where(eq(schoolExams.id, input.examId));
  if (!exam) throw new Error("시험을 찾을 수 없습니다.");
  const [existing] = await db.select().from(schoolExamSubjects).where(and(
    eq(schoolExamSubjects.examId, input.examId), eq(schoolExamSubjects.subject, input.subject)
  ));
  if (existing) {
    const [result] = await db.select({ id: studentExamResults.id }).from(studentExamResults)
      .where(eq(studentExamResults.examSubjectId, existing.id)).limit(1);
    if (result && (existing.examDate !== input.examDate || existing.maxScore !== input.maxScore))
      throw new Error("성적이 등록된 과목의 시험일·만점은 변경할 수 없습니다.");
    await db.update(schoolExamSubjects).set(input).where(eq(schoolExamSubjects.id, existing.id));
    return existing.id;
  }
  const [inserted] = await db.insert(schoolExamSubjects).values(input).$returningId();
  return inserted.id;
}

async function lessonEvidence(studentId: number, examDate: string): Promise<ExamLessonEvidence[]> {
  const db = await database();
  const rows = await db.select({
    journalDate: lessonJournals.journalDate, classSubject: classGroups.subject,
    content: lessonJournals.content, isDraft: lessonJournals.isDraft,
    attendanceStatus: attendanceRecords.status, mathPayload: mathJournalProgress.payload,
  }).from(lessonJournals)
    .innerJoin(classGroups, eq(classGroups.id, lessonJournals.classGroupId))
    .leftJoin(attendanceRecords, and(
      eq(attendanceRecords.studentId, lessonJournals.studentId),
      eq(attendanceRecords.journalDate, lessonJournals.journalDate)
    ))
    .leftJoin(mathJournalProgress, eq(mathJournalProgress.journalId, lessonJournals.id))
    .where(and(eq(lessonJournals.studentId, studentId), lt(lessonJournals.journalDate, examDate)));
  return rows.map(row => ({
    ...row,
    mathSessionKind: row.mathPayload ? (JSON.parse(row.mathPayload) as MathJournalPayload).sessionKind : null,
  }));
}

export async function saveStudentExamResult(input: {
  examSubjectId: number; studentId: number; score: number;
  manualLessonCount?: number | null;
  lessonCountNote?: string;
  confirmIdentityMismatch?: boolean;
}, actorUserId: number) {
  const db = await database();
  const [subject] = await db.select().from(schoolExamSubjects)
    .where(eq(schoolExamSubjects.id, input.examSubjectId));
  if (!subject) throw new Error("시험 과목을 찾을 수 없습니다.");
  const [exam] = await db.select().from(schoolExams).where(eq(schoolExams.id, subject.examId));
  const [student] = await db.select({ id: students.id, grade: students.grade,
    schoolHint: students.studentNumber }).from(students).where(eq(students.id, input.studentId));
  if (!exam || !student) throw new Error("시험 또는 학생을 찾을 수 없습니다.");
  const [school] = await db.select({ name: examSchools.name }).from(examSchools)
    .where(eq(examSchools.id, exam.schoolId));
  const schoolMismatch = Boolean(student.schoolHint && school &&
    !sameSchool(student.schoolHint, school.name));
  const gradeMismatch = !sameGrade(student.grade, exam.grade);
  if ((schoolMismatch || gradeMismatch) && !input.confirmIdentityMismatch)
    throw new Error("현재 학생의 학교·학년과 시험 정보가 다릅니다. 과거 기록인지 확인해 주세요.");
  if (input.score > subject.maxScore) throw new Error("점수가 만점을 초과합니다.");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  if (subject.examDate > today) throw new Error("미래 시험 성적은 기록할 수 없습니다.");
  const [existing] = await db.select().from(studentExamResults).where(and(
    eq(studentExamResults.examSubjectId, input.examSubjectId),
    eq(studentExamResults.studentId, input.studentId)
  ));
  let lessonCount = existing?.lessonCount ?? null;
  let lessonCountStatus = existing?.lessonCountStatus ?? "unavailable";
  let lessonCountNote = existing?.lessonCountNote ?? null;
  let mathSnapshot = existing?.mathSnapshot ?? null;
  if (!existing || input.manualLessonCount !== undefined) {
    if (input.manualLessonCount !== undefined && input.manualLessonCount !== null) {
      lessonCount = input.manualLessonCount;
      lessonCountStatus = "manual";
      lessonCountNote = input.lessonCountNote?.trim() ?? null;
    } else {
      const calculated = countLessonsBeforeExam(
        await lessonEvidence(input.studentId, subject.examDate), subject.subject, subject.examDate, today
      );
      lessonCount = calculated.count;
      lessonCountStatus = calculated.status;
      lessonCountNote = null;
    }
  }
  if (!existing)
    mathSnapshot = subject.subject === "수학"
      ? JSON.stringify(await historicalMathSnapshot(input.studentId, exam.grade, subject.examDate))
      : null;
  const values = {
    examSubjectId: input.examSubjectId, studentId: input.studentId, score: input.score,
    lessonCount, lessonCountStatus, lessonCountNote, mathSnapshot, recordedByUserId: actorUserId,
  };
  await db.insert(studentExamResults).values(values).onDuplicateKeyUpdate({ set: values });
  return { success: true };
}

/** Only school-exam records are removed; the academy student and journal remain intact. */
export async function deleteSchoolExam(id: number) {
  const db = await database();
  return db.transaction(async tx => {
    const [exam] = await tx.select({ id: schoolExams.id }).from(schoolExams)
      .where(eq(schoolExams.id, id)).limit(1);
    if (!exam) throw new Error("삭제할 시험을 찾을 수 없습니다.");
    const subjects = await tx.select({ id: schoolExamSubjects.id }).from(schoolExamSubjects)
      .where(eq(schoolExamSubjects.examId, id));
    if (subjects.length) {
      await tx.delete(studentExamResults).where(inArray(
        studentExamResults.examSubjectId, subjects.map(subject => subject.id)
      ));
    }
    await tx.delete(schoolExamSubjects).where(eq(schoolExamSubjects.examId, id));
    await tx.delete(schoolExams).where(eq(schoolExams.id, id));
    return { success: true };
  });
}

export async function deleteExamSubject(id: number) {
  const db = await database();
  return db.transaction(async tx => {
    const [subject] = await tx.select({ id: schoolExamSubjects.id }).from(schoolExamSubjects)
      .where(eq(schoolExamSubjects.id, id)).limit(1);
    if (!subject) throw new Error("삭제할 시험 과목을 찾을 수 없습니다.");
    await tx.delete(studentExamResults).where(eq(studentExamResults.examSubjectId, id));
    await tx.delete(schoolExamSubjects).where(eq(schoolExamSubjects.id, id));
    return { success: true };
  });
}

export async function deleteStudentExamResult(id: number) {
  const db = await database();
  return db.transaction(async tx => {
    const [result] = await tx.select({ id: studentExamResults.id }).from(studentExamResults)
      .where(eq(studentExamResults.id, id)).limit(1);
    if (!result) throw new Error("삭제할 학생 성적을 찾을 수 없습니다.");
    await tx.delete(studentExamResults).where(eq(studentExamResults.id, id));
    return { success: true };
  });
}
