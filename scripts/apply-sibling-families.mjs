import mysql from "mysql2/promise";

const familyGroups = [
  { key: "family-lee-woojin-jieun", names: ["이우진", "이지은"] },
  { key: "family-chae-junwoo-junhwi", names: ["채준우", "채준휘"] },
  { key: "family-kim-wootaek-woohwon", names: ["김우택", "김우훤"] },
  { key: "family-lim-hyeonsu-hyeonjin", names: ["임현수", "임현진"] },
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [columns] = await connection.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'familyKey'"
  );
  if (columns.length === 0) {
    await connection.query("ALTER TABLE students ADD familyKey varchar(64) NULL");
  }

  const [indexes] = await connection.query(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'students_family_key_index'"
  );
  if (indexes.length === 0) {
    await connection.query(
      "CREATE INDEX students_family_key_index ON students (familyKey)"
    );
  }

  const allNames = familyGroups.flatMap(group => group.names);
  const placeholders = allNames.map(() => "?").join(", ");
  const [students] = await connection.query(
    `SELECT id, name FROM students WHERE active = 1 AND name IN (${placeholders})`,
    allNames
  );
  for (const name of allNames) {
    const matches = students.filter(student => student.name === name);
    if (matches.length !== 1)
      throw new Error(`${name} 학생이 ${matches.length}명 조회되어 적용을 중단합니다.`);
  }

  await connection.beginTransaction();
  for (const group of familyGroups) {
    await connection.query(
      "UPDATE students SET familyKey = ? WHERE active = 1 AND name IN (?, ?)",
      [group.key, ...group.names]
    );
  }
  await connection.commit();

  console.log(
    JSON.stringify({
      familyCount: familyGroups.length,
      studentCount: allNames.length,
      families: familyGroups.map(group => group.names),
    })
  );
} catch (error) {
  try {
    await connection.rollback();
  } catch {}
  throw error;
} finally {
  await connection.end();
}
