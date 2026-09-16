import "dotenv/config";
import mysql from "mysql2/promise";
import { getMigratedTotalCount } from "../shared/studentCountPolicy";

type StudentRow = {
  id: number;
  name: string;
  grade: string;
  lastWeekCount: number;
  totalCount: number;
};

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const effectiveArg = process.argv.find(arg =>
  arg.startsWith("--effective-from=")
);
const effectiveFrom = effectiveArg?.split("=")[1] ?? "";

if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
  throw new Error("--effective-from=YYYY-MM-DD를 반드시 입력해 주세요.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL이 없습니다.");

function mondayOf(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return date.toISOString().slice(0, 10);
}

function baseAttendanceUnits(status: string) {
  if (status === "present") return 1;
  if (status === "makeup") return 1.5;
  if (status === "makeup_double") return 2;
  return 0;
}

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.beginTransaction();
  const [students] = await connection.query<StudentRow[]>(`
    SELECT id, name, grade, lastWeekCount, totalCount
      FROM students
     WHERE active = 1
     FOR UPDATE
  `);
  const [planRows] = await connection.query<
    Array<{ studentId: number; subjectCount: number }>
  >(`
    SELECT se.studentId, COUNT(DISTINCT cg.subject) AS subjectCount
      FROM student_enrollments se
      INNER JOIN class_groups cg ON cg.id = se.classGroupId AND cg.active = 1
     WHERE se.active = 1
     GROUP BY se.studentId
  `);
  const subjectCountByStudent = new Map(
    planRows.map(row => [row.studentId, Number(row.subjectCount)])
  );
  const [migrationRows] = await connection.query<Array<{ studentId: number }>>(
    "SELECT studentId FROM count_unit_migrations"
  );
  const alreadyMigrated = new Set(migrationRows.map(row => row.studentId));

  const weekStart = mondayOf(effectiveFrom);
  const [attendance] = await connection.query<
    Array<{ studentId: number; status: string }>
  >(
    `SELECT studentId, status
       FROM attendance_records
      WHERE journalDate >= ?
        AND journalDate < ?
        AND WEEKDAY(journalDate) BETWEEN 0 AND 4`,
    [weekStart, effectiveFrom]
  );
  const currentWeekUnits = new Map<number, number>();
  for (const row of attendance) {
    currentWeekUnits.set(
      row.studentId,
      (currentWeekUnits.get(row.studentId) ?? 0) +
        baseAttendanceUnits(row.status)
    );
  }

  const results = [];
  for (const student of students) {
    const target =
      student.grade.trim().startsWith("초") ||
      (subjectCountByStudent.get(student.id) ?? 0) >= 2;
    if (!target) continue;
    if (alreadyMigrated.has(student.id)) {
      results.push({
        id: student.id,
        name: student.name,
        status: "already-migrated",
      });
      continue;
    }
    const usedCount =
      Number(student.lastWeekCount) + (currentWeekUnits.get(student.id) ?? 0);
    const converted = getMigratedTotalCount({
      totalCount: Number(student.totalCount),
      usedCount,
      targetMultiplier: 2,
    });
    results.push({
      id: student.id,
      name: student.name,
      status:
        converted.remainingCount <= 0 ? "non-positive-preserved" : "ready",
      usedCount,
      beforeRemainingCount: converted.remainingCount,
      afterRemainingCount: converted.migratedRemainingCount,
      beforeTotalCount: Number(student.totalCount),
      afterTotalCount: converted.migratedTotalCount,
    });
    if (!apply) continue;
    const [updateResult] = await connection.execute<mysql.ResultSetHeader>(
      `UPDATE students
          SET totalCount = ?, lessonUnitMultiplier = 2, lessonUnitEffectiveFrom = ?
        WHERE id = ? AND lessonUnitMultiplier = 1`,
      [converted.migratedTotalCount, effectiveFrom, student.id]
    );
    if (updateResult.affectedRows !== 1) {
      throw new Error(
        `${student.name}(${student.id}) 학생의 차감 단위가 이미 변경되어 전환을 중단합니다.`
      );
    }
    await connection.execute(
      `INSERT INTO count_unit_migrations
        (studentId, effectiveFrom, multiplier, usedCount, beforeRemainingCount,
         afterRemainingCount, beforeTotalCount, afterTotalCount)
       VALUES (?, ?, 2, ?, ?, ?, ?, ?)`,
      [
        student.id,
        effectiveFrom,
        usedCount,
        converted.remainingCount,
        converted.migratedRemainingCount,
        student.totalCount,
        converted.migratedTotalCount,
      ]
    );
  }

  console.table(results);
  if (apply) {
    await connection.commit();
    console.log(`적용 완료: ${effectiveFrom}부터 2회 차감`);
  } else {
    await connection.rollback();
    console.log(
      "DRY RUN 완료. DB는 변경되지 않았습니다. 적용하려면 --apply를 추가하세요."
    );
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
