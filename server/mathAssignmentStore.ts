import mysql, { type PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getPortalFamilyByToken } from "./db";
import { gradeAnswer, isSupportedAnswerKey, normalizeChoice, type GradingRule } from "./mathAssignmentRules";
import allowedManifest from "../shared/autoGradeAllowlist.json";
import answerSheetSpec from "../client/src/lib/answer-sheet-spec.json";
import { deleteMathbankAssignmentCopy } from "./mathbankAssignmentDelete";

export const mathAssignmentRowsPerPage = answerSheetSpec.rows.max;

const allowedIds = new Set<string>(allowedManifest.questionIds);
if (allowedManifest.version !== 1 || allowedIds.size !== 1484 || allowedManifest.questionIds.length !== 1484)
  throw new Error("The fixed 1,484-question auto-grade manifest is invalid");

export type AssignmentItemInput = {
  questionId: string;
  order: number;
  answerType: "choice" | "numeric";
  answerKey: string;
  gradingRule: GradingRule;
  exactForm?: boolean;
  questionLabel?: string;
};
export type IssueAssignmentInput = {
  sourceBasketId: string;
  studentId: number;
  idempotencyKey: string;
  title?: string;
  questions: AssignmentItemInput[];
};
type AssignmentRow = RowDataPacket & {
  id: string; code: string; studentId: number; studentName?: string; title: string;
  status: "open" | "closed"; retryGrants: number; createdAt: string; questionCount?: number; attemptCount?: number;
};
type ItemRow = RowDataPacket & {
  assignmentId: string; ordinal: number; questionId: string; answerType: "choice" | "numeric";
  answerKey: string; gradingRule: GradingRule; exactForm: number | boolean; questionLabel: string | null;
};
type AttemptRow = RowDataPacket & {
  id: string; attemptNumber: number; answers: string; results: string; photoPages: string;
  score: number; total: number; submittedAt: string;
};

let pool: mysql.Pool | undefined;
let initialized: Promise<void> | undefined;
function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (pool ??= mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5, dateStrings: true }));
}

export async function ensureMathAssignmentSchema() {
  if (!process.env.DATABASE_URL) return;
  initialized ??= (async () => {
    const db = database();
    await db.query(`CREATE TABLE IF NOT EXISTS math_assignments (
      id VARCHAR(36) PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE,
      sourceBasketId VARCHAR(128) NOT NULL, studentId INT NOT NULL,
      idempotencyKey VARCHAR(128) NOT NULL UNIQUE, requestHash VARCHAR(64) NOT NULL,
      title VARCHAR(200) NOT NULL, status ENUM('open','closed') NOT NULL DEFAULT 'open',
      retryGrants INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY math_assignments_student_index(studentId, createdAt))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_assignment_items (
      assignmentId VARCHAR(36) NOT NULL, ordinal INT NOT NULL,
      questionId VARCHAR(128) NOT NULL, answerType ENUM('choice','numeric') NOT NULL,
      answerKey VARCHAR(255) NOT NULL, gradingRule ENUM('value','ratio','exact') NOT NULL,
      exactForm BOOLEAN NOT NULL DEFAULT FALSE, questionLabel VARCHAR(200),
      PRIMARY KEY(assignmentId, ordinal),
      UNIQUE KEY math_assignment_items_question_unique(assignmentId, questionId))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_assignment_attempts (
      id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
      attemptNumber INT NOT NULL, answers MEDIUMTEXT NOT NULL, results MEDIUMTEXT NOT NULL,
      photoPages TEXT NOT NULL,
      score INT NOT NULL, total INT NOT NULL,
      submittedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY math_assignment_attempts_number_unique(assignmentId, attemptNumber))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_assignment_photos (
      id VARCHAR(36) PRIMARY KEY, attemptId VARCHAR(36) NOT NULL,
      pageNumber INT NOT NULL, mimeType VARCHAR(20) NOT NULL,
      image LONGBLOB NOT NULL, expiresAt TIMESTAMP NOT NULL,
      UNIQUE KEY math_assignment_photos_page_unique(attemptId, pageNumber),
      KEY math_assignment_photos_expiry_index(expiresAt))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_assignment_audit (
      id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
      actorUserId INT NOT NULL, action VARCHAR(40) NOT NULL,
      detail TEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY math_assignment_audit_assignment_index(assignmentId, createdAt))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_ocr_monthly_usage (
      billingAccountId VARCHAR(128) NOT NULL, month VARCHAR(7) NOT NULL,
      used INT NOT NULL DEFAULT 0, paidAllowance INT NOT NULL DEFAULT 0,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY(billingAccountId, month))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_ocr_requests (
      id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
      studentId INT NOT NULL, attemptNumber INT NOT NULL, pageNumber INT NOT NULL,
      imageHash VARCHAR(64) NOT NULL, status ENUM('pending','complete','failed') NOT NULL,
      response TEXT, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt TIMESTAMP NOT NULL,
      UNIQUE KEY math_ocr_requests_image_unique(assignmentId,attemptNumber,pageNumber,imageHash),
      KEY math_ocr_requests_rate_index(studentId,createdAt))`);
    await db.query(`CREATE TABLE IF NOT EXISTS math_ocr_allowance_audit (
      id VARCHAR(36) PRIMARY KEY, billingAccountId VARCHAR(128) NOT NULL,
      month VARCHAR(7) NOT NULL, actorUserId INT NOT NULL,
      previousAllowance INT NOT NULL, nextAllowance INT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY math_ocr_allowance_audit_month_index(billingAccountId,month,createdAt))`);
  })().catch(error => { initialized = undefined; throw error; });
  await initialized;
}

