import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const [dumpPath, migrationPath] = process.argv.slice(2);

if (!process.env.DATABASE_URL || !dumpPath || !migrationPath) {
  console.error(
    "Usage: DATABASE_URL=... node scripts/restore-railway-backup.mjs <dump.sql> <migration.sql>"
  );
  process.exit(1);
}

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  multipleStatements: true,
  connectTimeout: 30_000,
});

try {
  const dump = await readFile(dumpPath, "utf8");
  await connection.query(dump);

  const migration = await readFile(migrationPath, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await connection.query(statement);
  }

  const [tables] = await connection.query("SHOW TABLES");
  let totalRows = 0;
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${String(tableName).replaceAll("`", "``")}\``
    );
    totalRows += Number(countRows[0].count);
  }

  console.log(
    JSON.stringify({ tables: tables.length, totalRows, migrationStatements: statements.length })
  );
} finally {
  await connection.end();
}
