import {
  backgrounds,
  backgroundId,
  type BackgroundId,
} from "../shared/avatarCollection";
import {
  frames,
  frameId,
  sharingInput,
  type FrameId,
  type Wardrobe,
  type GalleryCard,
  type SharingInput,
} from "../shared/avatarCollection";
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
import { rewardDDL, rewardSchemaUpgrades } from "./avatarRewardSchema";
import {
  rewardOrderInput,
  rewardAdjustmentInput,
} from "../shared/avatarRewards";
import type { z } from "zod";
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
    for (const upgrade of rewardSchemaUpgrades) {
      const [columns] = await database().query<RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
        [upgrade.table, upgrade.column]
      );
      if (!columns.length) {
        try {
          await database().query(upgrade.sql);
        } catch (e) {
          if ((e as { code?: string }).code !== "ER_DUP_FIELDNAME") throw e;
        }
      }
    }
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
      "UPDATE reward_accounts SET balance=?,lifetime=?,completedOrders=?,masterUrl=?,representativeId=?,cropY=?,cropX=? WHERE studentId=?",
      [
        a.balance,
        a.lifetime,
        a.completedOrders,
        a.masterUrl,
        a.representativeId,
        a.cropY,
        a.cropX,
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
      input: rewardOrderInput.parse(JSON.parse(o.input)),
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
  cropY: number,
  cropX: number = 50
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
    a.cropX = cropX;
  });
}
export async function adjustRewardPoints(
  input: z.infer<typeof rewardAdjustmentInput>,
  actorUserId: number
) {
  const parsed = rewardAdjustmentInput.parse(input);
  return transaction(parsed.studentId, async (c, a) => {
    const reason = `관리자 ${parsed.delta > 0 ? "지급" : "차감"}: ${parsed.reason}`;
    const [existing] = await rows<{
      studentId: number;
      delta: number;
      reason: string;
      actorUserId: number;
    }>(
      c,
      "SELECT studentId,delta,reason,actorUserId FROM reward_ledger WHERE requestId=?",
      [parsed.requestId]
    );
    if (existing) {
      if (
        existing.studentId !== parsed.studentId ||
        existing.delta !== parsed.delta ||
        existing.reason !== reason ||
        existing.actorUserId !== actorUserId
      )
        reject("이미 사용한 조정 요청입니다. 새로 입력해 주세요.");
      return { balance: a.balance, duplicate: true };
    }
    if (parsed.delta < 0 && a.balance + parsed.delta < 0)
      reject("사용 가능 포인트보다 많이 차감할 수 없습니다.");
    a.balance += parsed.delta;
    a.lifetime += Math.max(0, parsed.delta);
    await c.query(
      "INSERT INTO reward_ledger(studentId,delta,reason,actorUserId,requestId) VALUES(?,?,?,?,?)",
      [parsed.studentId, parsed.delta, reason, actorUserId, parsed.requestId]
    );
    return { balance: a.balance, duplicate: false };
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

// All purchases and equips serialize on the existing account lock.
export async function wardrobe(studentId: number): Promise<Wardrobe> {
  return transaction(studentId, async c => {
    const [w] = await rows<{
      equipped: FrameId;
      background: BackgroundId;
      cropZoom: number;
    }>(
      c,
      "SELECT equipped,background,cropZoom FROM avatar_wardrobe WHERE studentId=?",
      [studentId]
    );
    const inventory = await rows<{ frameId: string }>(
      c,
      "SELECT frameId FROM avatar_frame_inventory WHERE studentId=?",
      [studentId]
    );
    const bg = await rows<{ backgroundId: string }>(
      c,
      "SELECT backgroundId FROM avatar_background_inventory WHERE studentId=?",
      [studentId]
    );
    const shared = await rows<{
      cardId: string;
      visible: number;
      showName: number;
      showGrade: number;
    }>(
      c,
      "SELECT sh.cardId,sh.visible,sh.showName,sh.showGrade FROM avatar_sharing sh JOIN avatar_collection ac ON ac.id=sh.cardId WHERE ac.studentId=?",
      [studentId]
    );
    return {
      background: w?.background ?? "classic",
      ownedBackgrounds: ["classic", ...bg.map(x => x.backgroundId)],
      equipped: w?.equipped ?? "lunar",
      cropZoom: w?.cropZoom ?? 300,
      owned: ["lunar", ...inventory.map(x => x.frameId)],
      sharing: shared.map(x => ({
        ...x,
        visible: !!x.visible,
        showName: !!x.showName,
        showGrade: !!x.showGrade,
      })),
    };
  });
}
export async function purchaseFrame(studentId: number, id: FrameId) {
  const f = frames.find(x => x.id === frameId.parse(id))!;
  return transaction(studentId, async (c, a) => {
    if (f.price === 0) return;
    const owned = await rows(
      c,
      "SELECT frameId FROM avatar_frame_inventory WHERE studentId=? AND frameId=?",
      [studentId, id]
    );
    if (owned.length) return; // Retry-safe: never charge an owned frame twice.
    if (a.balance < f.price) reject("사용 가능 포인트가 부족해요.");
    await c.query(
      "INSERT INTO avatar_frame_inventory(studentId,frameId) VALUES(?,?)",
      [studentId, id]
    );
    a.balance -= f.price;
    await ledger(c, studentId, -f.price, "프레임 구매 · " + f.name);
  });
}
export async function equipFrame(studentId: number, id: FrameId) {
  frameId.parse(id);
  return transaction(studentId, async c => {
    if (
      id !== "lunar" &&
      !(
        await rows(
          c,
          "SELECT frameId FROM avatar_frame_inventory WHERE studentId=? AND frameId=?",
          [studentId, id]
        )
      ).length
    )
      reject("보유한 프레임만 장착할 수 있어요.");
    await c.query(
      "INSERT INTO avatar_wardrobe(studentId,equipped) VALUES(?,?) ON DUPLICATE KEY UPDATE equipped=VALUES(equipped)",
      [studentId, id]
    );
  });
}
export async function setCropZoom(studentId: number, zoom: number) {
  if (!Number.isInteger(zoom) || zoom < 100 || zoom > 500)
    reject("확대 비율을 확인해 주세요.");
  return transaction(studentId, async c => {
    await c.query(
      "INSERT INTO avatar_wardrobe(studentId,cropZoom) VALUES(?,?) ON DUPLICATE KEY UPDATE cropZoom=VALUES(cropZoom)",
      [studentId, zoom]
    );
  });
}
export async function shareCard(studentId: number, input: SharingInput) {
  const v = sharingInput.parse(input);
  return transaction(studentId, async c => {
    if (
      !(
        await rows(
          c,
          "SELECT id FROM avatar_collection WHERE id=? AND studentId=?",
          [v.cardId, studentId]
        )
      ).length
    )
      reject("내 컬렉션만 공개할 수 있어요.");
    await c.query(
      "INSERT INTO avatar_sharing(cardId,visible,showName,showGrade) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE visible=VALUES(visible),showName=VALUES(showName),showGrade=VALUES(showGrade)",
      [v.cardId, v.visible, v.visible && v.showName, v.visible && v.showGrade]
    );
  });
}
export async function gallery(
  studentId: number,
  page: number = 0
): Promise<GalleryCard[]> {
  await ensureRewardSchema();
  const [result] = await database().query<RowDataPacket[]>(
    `
 SELECT ac.id,ac.url,ac.mode,COALESCE(w.equipped,'lunar') AS frame,COALESCE(w.background,'classic') AS background,
 CASE WHEN sh.showName=1 THEN s.name ELSE '박00' END AS name,
 CASE WHEN sh.showGrade=1 THEN s.grade ELSE '중0학년' END AS grade,
 (SELECT COUNT(*) FROM avatar_likes l WHERE l.cardId=ac.id) AS likes,
 EXISTS(SELECT 1 FROM avatar_likes l WHERE l.cardId=ac.id AND l.studentId=?) AS liked,
 (ac.studentId=?) AS mine
 FROM avatar_collection ac JOIN avatar_sharing sh ON sh.cardId=ac.id AND sh.visible=1
 JOIN students s ON s.id=ac.studentId AND s.active=1
 LEFT JOIN avatar_wardrobe w ON w.studentId=ac.studentId
 ORDER BY sh.updatedAt DESC,ac.id DESC LIMIT 24 OFFSET ?`,
    [studentId, studentId, page * 24]
  );
  return result.map(x => ({
    ...x,
    likes: Number(x.likes),
    liked: !!x.liked,
    mine: !!x.mine,
  })) as GalleryCard[];
}

export async function likeCard(
  studentId: number,
  cardId: string,
  liked: boolean
) {
  await ensureRewardSchema();
  const [owners] = await database().query<RowDataPacket[]>(
    "SELECT studentId FROM avatar_collection WHERE id=?",
    [cardId]
  );
  if (!owners.length || owners[0].studentId === studentId)
    reject("다른 컬렉터의 공개 카드에 마음을 보내 주세요.");
  // Lock the recipient account first, exactly as purchase/share do, avoiding cross-account deadlocks.
  return transaction(Number(owners[0].studentId), async (c, a) => {
    if (
      !(
        await rows(c, "SELECT id FROM students WHERE id=? AND active=1", [
          studentId,
        ])
      ).length
    )
      reject("학생을 찾을 수 없어요.");
    if (
      !(
        await rows(
          c,
          "SELECT cardId FROM avatar_sharing WHERE cardId=? AND visible=1 FOR UPDATE",
          [cardId]
        )
      ).length
    )
      reject("공개 중인 카드가 아니에요.");
    if (liked) {
      await c.query(
        "INSERT IGNORE INTO avatar_likes(cardId,studentId) VALUES(?,?)",
        [cardId, studentId]
      );
      const previous = await rows(
        c,
        "SELECT cardId FROM avatar_like_rewards WHERE cardId=? AND studentId=?",
        [cardId, studentId]
      );
      if (!previous.length) {
        await c.query(
          "INSERT INTO avatar_like_rewards(cardId,studentId) VALUES(?,?)",
          [cardId, studentId]
        );
        a.balance += 10;
        a.lifetime += 10;
        await ledger(c, a.studentId, 10, "컬렉션 좋아요 보상");
      }
    } else
      await c.query("DELETE FROM avatar_likes WHERE cardId=? AND studentId=?", [
        cardId,
        studentId,
      ]);
  });
}
export async function purchaseBackground(studentId: number, id: BackgroundId) {
  const item = backgrounds.find(x => x.id === backgroundId.parse(id))!;
  return transaction(studentId, async (c, a) => {
    if (
      !item.price ||
      (
        await rows(
          c,
          "SELECT backgroundId FROM avatar_background_inventory WHERE studentId=? AND backgroundId=?",
          [studentId, id]
        )
      ).length
    )
      return;
    if (a.balance < item.price) reject("사용 가능 포인트가 부족해요.");
    await c.query(
      "INSERT INTO avatar_background_inventory(studentId,backgroundId) VALUES(?,?)",
      [studentId, id]
    );
    a.balance -= item.price;
    await ledger(c, studentId, -item.price, "배경 구매 · " + item.name);
  });
}
export async function equipBackground(studentId: number, id: BackgroundId) {
  backgroundId.parse(id);
  return transaction(studentId, async c => {
    if (
      id !== "classic" &&
      !(
        await rows(
          c,
          "SELECT backgroundId FROM avatar_background_inventory WHERE studentId=? AND backgroundId=?",
          [studentId, id]
        )
      ).length
    )
      reject("보유한 배경만 장착할 수 있어요.");
    await c.query(
      "INSERT INTO avatar_wardrobe(studentId,background) VALUES(?,?) ON DUPLICATE KEY UPDATE background=VALUES(background)",
      [studentId, id]
    );
  });
}