function badRequest(message: string): never { throw new TRPCError({ code: "BAD_REQUEST", message }); }
function forbidden(): never { throw new TRPCError({ code: "FORBIDDEN", message: "과제에 접근할 수 없습니다." }); }

export async function ensureFamilyAssignmentAccess(token: string, studentId: number) {
  const family = await getPortalFamilyByToken(token);
  if (!family.some(student => student.id === studentId)) forbidden();
}

function publicAttempt(row: AttemptRow) {
  return { id: row.id, submittedAt: row.submittedAt, score: row.score, total: row.total,
    photoPages: JSON.parse(row.photoPages) as number[],
    results: JSON.parse(row.results) as Array<{ ordinal: number; submittedAnswer: string; correct: boolean; correctAnswer: string }> };
}

function publicAssignment(row: AssignmentRow) {
  const attemptCount = Number(row.attemptCount ?? 0);
  return { id: row.id, title: row.title, code: row.code, studentId: row.studentId,
    studentName: row.studentName, questionCount: Number(row.questionCount ?? 0),
    createdAt: row.createdAt, status: row.status, attemptCount,
    canSubmit: row.status === "open" && attemptCount <= row.retryGrants };
}

export async function issueMathAssignment(input: IssueAssignmentInput) {
  await ensureMathAssignmentSchema();
  if (input.questions.length < 1 || input.questions.length > 150) badRequest("문항은 1~150개여야 합니다.");
  const seen = new Set<string>();
  for (const [index, item] of input.questions.entries()) {
    if (item.order !== index + 1 || seen.has(item.questionId) || !allowedIds.has(item.questionId))
      badRequest("1,484개 허용 문항 또는 문항 순서를 확인해 주세요.");
    seen.add(item.questionId);
    if (item.exactForm && (item.answerType !== "numeric" || item.gradingRule !== "exact"))
      badRequest(`문항 ${index + 1}의 정확 표기 조건을 확인해 주세요.`);
    if (!isSupportedAnswerKey(item.answerType, item.answerKey, item.gradingRule))
      badRequest(`문항 ${index + 1}의 정답 형식을 확인해 주세요.`);
  }
  const normalized = { sourceBasketId: input.sourceBasketId, studentId: input.studentId,
    title: input.title || "수학 인쇄 과제", questions: input.questions.map(item => ({ ...item,
      exactForm: item.exactForm ?? false })) };
  const requestHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query<(AssignmentRow & { requestHash: string })[]>(
      "SELECT id,code,requestHash,createdAt FROM math_assignments WHERE idempotencyKey=? FOR UPDATE", [input.idempotencyKey]);
    if (existing.length) {
      if (existing[0].requestHash !== requestHash) badRequest("동일 발행 키에 다른 과제 내용이 사용됐습니다.");
      await connection.commit();
      return { assignmentId: existing[0].id, code: existing[0].code, createdAt: existing[0].createdAt, alreadyExisted: true };
    }
    const [students] = await connection.query<(RowDataPacket & { active: number; portalEnabled: number })[]>(
      "SELECT active,portalEnabled FROM students WHERE id=? LIMIT 1", [input.studentId]);
    if (!students[0]?.active) badRequest("활성 학생만 과제를 발행할 수 있습니다.");
    if (!students[0].portalEnabled) badRequest("학생의 보호자 페이지를 활성화한 뒤 과제를 발행해 주세요.");
    const id = randomUUID();
    const code = randomBytes(7).toString("base64url").toUpperCase();
    await connection.query("INSERT INTO math_assignments(id,code,sourceBasketId,studentId,idempotencyKey,requestHash,title) VALUES(?,?,?,?,?,?,?)",
      [id, code, input.sourceBasketId, input.studentId, input.idempotencyKey, requestHash, normalized.title]);
    for (const item of normalized.questions)
      await connection.query("INSERT INTO math_assignment_items(assignmentId,ordinal,questionId,answerType,answerKey,gradingRule,exactForm,questionLabel) VALUES(?,?,?,?,?,?,?,?)",
        [id, item.order, item.questionId, item.answerType, item.answerKey, item.gradingRule, item.exactForm, item.questionLabel ?? null]);
    await connection.commit();
    return { assignmentId: id, code, createdAt: new Date().toISOString(), alreadyExisted: false };
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      const [rows] = await database().query<(AssignmentRow & { requestHash: string })[]>(
        "SELECT id,code,requestHash,createdAt FROM math_assignments WHERE idempotencyKey=?", [input.idempotencyKey]);
      if (rows[0]?.requestHash === requestHash)
        return { assignmentId: rows[0].id, code: rows[0].code, createdAt: rows[0].createdAt, alreadyExisted: true };
    }
    throw error;
  } finally { connection.release(); }
}

