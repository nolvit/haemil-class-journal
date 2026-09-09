import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { avatarPrice } from "../shared/avatarRewardRules";
import type {
  RewardAccount,
  RewardOrder,
  RewardOrderInput,
  RewardSnapshot,
} from "../shared/avatarRewards";
import { rewardDDL } from "./avatarRewardSchema";
import { buildRewardPrompt } from "./avatarRewardPrompt";

let pool: mysql.Pool | undefined;
let initialized: Promise<void> | undefined;
function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (pool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 4,
    dateStrings: true,
  }));
}
export async function ensureRewardSchema() {
  if (!process.env.DATABASE_URL) return;
  initialized ??= (async () => {
    for (const statement of rewardDDL) await database().query(statement);
  })().catch(e => {
    initialized = undefined;
    throw e;
  });
  await initialized;
}
export function attendanceRecordPoints(row: {
  status: string;
  arrivalTime: string | null;
  departureTime: string | null;
}) {
  if (!["present", "makeup", "makeup_double"].includes(row.status)) return 0;
  const minutes = (time: string | null) => {
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const start = minutes(row.arrivalTime),
    end = minutes(row.departureTime);
  return start === null || end === null || end < start
    ? 0
    : Math.min(150, end - start);
}
async function rows<T>(
  c: PoolConnection,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const [result] = await c.query<RowDataPacket[]>(query, params);
  return result as T[];
}
function reject(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
async function ledger(
  c: PoolConnection,
  id: number,
  delta: number,
  reason: string
) {
  await c.query(
    "INSERT INTO reward_ledger(studentId,delta,reason) VALUES(?,?,?)",
    [id, delta, reason]
  );
}
async function reconcile(c: PoolConnection, account: RewardAccount) {
  const records = await rows<{
    journalDate: string;
    status: string;
    arrivalTime: string | null;
    departureTime: string | null;
  }>(
    c,
    "SELECT journalDate,status,arrivalTime,departureTime FROM attendance_records WHERE studentId=? AND journalDate>=? AND journalDate<=? FOR UPDATE",
    [
      account.studentId,
      "2026-09-09",
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
        new Date()
      ),
    ]
  );
  const old = await rows<{ day: string; points: number }>(
    c,
    "SELECT day,points FROM reward_days WHERE studentId=?",
    [account.studentId]
  );
  const current = new Map(
    records.map(r => [r.journalDate, attendanceRecordPoints(r)])
  );
  for (const previous of old)
    if (!current.has(previous.day)) current.set(previous.day, 0);
  const previous = new Map(old.map(r => [r.day, r.points]));
  for (const [day, points] of Array.from(current)) {
    const delta = points - (previous.get(day) ?? 0);
    if (!delta) continue;
    await c.query(
      "INSERT INTO reward_days(studentId,day,points) VALUES(?,?,?) ON DUPLICATE KEY UPDATE points=VALUES(points)",
      [account.studentId, day, points]
    );
    await ledger(
      c,
      account.studentId,
      delta,
      `${day} 출석 ${previous.has(day) ? "정정" : "적립"}`
    );
    account.balance += delta;
    account.lifetime += delta;
  }
}
async function transaction<T>(
  studentId: number,
  work: (c: PoolConnection, a: RewardAccount) => Promise<T>
): Promise<T> {
  await ensureRewardSchema();
  const c = await database().getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    const student = await rows(
      c,
      "SELECT id FROM students WHERE id=? AND active=1",
      [studentId]
    );
    if (!student.length) reject("학생을 찾을 수 없습니다.");
    await c.query(
      "INSERT INTO reward_accounts(studentId) VALUES(?) ON DUPLICATE KEY UPDATE studentId=VALUES(studentId)",
      [studentId]
    );
    const [a] = await rows<RewardAccount>(
      c,
      "SELECT * FROM reward_accounts WHERE studentId=? FOR UPDATE",
      [studentId]
    );
    await reconcile(c, a);
    const result = await work(c, a);
    await c.query(
      "UPDATE reward_accounts SET balance=?,lifetime=?,completedOrders=?,masterUrl=?,representativeId=?,cropY=? WHERE studentId=?",
      [
        a.balance,
        a.lifetime,
        a.completedOrders,
        a.masterUrl,
        a.representativeId,
        a.cropY,
        studentId,
      ]
    );
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
async function orders(
  c: PoolConnection,
  studentId: number
): Promise<RewardOrder[]> {
  const result = await rows<
    Omit<RewardOrder, "input" | "candidates"> & { input: string }
  >(
    c,
    "SELECT * FROM avatar_orders WHERE studentId=? ORDER BY createdAt DESC",
    [studentId]
  );
  return Promise.all(
    result.map(async o => ({
      ...o,
      input: JSON.parse(o.input),
      candidates: await rows<{ id: string; url: string }>(
        c,
        "SELECT id,url FROM avatar_candidates WHERE orderId=? ORDER BY id",
        [o.id]
      ),
    }))
  );
}
export async function rewardSnapshot(
  studentId: number
): Promise<RewardSnapshot> {
  return transaction(studentId, async (c, account) => ({
    account,
    nextPrice: avatarPrice(account.completedOrders),
    orders: await orders(c, studentId),
    cards: await rows(
      c,
      "SELECT id,url,mode,createdAt FROM avatar_collection WHERE studentId=? ORDER BY createdAt DESC",
      [studentId]
    ),
    ledger: await rows(
      c,
      "SELECT id,delta,reason,createdAt FROM reward_ledger WHERE studentId=? ORDER BY id DESC LIMIT 500",
      [studentId]
    ),
  }));
}
export async function submitRewardOrder(
  studentId: number,
  input: RewardOrderInput
) {
  return transaction(studentId, async (c, a) => {
    if (!a.masterUrl) reject("마스터 아바타가 준비되면 주문할 수 있어요.");
    if (
      (
        await rows(
          c,
          "SELECT id FROM avatar_orders WHERE studentId=? AND status IN ('submitted','ready')",
          [studentId]
        )
      ).length
    )
      reject("진행 중인 주문이 있어요.");
    const price = avatarPrice(a.completedOrders);
    if (a.balance < price) reject("사용 가능 포인트가 부족해요.");
    const id = randomUUID();
    await c.query(
      "INSERT INTO avatar_orders(id,studentId,status,price,input,prompt,masterUrl) VALUES(?,?,'submitted',?,?,?,?)",
      [
        id,
        studentId,
        price,
        JSON.stringify(input),
        buildRewardPrompt(input),
        a.masterUrl,
      ]
    );
    a.balance -= price;
    await ledger(c, studentId, -price, "스페셜 아바타 주문");
    return { id };
  });
}
export async function cancelRewardOrder(studentId: number, orderId: string) {
  return transaction(studentId, async (c, a) => {
    const [o] = await rows<RewardOrder>(
      c,
      "SELECT * FROM avatar_orders WHERE id=? AND studentId=?",
      [orderId, studentId]
    );
    if (!o) reject("주문을 찾을 수 없습니다.");
    if (o.status === "cancelled") return;
    if (o.status === "completed")
      reject("선택이 완료된 주문은 취소할 수 없습니다.");
    await c.query("UPDATE avatar_orders SET status='cancelled' WHERE id=?", [
      orderId,
    ]);
    a.balance += o.price;
    await ledger(c, studentId, o.price, "주문 취소 환불");
  });
}
export async function publishRewardCandidates(
  studentId: number,
  orderId: string,
  urls: [string, string]
) {
  return transaction(studentId, async c => {
    const [o] = await rows<RewardOrder>(
      c,
      "SELECT * FROM avatar_orders WHERE id=? AND studentId=?",
      [orderId, studentId]
    );
    if (!o || o.status !== "submitted")
      reject("후보를 업로드할 수 없는 주문입니다.");
    for (const url of urls)
      await c.query(
        "INSERT INTO avatar_candidates(id,orderId,url) VALUES(?,?,?)",
        [randomUUID(), orderId, url]
      );
    await c.query("UPDATE avatar_orders SET status='ready' WHERE id=?", [
      orderId,
    ]);
  });
}
export async function selectRewardCandidate(
  studentId: number,
  orderId: string,
  candidateId: string
) {
  return transaction(studentId, async (c, a) => {
    const [o] = await rows<RewardOrder>(
      c,
      "SELECT * FROM avatar_orders WHERE id=? AND studentId=?",
      [orderId, studentId]
    );
    if (!o || o.status !== "ready")
      reject("이미 선택했거나 선택할 수 없는 주문이에요.");
    const [candidate] = await rows<{ url: string }>(
      c,
      "SELECT url FROM avatar_candidates WHERE id=? AND orderId=?",
      [candidateId, orderId]
    );
    if (!candidate) reject("이 주문의 후보가 아닙니다.");
    const id = randomUUID();
    const input = JSON.parse(o.input as unknown as string) as RewardOrderInput;
    await c.query(
      "INSERT INTO avatar_collection(id,studentId,orderId,url,mode) VALUES(?,?,?,?,?)",
      [id, studentId, orderId, candidate.url, input.mode]
    );
    await c.query("UPDATE avatar_orders SET status='completed' WHERE id=?", [
      orderId,
    ]);
    a.completedOrders++;
  });
}
export async function setRewardRepresentative(
  studentId: number,
  cardId: string | null,
  cropY: number
) {
  return transaction(studentId, async (c, a) => {
    if (
      cardId &&
      !(
        await rows(
          c,
          "SELECT id FROM avatar_collection WHERE id=? AND studentId=?",
          [cardId, studentId]
        )
      ).length
    )
      reject("내 컬렉션에서 선택해 주세요.");
    a.representativeId = cardId;
    a.cropY = cropY;
  });
}
export async function setRewardMaster(studentId: number, url: string) {
  return transaction(studentId, async (_c, a) => {
    a.masterUrl = url;
  });
}
export async function rewardAdminList() {
  await ensureRewardSchema();
  const [result] = await database().query<RowDataPacket[]>(
    `SELECT s.id,s.name,s.grade,a.masterUrl,COALESCE(SUM(o.status='submitted'),0) AS newOrders,COALESCE(SUM(o.status='ready'),0) AS readyOrders FROM students s LEFT JOIN reward_accounts a ON a.studentId=s.id LEFT JOIN avatar_orders o ON o.studentId=s.id WHERE s.active=1 GROUP BY s.id,s.name,s.grade,a.masterUrl ORDER BY newOrders DESC,s.name`
  );
  return result as {
    id: number;
    name: string;
    grade: string;
    masterUrl: string | null;
    newOrders: number;
    readyOrders: number;
  }[];
}
export async function settleRewardAttendance() {
  if (!process.env.DATABASE_URL) return;
  for (const student of await rewardAdminList())
    await transaction(student.id, async () => {});
}