export async function getIssuedMathAssignment(assignmentId: string) {
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=?", [assignmentId]);
  if (!rows[0]) return null;
  const items = await loadItems(database(), assignmentId);
  return { assignmentId: rows[0].id, code: rows[0].code, studentId: rows[0].studentId,
    sourceBasketId: (rows[0] as AssignmentRow & { sourceBasketId: string }).sourceBasketId,
    title: rows[0].title, status: rows[0].status, createdAt: rows[0].createdAt,
    questions: items.map(item => ({ questionId: item.questionId, order: item.ordinal,
      answerType: item.answerType, answerKey: item.answerKey, gradingRule: item.gradingRule,
      exactForm: !!item.exactForm, questionLabel: item.questionLabel })) };
}

async function loadItems(connection: PoolConnection | mysql.Pool, assignmentId: string) {
  const [items] = await connection.query<ItemRow[]>("SELECT * FROM math_assignment_items WHERE assignmentId=? ORDER BY ordinal", [assignmentId]);
  return items;
}

async function loadAttempts(connection: PoolConnection | mysql.Pool, assignmentId: string) {
  const [rows] = await connection.query<AttemptRow[]>("SELECT * FROM math_assignment_attempts WHERE assignmentId=? ORDER BY attemptNumber", [assignmentId]);
  return rows;
}

export async function listPublicMathAssignments(token: string, studentId: number) {
  await ensureFamilyAssignmentAccess(token, studentId);
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<AssignmentRow[]>(`SELECT a.*,COUNT(DISTINCT i.ordinal) AS questionCount,
    COUNT(DISTINCT t.id) AS attemptCount FROM math_assignments a
    LEFT JOIN math_assignment_items i ON i.assignmentId=a.id
    LEFT JOIN math_assignment_attempts t ON t.assignmentId=a.id
    WHERE a.studentId=? GROUP BY a.id ORDER BY a.createdAt DESC`, [studentId]);
  return { assignments: rows.map(publicAssignment) };
}

export async function getPublicMathAssignment(token: string, studentId: number, assignmentId: string) {
  await ensureFamilyAssignmentAccess(token, studentId);
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? AND studentId=?", [assignmentId, studentId]);
  if (!rows[0]) forbidden();
  const items = await loadItems(database(), assignmentId);
  const attempts = await loadAttempts(database(), assignmentId);
  return { ...publicAssignment({ ...rows[0], questionCount: items.length, attemptCount: attempts.length }),
    items: items.map(item => ({ ordinal: item.ordinal, questionId: item.questionId, answerType: item.answerType })),
    attempts: attempts.map(publicAttempt) };
}

function parseImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) badRequest("JPEG 또는 PNG 사진만 업로드할 수 있습니다.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) badRequest("사진은 장당 6MB 이하여야 합니다.");
  if ((match[1] === "image/jpeg" && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) ||
      (match[1] === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"))
    badRequest("사진 파일 형식을 확인해 주세요.");
  return { mimeType: match[1], bytes };
}
export { parseImageDataUrl };

export async function submitMathAssignment(input: { token: string; studentId: number; assignmentId: string;
  code: string; answers: Array<{ ordinal: number; value: string }>; photos?: Array<{ pageNumber: number; imageDataUrl: string }> }) {
  await ensureFamilyAssignmentAccess(input.token, input.studentId);
  await ensureMathAssignmentSchema();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? AND studentId=? FOR UPDATE", [input.assignmentId, input.studentId]);
    const assignment = rows[0];
    if (!assignment || assignment.code !== input.code) forbidden();
    const items = await loadItems(connection, input.assignmentId);
    const attempts = await loadAttempts(connection, input.assignmentId);
    if (assignment.status !== "open" || attempts.length > assignment.retryGrants) badRequest("현재 제출할 수 없는 과제입니다.");
    const answerMap = new Map<number, string>();
    for (const answer of input.answers) {
      if (!items.some(item => item.ordinal === answer.ordinal) || answerMap.has(answer.ordinal)) badRequest("답안 번호가 올바르지 않습니다.");
      answerMap.set(answer.ordinal, answer.value.trim());
    }
    for (const item of items) {
      const value = answerMap.get(item.ordinal) ?? "";
      if (!value) continue;
      if (item.answerType === "choice" ? !normalizeChoice(value) : !isSupportedAnswerKey("numeric", value, item.gradingRule))
        badRequest(`${item.ordinal}번 답안의 형식을 확인해 주세요.`);
    }
    const answers = items.map(item => ({ ordinal: item.ordinal, value: answerMap.get(item.ordinal) ?? "" }));
    const results = items.map(item => {
      const submittedAnswer = answerMap.get(item.ordinal) ?? "";
      return { ordinal: item.ordinal, submittedAnswer,
        correct: gradeAnswer({ answerType: item.answerType, answerKey: item.answerKey,
          submittedAnswer, gradingRule: item.gradingRule, exactForm: !!item.exactForm }),
        correctAnswer: item.answerKey };
    });
    const photos = input.photos ?? [];
    if (photos.length > Math.min(10, Math.ceil(items.length / mathAssignmentRowsPerPage))) badRequest("답안지 장수가 올바르지 않습니다.");
    const photoPages = new Set<number>();
    const imageRows = photos.map(photo => {
      if (photo.pageNumber < 1 || photo.pageNumber > Math.ceil(items.length / mathAssignmentRowsPerPage) || photoPages.has(photo.pageNumber)) badRequest("사진 페이지 번호가 올바르지 않습니다.");
      photoPages.add(photo.pageNumber);
      return { pageNumber: photo.pageNumber, ...parseImageDataUrl(photo.imageDataUrl) };
    });
    const id = randomUUID();
    const score = results.filter(result => result.correct).length;
    await connection.query("INSERT INTO math_assignment_attempts(id,assignmentId,attemptNumber,answers,results,photoPages,score,total) VALUES(?,?,?,?,?,?,?,?)",
      [id, input.assignmentId, attempts.length + 1, JSON.stringify(answers), JSON.stringify(results), JSON.stringify(imageRows.map(photo => photo.pageNumber)), score, items.length]);
    for (const photo of imageRows)
      await connection.query("INSERT INTO math_assignment_photos(id,attemptId,pageNumber,mimeType,image,expiresAt) VALUES(?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 DAY))",
        [randomUUID(), id, photo.pageNumber, photo.mimeType, photo.bytes]);
    await connection.commit();
    return { attemptId: id, score, total: items.length, results, submittedAt: new Date().toISOString() };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function cleanupExpiredMathAssignmentPhotos() {
  await ensureMathAssignmentSchema();
  const [result] = await database().query<ResultSetHeader>("DELETE FROM math_assignment_photos WHERE expiresAt<=NOW()");
  await database().query("DELETE FROM math_ocr_requests WHERE expiresAt<=NOW()");
  return result.affectedRows;
}

export async function listAdminMathAssignments() {
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<AssignmentRow[]>(`SELECT a.*,s.name AS studentName,
    COUNT(DISTINCT i.ordinal) AS questionCount,COUNT(DISTINCT t.id) AS attemptCount
    FROM math_assignments a JOIN students s ON s.id=a.studentId
    LEFT JOIN math_assignment_items i ON i.assignmentId=a.id
    LEFT JOIN math_assignment_attempts t ON t.assignmentId=a.id
    GROUP BY a.id ORDER BY a.createdAt DESC LIMIT 300`);
  return { assignments: rows.map(publicAssignment) };
}

export async function getAdminMathAssignment(assignmentId: string) {
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<AssignmentRow[]>("SELECT a.*,s.name AS studentName FROM math_assignments a JOIN students s ON s.id=a.studentId WHERE a.id=?", [assignmentId]);
  if (!rows[0]) badRequest("과제를 찾을 수 없습니다.");
  const items = await loadItems(database(), assignmentId);
  const attempts = await loadAttempts(database(), assignmentId);
  return { assignment: { ...publicAssignment({ ...rows[0], questionCount: items.length, attemptCount: attempts.length }),
    items: items.map(item => ({ ordinal: item.ordinal, questionId: item.questionId, answerType: item.answerType,
      answerKey: item.answerKey, gradingRule: item.gradingRule, exactForm: !!item.exactForm })),
    attempts: attempts.map(publicAttempt) } };
}

export async function deleteMathAssignment(assignmentId: string) {
  await ensureMathAssignmentSchema();
  const [existing] = await database().query<AssignmentRow[]>(
    "SELECT id FROM math_assignments WHERE id=?", [assignmentId]);
  if (!existing[0]) badRequest("과제를 찾을 수 없습니다.");
  // Never start the local deletion unless Mathbank confirms its printed copy is gone.
  // A retry is safe if Mathbank succeeded and this database later fails.
  await deleteMathbankAssignmentCopy(assignmentId);
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>(
      "SELECT id FROM math_assignments WHERE id=? FOR UPDATE", [assignmentId]);
    if (!rows[0]) badRequest("과제를 찾을 수 없습니다.");

    // These tables have no foreign keys. Remove every assignment-owned record in
    // one transaction so neither submitted answers nor stored photos survive.
    await connection.query(`DELETE FROM math_assignment_photos WHERE attemptId IN
      (SELECT id FROM math_assignment_attempts WHERE assignmentId=?)`, [assignmentId]);
    await connection.query("DELETE FROM math_assignment_attempts WHERE assignmentId=?", [assignmentId]);
    await connection.query("DELETE FROM math_assignment_items WHERE assignmentId=?", [assignmentId]);
    await connection.query("DELETE FROM math_ocr_requests WHERE assignmentId=?", [assignmentId]);
    await connection.query("DELETE FROM math_assignment_audit WHERE assignmentId=?", [assignmentId]);
    await connection.query("DELETE FROM math_assignments WHERE id=?", [assignmentId]);
    await connection.commit();
    return { success: true };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function audit(connection: PoolConnection, assignmentId: string, actorUserId: number, action: string, detail: object) {
  await connection.query("INSERT INTO math_assignment_audit(id,assignmentId,actorUserId,action,detail) VALUES(?,?,?,?,?)",
    [randomUUID(), assignmentId, actorUserId, action, JSON.stringify(detail)]);
}

export async function changeMathAssignmentStatus(assignmentId: string, action: "close" | "reopen", actorUserId: number) {
  await ensureMathAssignmentSchema();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? FOR UPDATE", [assignmentId]);
    if (!rows[0]) badRequest("과제를 찾을 수 없습니다.");
    let addedRetryGrant = false;
    if (action === "close") await connection.query("UPDATE math_assignments SET status='closed' WHERE id=?", [assignmentId]);
    else {
      const [counts] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM math_assignment_attempts WHERE assignmentId=?", [assignmentId]);
      addedRetryGrant = Number(counts[0].count) > rows[0].retryGrants;
      await connection.query("UPDATE math_assignments SET status='open',retryGrants=retryGrants+? WHERE id=?",
        [addedRetryGrant ? 1 : 0, assignmentId]);
    }
    await audit(connection, assignmentId, actorUserId, action, { previousStatus: rows[0].status,
      previousRetryGrants: rows[0].retryGrants, addedRetryGrant });
    await connection.commit();
    return { success: true };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function regradeWithinTransaction(connection: PoolConnection, assignmentId: string) {
  const items = await loadItems(connection, assignmentId);
  const attempts = await loadAttempts(connection, assignmentId);
  for (const attempt of attempts) {
    const answers = JSON.parse(attempt.answers) as Array<{ ordinal: number; value: string }>;
    const answerMap = new Map(answers.map(answer => [answer.ordinal, answer.value]));
    const results = items.map(item => {
      const submittedAnswer = answerMap.get(item.ordinal) ?? "";
      return { ordinal: item.ordinal, submittedAnswer,
        correct: gradeAnswer({ answerType: item.answerType, answerKey: item.answerKey,
          submittedAnswer, gradingRule: item.gradingRule, exactForm: !!item.exactForm }), correctAnswer: item.answerKey };
    });
    const score = results.filter(result => result.correct).length;
    await connection.query("UPDATE math_assignment_attempts SET results=?,score=?,total=? WHERE id=?",
      [JSON.stringify(results), score, items.length, attempt.id]);
  }
  return attempts.length;
}

export async function correctMathAssignmentKey(input: { assignmentId: string; ordinal: number; answerKey: string;
  gradingRule?: GradingRule; exactForm?: boolean; reason: string }, actorUserId: number) {
  await ensureMathAssignmentSchema();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? FOR UPDATE", [input.assignmentId]);
    if (!rows[0]) badRequest("과제를 찾을 수 없습니다.");
    const items = await loadItems(connection, input.assignmentId);
    const item = items.find(row => row.ordinal === input.ordinal);
    if (!item) badRequest("문항 번호가 올바르지 않습니다.");
    const rule = input.gradingRule ?? item.gradingRule;
    if (!isSupportedAnswerKey(item.answerType, input.answerKey, rule)) badRequest("정답 형식을 확인해 주세요.");
    await connection.query("UPDATE math_assignment_items SET answerKey=?,gradingRule=?,exactForm=? WHERE assignmentId=? AND ordinal=?",
      [input.answerKey, rule, input.exactForm ?? !!item.exactForm, input.assignmentId, input.ordinal]);
    const regradedCount = await regradeWithinTransaction(connection, input.assignmentId);
    await audit(connection, input.assignmentId, actorUserId, "correct_key", { ordinal: input.ordinal,
      previous: { answerKey: item.answerKey, gradingRule: item.gradingRule, exactForm: !!item.exactForm },
      next: { answerKey: input.answerKey, gradingRule: rule, exactForm: input.exactForm ?? !!item.exactForm },
      reason: input.reason, regradedCount });
    await connection.commit();
    return { success: true, regradedCount };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function regradeMathAssignment(assignmentId: string, reason: string, actorUserId: number) {
  await ensureMathAssignmentSchema();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? FOR UPDATE", [assignmentId]);
    if (!rows[0]) badRequest("과제를 찾을 수 없습니다.");
    const regradedCount = await regradeWithinTransaction(connection, assignmentId);
    await audit(connection, assignmentId, actorUserId, "regrade", { reason, regradedCount });
    await connection.commit();
    return { success: true, regradedCount };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function getAdminMathAssignmentPhoto(attemptId: string, pageNumber: number) {
  await ensureMathAssignmentSchema();
  const [rows] = await database().query<(RowDataPacket & { image: Buffer; mimeType: string })[]>(
    "SELECT image,mimeType FROM math_assignment_photos WHERE attemptId=? AND pageNumber=? AND expiresAt>NOW()", [attemptId, pageNumber]);
  return rows[0] ? `data:${rows[0].mimeType};base64,${rows[0].image.toString("base64")}` : null;
}

function billingAccountId() {
  const value = process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID;
  if (!value || !/^[A-Za-z0-9-]{6,128}$/.test(value))
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OCR 결제 계정 설정이 필요합니다. 직접 입력을 사용해 주세요." });
  return value;
}
// Fixed UTC-8 is deliberately conservative during Pacific daylight saving time.
// It never resets the app quota before the provider's Pacific monthly boundary.
export function currentMathOcrMonth(now = new Date()) {
  return new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function currentMonth() { return currentMathOcrMonth(); }
export async function getMathOcrUsage() {
  await ensureMathAssignmentSchema();
  const month = currentMonth();
  if (!process.env.GOOGLE_VISION_BILLING_ACCOUNT_ID)
    return { month, used: 0, freeLimit: 1000, paidAllowance: 0, configured: false };
  const billing = billingAccountId();
  const [rows] = await database().query<(RowDataPacket & { used: number; paidAllowance: number })[]>(
    "SELECT used,paidAllowance FROM math_ocr_monthly_usage WHERE billingAccountId=? AND month=?", [billing, month]);
  return { month, used: rows[0]?.used ?? 0, freeLimit: 1000, paidAllowance: rows[0]?.paidAllowance ?? 0,
    configured: !!(process.env.GOOGLE_VISION_API_KEY?.trim() || process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON) };
}
export type MathOcrRegion = { ordinal: number; x: number; y: number; width: number; height: number };
export async function beginMathOcrRequest(input: { token: string; studentId: number; assignmentId: string;
  code: string; pageNumber: number; imageHash: string; regions: MathOcrRegion[] }) {
  await ensureFamilyAssignmentAccess(input.token, input.studentId);
  await ensureMathAssignmentSchema();
  const billing = billingAccountId(), month = currentMonth();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AssignmentRow[]>("SELECT * FROM math_assignments WHERE id=? AND studentId=? FOR UPDATE", [input.assignmentId, input.studentId]);
    const assignment = rows[0];
    if (!assignment || assignment.code !== input.code) forbidden();
    const items = await loadItems(connection, input.assignmentId);
    if (input.pageNumber < 1 || input.pageNumber > Math.ceil(items.length / mathAssignmentRowsPerPage)) badRequest("답안지 페이지가 올바르지 않습니다.");
    if (!input.regions.length || input.regions.length > mathAssignmentRowsPerPage || new Set(input.regions.map(region => region.ordinal)).size !== input.regions.length)
      badRequest("수치 답란 위치가 올바르지 않습니다.");
    for (const region of input.regions) {
      const item = items.find(item => item.ordinal === region.ordinal);
      if (!item || item.answerType !== "numeric" || Math.ceil(item.ordinal / mathAssignmentRowsPerPage) !== input.pageNumber) badRequest("수치 답란과 문항이 일치하지 않습니다.");
    }
    const [attempts] = await connection.query<(RowDataPacket & { count: number })[]>(
      "SELECT COUNT(*) AS count FROM math_assignment_attempts WHERE assignmentId=?", [input.assignmentId]);
    const attemptNumber = Number(attempts[0].count) + 1;
    if (assignment.status !== "open" || attemptNumber > assignment.retryGrants + 1) badRequest("현재 OCR을 사용할 수 없는 과제입니다.");
    const [existing] = await connection.query<(RowDataPacket & { id: string; status: string; response: string | null })[]>(
      "SELECT id,status,response FROM math_ocr_requests WHERE assignmentId=? AND attemptNumber=? AND pageNumber=? AND imageHash=?",
      [input.assignmentId, attemptNumber, input.pageNumber, input.imageHash]);
    if (existing[0]) {
      await connection.commit();
      if (existing[0].status === "complete" && existing[0].response) return { cached: true as const, response: JSON.parse(existing[0].response) };
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "같은 사진의 OCR 처리 결과를 기다리거나 다른 사진으로 다시 시도해 주세요." });
    }
    const [pageCount] = await connection.query<(RowDataPacket & { count: number })[]>(
      "SELECT COUNT(*) AS count FROM math_ocr_requests WHERE assignmentId=? AND attemptNumber=? AND pageNumber=?",
      [input.assignmentId, attemptNumber, input.pageNumber]);
    if (Number(pageCount[0].count) >= 3) badRequest("이 페이지의 OCR 재시도 한도에 도달했습니다. 직접 입력해 주세요.");
    await connection.query("SELECT id FROM students WHERE id=? FOR UPDATE", [input.studentId]);
    const [dailyCount] = await connection.query<(RowDataPacket & { count: number })[]>(
      "SELECT COUNT(*) AS count FROM math_ocr_requests WHERE studentId=? AND createdAt>DATE_SUB(NOW(),INTERVAL 24 HOUR)", [input.studentId]);
    if (Number(dailyCount[0].count) >= 12) badRequest("하루 OCR 사용 한도에 도달했습니다. 직접 입력해 주세요.");
    await connection.query("INSERT IGNORE INTO math_ocr_monthly_usage(billingAccountId,month) VALUES(?,?)", [billing, month]);
    const [reserved] = await connection.query<ResultSetHeader>(
      "UPDATE math_ocr_monthly_usage SET used=used+1 WHERE billingAccountId=? AND month=? AND used<1000+paidAllowance", [billing, month]);
    if (!reserved.affectedRows) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OCR 월 한도에 도달했습니다. 직접 입력을 사용해 주세요." });
    const id = randomUUID();
    await connection.query("INSERT INTO math_ocr_requests(id,assignmentId,studentId,attemptNumber,pageNumber,imageHash,status,expiresAt) VALUES(?,?,?,?,?,?,'pending',DATE_ADD(NOW(),INTERVAL 30 DAY))",
      [id, input.assignmentId, input.studentId, attemptNumber, input.pageNumber, input.imageHash]);
    await connection.commit();
    return { cached: false as const, id };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function finishMathOcrRequest(id: string, response: object) {
  await database().query("UPDATE math_ocr_requests SET status='complete',response=? WHERE id=? AND status='pending'", [JSON.stringify(response), id]);
}
export async function failMathOcrRequest(id: string) {
  await database().query("UPDATE math_ocr_requests SET status='failed' WHERE id=? AND status='pending'", [id]);
}
export async function setMathOcrPaidAllowance(month: string, extraCalls: number, actorUserId: number) {
  await ensureMathAssignmentSchema();
  const billing = billingAccountId();
  const connection = await database().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("INSERT IGNORE INTO math_ocr_monthly_usage(billingAccountId,month) VALUES(?,?)", [billing, month]);
    const [rows] = await connection.query<(RowDataPacket & { used: number; paidAllowance: number })[]>(
      "SELECT used,paidAllowance FROM math_ocr_monthly_usage WHERE billingAccountId=? AND month=? FOR UPDATE", [billing, month]);
    await connection.query("UPDATE math_ocr_monthly_usage SET paidAllowance=? WHERE billingAccountId=? AND month=?", [extraCalls, billing, month]);
    await connection.query("INSERT INTO math_ocr_allowance_audit(id,billingAccountId,month,actorUserId,previousAllowance,nextAllowance) VALUES(?,?,?,?,?,?)",
      [randomUUID(), billing, month, actorUserId, rows[0].paidAllowance, extraCalls]);
    await connection.commit();
    return { month, used: rows[0].used, freeLimit: 1000, paidAllowance: extraCalls };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
