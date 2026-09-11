import { galleryPageSize } from "../shared/avatarCollection";
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
import mysql, {
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  avatarPrice,
  avatarOrderPrice,
  randomPrice,
} from "../shared/avatarRewardRules";
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
import type {
  OfficialCharacter,
  OfficialCharacterInput,
} from "../shared/avatarOfficial";
import {
  avatarBgmPrice,
  avatarBgmTrackId,
  type AvatarBgmState,
  type AvatarBgmTrackId,
} from "../shared/avatarBgm";
import {
  defaultShopItems,
  type ShopItem,
  type ShopItemInput,
  type ShopCategory,
  type ShopAssetRole,
  type WorldThemeState,
} from "../shared/avatarShop";

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
    for (const item of defaultShopItems)
      await database().query(
        "INSERT IGNORE INTO avatar_shop_items(id,category,name,description,rankLabel,price,season,assetUrl,durationSeconds,active) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          item.id,
          item.category,
          item.name,
          item.description,
          item.rank,
          item.price,
          item.season,
          item.assetUrl,
          item.durationSeconds,
          item.active,
        ]
      );
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
      `SELECT ac.id,ac.url,ac.mode,ac.createdAt,COALESCE(cs.frameId,'lunar') frame,COALESCE(cs.backgroundId,'classic') background,
       COALESCE(sh.cropX,50) galleryCropX,COALESCE(sh.cropY,20) galleryCropY,COALESCE(sh.cropZoom,190) galleryCropZoom
       FROM avatar_collection ac LEFT JOIN avatar_card_style cs ON cs.cardId=ac.id LEFT JOIN avatar_sharing sh ON sh.cardId=ac.id
       WHERE ac.studentId=? ORDER BY ac.createdAt DESC`,
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
    const price = avatarOrderPrice(
      a.completedOrders,
      input.mode,
      (input.selectedParts ?? []).length,
      input.accessories.length
    );
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
export async function chargeRewardRandom(
  studentId: number,
  all: boolean,
  requestId: string
) {
  return transaction(studentId, async (c, a) => {
    const [existing] = await rows<{ delta: number }>(
      c,
      "SELECT delta FROM reward_ledger WHERE requestId=?",
      [requestId]
    );
    if (existing)
      return { price: -existing.delta, balance: a.balance, duplicate: true };
    const price = randomPrice(a.completedOrders, all);
    if (a.balance < price) reject("랜덤 사용에 필요한 포인트가 부족해요.");
    a.balance -= price;
    await c.query(
      "INSERT INTO reward_ledger(studentId,delta,reason,requestId) VALUES(?,?,?,?)",
      [studentId, -price, all ? "전체 랜덤 사용" : "부위 랜덤 사용", requestId]
    );
    return { price, balance: a.balance, duplicate: false };
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
export async function bulkAdjustRewardPoints(
  inputs: z.infer<typeof rewardAdjustmentInput>[],
  actorUserId: number
) {
  const results = [];
  for (const input of inputs) {
    if (input.delta <= 0) reject("일괄 지급 포인트는 1P 이상이어야 합니다.");
    results.push(await adjustRewardPoints(input, actorUserId));
  }
  return { count: results.length };
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

export async function bgmState(studentId: number): Promise<AvatarBgmState> {
  return transaction(studentId, async c => {
    const owned = await rows<{ trackId: AvatarBgmTrackId }>(
      c,
      "SELECT trackId FROM avatar_bgm_inventory WHERE studentId=? ORDER BY purchasedAt,trackId",
      [studentId]
    );
    const [settings] = await rows<{ equippedTrackId: string | null }>(
      c,
      "SELECT equippedTrackId FROM avatar_bgm_settings WHERE studentId=?",
      [studentId]
    );
    const ownedIds = owned
      .map(row => avatarBgmTrackId.safeParse(row.trackId))
      .filter(result => result.success)
      .map(result => result.data);
    const equipped = avatarBgmTrackId.safeParse(settings?.equippedTrackId);
    const catalog = await rows<{
      id: string;
      name: string;
      description: string;
      price: number;
      assetUrl: string;
      durationSeconds: number;
    }>(
      c,
      "SELECT id,name,description,price,assetUrl,durationSeconds FROM avatar_shop_items WHERE category='bgm' AND ((deleted=0 AND active=1) OR id IN (SELECT trackId FROM avatar_bgm_inventory WHERE studentId=?)) ORDER BY createdAt,id",
      [studentId]
    );
    return {
      owned: ownedIds,
      equipped:
        equipped.success && ownedIds.includes(equipped.data)
          ? equipped.data
          : null,
      firstPurchaseFree: ownedIds.length === 0,
      tracks: catalog
        .filter(x => x.assetUrl)
        .map(x => ({
          id: x.id,
          title: x.name,
          description: x.description,
          price: x.price,
          url: x.assetUrl,
          durationSeconds: Number(x.durationSeconds || 0),
          durationLabel: `${Math.floor(Number(x.durationSeconds || 0) / 60)}분 ${Number(x.durationSeconds || 0) % 60}초`,
        })),
    };
  });
}

export async function purchaseBgm(
  studentId: number,
  trackId: AvatarBgmTrackId
) {
  return transaction(studentId, async (c, account) => {
    const [track] = await rows<{ name: string; price: number }>(
      c,
      "SELECT name,price FROM avatar_shop_items WHERE id=? AND category='bgm' AND active=1 AND deleted=0 FOR UPDATE",
      [trackId]
    );
    if (!track) reject("판매 중인 BGM을 찾을 수 없어요.");
    const owned = await rows<{ trackId: string }>(
      c,
      "SELECT trackId FROM avatar_bgm_inventory WHERE studentId=? FOR UPDATE",
      [studentId]
    );
    if (owned.some(row => row.trackId === trackId))
      return { price: 0, balance: account.balance, duplicate: true };
    const price = avatarBgmPrice(owned.length, Number(track.price));
    if (account.balance < price) reject("BGM 구매 포인트가 부족해요.");
    account.balance -= price;
    await c.query(
      "INSERT INTO avatar_bgm_inventory(studentId,trackId,purchasePrice) VALUES(?,?,?)",
      [studentId, trackId, price]
    );
    await c.query(
      "INSERT INTO avatar_bgm_settings(studentId,equippedTrackId) VALUES(?,?) ON DUPLICATE KEY UPDATE equippedTrackId=IF(equippedTrackId IS NULL,VALUES(equippedTrackId),equippedTrackId)",
      [studentId, trackId]
    );
    if (price) await ledger(c, studentId, -price, `BGM 소장: ${track.name}`);
    return { price, balance: account.balance, duplicate: false };
  });
}

function mapShopItem(x: any): ShopItem {
  return {
    ...x,
    rank: x.rankLabel,
    price: Number(x.price),
    durationSeconds:
      x.durationSeconds == null ? null : Number(x.durationSeconds),
    active: !!x.active,
    salesCount: Number(x.salesCount ?? 0),
    assets: x.assets ?? {},
  };
}
async function attachShopAssets(items: ShopItem[]) {
  if (!items.length) return items;
  const [assetRows] = await database().query<RowDataPacket[]>(
    "SELECT itemId,assetRole,assetUrl FROM avatar_shop_item_assets WHERE itemId IN (?)",
    [items.map(item => item.id)]
  );
  for (const row of assetRows) {
    const item = items.find(x => x.id === row.itemId);
    if (item) item.assets[row.assetRole as ShopAssetRole] = row.assetUrl;
  }
  return items;
}
export async function shopCatalog(
  category?: ShopCategory,
  includeHidden = false
): Promise<ShopItem[]> {
  await ensureRewardSchema();
  const params: unknown[] = [];
  let where = includeHidden
    ? "item.deleted=0"
    : "item.deleted=0 AND item.active=1";
  if (category) {
    where += " AND item.category=?";
    params.push(category);
  }
  const [data] = await database().query<RowDataPacket[]>(
    `SELECT item.*,COALESCE(sales.salesCount,0) AS salesCount
     FROM avatar_shop_items item
     LEFT JOIN (
       SELECT 'card_frame' AS category,frameId AS id,COUNT(*) AS salesCount FROM avatar_card_frames GROUP BY frameId
       UNION ALL
       SELECT 'card_background',backgroundId,COUNT(*) FROM avatar_card_backgrounds GROUP BY backgroundId
       UNION ALL
       SELECT 'world_background',worldId,COUNT(*) FROM avatar_world_inventory GROUP BY worldId
       UNION ALL
       SELECT 'bgm',trackId,COUNT(*) FROM avatar_bgm_inventory GROUP BY trackId
     ) sales ON sales.category=item.category AND sales.id=item.id
     WHERE ${where}
     ORDER BY item.category,item.season,item.price,item.id`,
    params
  );
  return attachShopAssets(data.map(mapShopItem));
}
export async function ownedDecorationCatalog(studentId: number) {
  await ensureRewardSchema();
  const [data] = await database().query<RowDataPacket[]>(
    `SELECT item.* FROM avatar_shop_items item WHERE
      (item.category='card_frame' AND EXISTS (
        SELECT 1 FROM avatar_card_frames f JOIN avatar_collection c ON c.id=f.cardId
        WHERE c.studentId=? AND f.frameId=item.id
      )) OR (item.category='card_background' AND EXISTS (
        SELECT 1 FROM avatar_card_backgrounds b JOIN avatar_collection c ON c.id=b.cardId
        WHERE c.studentId=? AND b.backgroundId=item.id
      )) ORDER BY item.category,item.name`,
    [studentId, studentId]
  );
  return attachShopAssets(data.map(mapShopItem));
}
async function saveShopItemAssets(input: ShopItemInput) {
  for (const [role, url] of Object.entries(input.assets))
    if (url)
      await database().query(
        "INSERT INTO avatar_shop_item_assets(itemId,assetRole,assetUrl) VALUES(?,?,?) ON DUPLICATE KEY UPDATE assetUrl=VALUES(assetUrl)",
        [input.id, role, url]
      );
}
export async function createShopItem(input: ShopItemInput) {
  await ensureRewardSchema();
  try {
    await database().query(
      "INSERT INTO avatar_shop_items(id,category,name,description,rankLabel,price,season,assetUrl,durationSeconds,active) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        input.id,
        input.category,
        input.name,
        input.description,
        input.rank,
        input.price,
        input.season,
        input.assetUrl,
        input.durationSeconds,
        input.active,
      ]
    );
    await saveShopItemAssets(input);
  } catch (e) {
    if ((e as any).code === "ER_DUP_ENTRY")
      reject("이미 사용 중인 상품 ID예요.");
    throw e;
  }
}
export async function updateShopItem(input: ShopItemInput) {
  await ensureRewardSchema();
  const [r] = await database().query<ResultSetHeader>(
    "UPDATE avatar_shop_items SET category=?,name=?,description=?,rankLabel=?,price=?,season=?,assetUrl=?,durationSeconds=?,active=? WHERE id=? AND deleted=0",
    [
      input.category,
      input.name,
      input.description,
      input.rank,
      input.price,
      input.season,
      input.assetUrl,
      input.durationSeconds,
      input.active,
      input.id,
    ]
  );
  if (!r.affectedRows) reject("상품을 찾을 수 없습니다.");
  await saveShopItemAssets(input);
}
export async function deleteShopItem(id: string) {
  await ensureRewardSchema();
  const [r] = await database().query<ResultSetHeader>(
    "UPDATE avatar_shop_items SET active=0,deleted=1 WHERE id=?",
    [id]
  );
  if (!r.affectedRows) reject("상품을 찾을 수 없습니다.");
}

export async function equipBgm(studentId: number, trackId: AvatarBgmTrackId) {
  return transaction(studentId, async c => {
    const owned = await rows(
      c,
      "SELECT trackId FROM avatar_bgm_inventory WHERE studentId=? AND trackId=?",
      [studentId, trackId]
    );
    if (!owned.length) reject("먼저 이 BGM을 소장해 주세요.");
    await c.query(
      "INSERT INTO avatar_bgm_settings(studentId,equippedTrackId) VALUES(?,?) ON DUPLICATE KEY UPDATE equippedTrackId=VALUES(equippedTrackId)",
      [studentId, trackId]
    );
  });
}

function resolvedWorldAssets(items: ShopItem[], equipped: string) {
  const basic = items.find(x => x.id === "starlight-court");
  const current = items.find(x => x.id === equipped) ?? basic;
  return {
    ...(basic?.assets ?? {}),
    ...(basic?.assetUrl ? { world_background: basic.assetUrl } : {}),
    ...(current?.assets ?? {}),
    ...(current?.assetUrl ? { world_background: current.assetUrl } : {}),
  } as Partial<Record<ShopAssetRole, string>>;
}
export async function worldThemeState(
  studentId: number
): Promise<WorldThemeState> {
  await ensureRewardSchema();
  const [inventory] = await database().query<RowDataPacket[]>(
    "SELECT worldId FROM avatar_world_inventory WHERE studentId=? ORDER BY purchasedAt,worldId",
    [studentId]
  );
  const [settings] = await database().query<RowDataPacket[]>(
    "SELECT equippedWorldId FROM avatar_world_settings WHERE studentId=?",
    [studentId]
  );
  const [catalogRows] = await database().query<RowDataPacket[]>(
    "SELECT * FROM avatar_shop_items WHERE category='world_background' AND ((deleted=0 AND active=1) OR id IN (SELECT worldId FROM avatar_world_inventory WHERE studentId=?)) ORDER BY season,price,id",
    [studentId]
  );
  const items = await attachShopAssets(catalogRows.map(mapShopItem));
  const owned = Array.from(
    new Set([
      "starlight-court",
      ...inventory.map(row => String(row.worldId)),
      ...items.filter(item => item.price === 0).map(item => item.id),
    ])
  );
  const requested = String(settings[0]?.equippedWorldId ?? "starlight-court");
  const equipped = owned.includes(requested) ? requested : "starlight-court";
  return {
    owned,
    equipped,
    items,
    assets: resolvedWorldAssets(items, equipped),
  };
}
export async function purchaseWorldTheme(studentId: number, worldId: string) {
  return transaction(studentId, async (c, account) => {
    const [item] = await rows<{ name: string; price: number }>(
      c,
      "SELECT name,price FROM avatar_shop_items WHERE id=? AND category='world_background' AND active=1 AND deleted=0 FOR UPDATE",
      [worldId]
    );
    if (!item) reject("판매 중인 전체 배경을 찾을 수 없어요.");
    const owned = await rows(
      c,
      "SELECT worldId FROM avatar_world_inventory WHERE studentId=? AND worldId=?",
      [studentId, worldId]
    );
    if (owned.length) return { balance: account.balance, duplicate: true };
    const price = Number(item.price);
    if (account.balance < price) reject("전체 배경 구매 포인트가 부족해요.");
    await c.query(
      "INSERT INTO avatar_world_inventory(studentId,worldId,purchasePrice) VALUES(?,?,?)",
      [studentId, worldId, price]
    );
    account.balance -= price;
    if (price)
      await ledger(c, studentId, -price, `전체 배경 소장: ${item.name}`);
    return { balance: account.balance, duplicate: false };
  });
}
export async function equipWorldTheme(studentId: number, worldId: string) {
  return transaction(studentId, async c => {
    const [item] = await rows<{ price: number }>(
      c,
      "SELECT price FROM avatar_shop_items WHERE id=? AND category='world_background'",
      [worldId]
    );
    if (!item) reject("전체 배경을 찾을 수 없어요.");
    if (
      Number(item.price) > 0 &&
      !(
        await rows(
          c,
          "SELECT worldId FROM avatar_world_inventory WHERE studentId=? AND worldId=?",
          [studentId, worldId]
        )
      ).length
    )
      reject("먼저 이 전체 배경을 소장해 주세요.");
    await c.query(
      "INSERT INTO avatar_world_settings(studentId,equippedWorldId) VALUES(?,?) ON DUPLICATE KEY UPDATE equippedWorldId=VALUES(equippedWorldId)",
      [studentId, worldId]
    );
  });
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
      cropX: number;
      cropY: number;
      cropZoom: number;
    }>(
      c,
      "SELECT sh.cardId,sh.visible,sh.showName,sh.showGrade,sh.cropX,sh.cropY,sh.cropZoom FROM avatar_sharing sh JOIN avatar_collection ac ON ac.id=sh.cardId WHERE ac.studentId=?",
      [studentId]
    );
    const styles = await rows<{
      cardId: string;
      frameId: FrameId;
      backgroundId: BackgroundId;
    }>(
      c,
      "SELECT cs.cardId,cs.frameId,cs.backgroundId FROM avatar_card_style cs JOIN avatar_collection ac ON ac.id=cs.cardId WHERE ac.studentId=?",
      [studentId]
    );
    const cardFrames = await rows<{ cardId: string; frameId: string }>(
      c,
      "SELECT f.cardId,f.frameId FROM avatar_card_frames f JOIN avatar_collection ac ON ac.id=f.cardId WHERE ac.studentId=?",
      [studentId]
    );
    const cardBackgrounds = await rows<{
      cardId: string;
      backgroundId: string;
    }>(
      c,
      "SELECT b.cardId,b.backgroundId FROM avatar_card_backgrounds b JOIN avatar_collection ac ON ac.id=b.cardId WHERE ac.studentId=?",
      [studentId]
    );
    // Active catalog assets are needed for shop previews. Assets attached to a
    // student's cards remain resolvable even if an administrator later hides
    // or retires the product, so previous purchases never lose their artwork.
    const decorationAssets = await rows<{
      id: string;
      category: "card_frame" | "card_background";
      assetUrl: string;
    }>(
      c,
      `SELECT id,category,assetUrl
       FROM avatar_shop_items
       WHERE assetUrl IS NOT NULL AND assetUrl<>'' AND (
         (active=1 AND deleted=0 AND category IN ('card_frame','card_background'))
         OR id IN (
           SELECT f.frameId FROM avatar_card_frames f
           JOIN avatar_collection ac ON ac.id=f.cardId
           WHERE ac.studentId=?
         )
         OR id IN (
           SELECT b.backgroundId FROM avatar_card_backgrounds b
           JOIN avatar_collection ac ON ac.id=b.cardId
           WHERE ac.studentId=?
         )
       )`,
      [studentId, studentId]
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
      cardStyles: Object.fromEntries(
        styles.map(x => [
          x.cardId,
          { frame: x.frameId, background: x.backgroundId },
        ])
      ),
      cardFrames: cardFrames.reduce<Record<string, string[]>>(
        (all, x) => ((all[x.cardId] ??= []).push(x.frameId), all),
        {}
      ),
      cardBackgrounds: cardBackgrounds.reduce<Record<string, string[]>>(
        (all, x) => ((all[x.cardId] ??= []).push(x.backgroundId), all),
        {}
      ),
      decorationAssets: {
        frames: Object.fromEntries(
          decorationAssets
            .filter(x => x.category === "card_frame")
            .map(x => [x.id, x.assetUrl])
        ),
        backgrounds: Object.fromEntries(
          decorationAssets
            .filter(x => x.category === "card_background")
            .map(x => [x.id, x.assetUrl])
        ),
      },
    };
  });
}
export async function purchaseFrame(
  studentId: number,
  cardId: string,
  id: FrameId
) {
  return transaction(studentId, async (c, a) => {
    const [f] = await rows<{ name: string; price: number }>(
      c,
      "SELECT name,price FROM avatar_shop_items WHERE id=? AND category='card_frame' AND active=1 AND deleted=0",
      [frameId.parse(id)]
    );
    if (!f) reject("판매 중인 프레임을 찾을 수 없어요.");
    if (
      !(
        await rows(
          c,
          "SELECT id FROM avatar_collection WHERE id=? AND studentId=?",
          [cardId, studentId]
        )
      ).length
    )
      reject("내 카드를 선택해 주세요.");
    if (Number(f.price) === 0) return;
    const owned = await rows(
      c,
      "SELECT frameId FROM avatar_card_frames WHERE cardId=? AND frameId=?",
      [cardId, id]
    );
    if (owned.length) return; // Retry-safe: never charge an owned frame twice.
    if (a.balance < Number(f.price)) reject("사용 가능 포인트가 부족해요.");
    await c.query(
      "INSERT INTO avatar_card_frames(cardId,frameId) VALUES(?,?)",
      [cardId, id]
    );
    a.balance -= Number(f.price);
    await ledger(c, studentId, -Number(f.price), "프레임 구매 · " + f.name);
  });
}
export async function equipFrame(
  studentId: number,
  cardId: string,
  id: FrameId
) {
  frameId.parse(id);
  return transaction(studentId, async c => {
    if (
      id !== "lunar" &&
      !(
        await rows(
          c,
          "SELECT frameId FROM avatar_card_frames WHERE cardId=? AND frameId=?",
          [cardId, id]
        )
      ).length
    )
      reject("보유한 프레임만 장착할 수 있어요.");
    await c.query(
      "INSERT INTO avatar_card_style(cardId,frameId) VALUES(?,?) ON DUPLICATE KEY UPDATE frameId=VALUES(frameId)",
      [cardId, id]
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
      "INSERT INTO avatar_sharing(cardId,visible,showName,showGrade,cropX,cropY,cropZoom) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE visible=VALUES(visible),showName=VALUES(showName),showGrade=VALUES(showGrade),cropX=VALUES(cropX),cropY=VALUES(cropY),cropZoom=VALUES(cropZoom)",
      [
        v.cardId,
        v.visible,
        v.visible && v.showName,
        v.visible && v.showGrade,
        v.cropX,
        v.cropY,
        v.cropZoom,
      ]
    );
  });
}
export async function setGalleryCropAdmin(
  cardId: string,
  cropX: number,
  cropY: number,
  cropZoom: number
) {
  await ensureRewardSchema();
  if (
    ![cropX, cropY].every(v => Number.isInteger(v) && v >= 0 && v <= 100) ||
    !Number.isInteger(cropZoom) ||
    cropZoom < 100 ||
    cropZoom > 500
  )
    reject("광장 프로필 위치와 확대 비율을 확인해 주세요.");
  const [result] = await database().query<ResultSetHeader>(
    "INSERT INTO avatar_sharing(cardId,cropX,cropY,cropZoom) SELECT id,?,?,? FROM avatar_collection WHERE id=? ON DUPLICATE KEY UPDATE cropX=VALUES(cropX),cropY=VALUES(cropY),cropZoom=VALUES(cropZoom)",
    [cropX, cropY, cropZoom, cardId]
  );
  if (!result.affectedRows) reject("컬렉션 카드를 찾을 수 없습니다.");
}
export async function gallery(
  studentId: number,
  page: number = 0
): Promise<GalleryCard[]> {
  await ensureRewardSchema();
  const [result] = await database().query<RowDataPacket[]>(
    `
 SELECT ac.id,ac.url,ac.mode,COALESCE(cs.frameId,'lunar') AS frame,COALESCE(cs.backgroundId,'classic') AS background,
 sh.cropX,sh.cropY,sh.cropZoom,
 CASE WHEN sh.showName=1 THEN s.name ELSE '박00' END AS name,
 CASE WHEN sh.showGrade=1 THEN s.grade ELSE '중0학년' END AS grade,
 (SELECT COUNT(*) FROM avatar_likes l WHERE l.cardId=ac.id) AS likes,
 EXISTS(SELECT 1 FROM avatar_likes l WHERE l.cardId=ac.id AND l.studentId=?) AS liked,
 (ac.studentId=?) AS mine
 FROM avatar_collection ac JOIN avatar_sharing sh ON sh.cardId=ac.id AND sh.visible=1
 JOIN students s ON s.id=ac.studentId AND s.active=1
 LEFT JOIN avatar_card_style cs ON cs.cardId=ac.id
 ORDER BY sh.updatedAt DESC,ac.id DESC LIMIT ? OFFSET ?`,
    [studentId, studentId, galleryPageSize, page * galleryPageSize]
  );
  const cards = result.map(x => ({
    ...x,
    likes: Number(x.likes),
    liked: !!x.liked,
    mine: !!x.mine,
  })) as GalleryCard[];
  if (page === 0) {
    const official = await officialCharacters(true);
    cards.unshift(
      ...official.map(character => ({
        id: character.id,
        url: character.url,
        mode: "official",
        frame: "lunar" as const,
        background: "classic" as const,
        name: character.name,
        grade: "해밀 공식",
        cropX: character.cropX,
        cropY: character.cropY,
        cropZoom: character.cropZoom,
        likes: 0,
        liked: false,
        mine: false,
        official: true,
      }))
    );
  }
  return cards;
}

export async function officialCharacters(visibleOnly = false) {
  await ensureRewardSchema();
  const where = visibleOnly ? " WHERE visible=1" : "";
  const [result] = await database().query<RowDataPacket[]>(
    `SELECT id,name,url,visible,cropX,cropY,cropZoom,createdAt,updatedAt FROM official_avatar_characters${where} ORDER BY updatedAt DESC,id DESC`
  );
  return result.map(row => ({
    ...row,
    visible: !!row.visible,
  })) as OfficialCharacter[];
}

export async function createOfficialCharacter(
  input: OfficialCharacterInput,
  url: string
) {
  await ensureRewardSchema();
  const id = randomUUID();
  await database().query(
    "INSERT INTO official_avatar_characters(id,name,url,visible,cropX,cropY,cropZoom) VALUES(?,?,?,?,?,?,?)",
    [
      id,
      input.name,
      url,
      input.visible,
      input.cropX,
      input.cropY,
      input.cropZoom,
    ]
  );
  return { id };
}

export async function updateOfficialCharacter(
  id: string,
  input: OfficialCharacterInput,
  url?: string
) {
  await ensureRewardSchema();
  const [result] = await database().query<ResultSetHeader>(
    `UPDATE official_avatar_characters SET name=?,visible=?,cropX=?,cropY=?,cropZoom=?${url ? ",url=?" : ""} WHERE id=?`,
    url
      ? [
          input.name,
          input.visible,
          input.cropX,
          input.cropY,
          input.cropZoom,
          url,
          id,
        ]
      : [
          input.name,
          input.visible,
          input.cropX,
          input.cropY,
          input.cropZoom,
          id,
        ]
  );
  if (!result.affectedRows) reject("공식 캐릭터를 찾을 수 없습니다.");
}

export async function deleteOfficialCharacter(id: string) {
  await ensureRewardSchema();
  const [result] = await database().query<ResultSetHeader>(
    "DELETE FROM official_avatar_characters WHERE id=?",
    [id]
  );
  if (!result.affectedRows) reject("공식 캐릭터를 찾을 수 없습니다.");
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
export async function purchaseBackground(
  studentId: number,
  cardId: string,
  id: BackgroundId
) {
  return transaction(studentId, async (c, a) => {
    const [item] = await rows<{ name: string; price: number }>(
      c,
      "SELECT name,price FROM avatar_shop_items WHERE id=? AND category='card_background' AND active=1 AND deleted=0",
      [backgroundId.parse(id)]
    );
    if (!item) reject("판매 중인 배경을 찾을 수 없어요.");
    if (
      !(
        await rows(
          c,
          "SELECT id FROM avatar_collection WHERE id=? AND studentId=?",
          [cardId, studentId]
        )
      ).length
    )
      reject("내 카드를 선택해 주세요.");
    if (
      !Number(item.price) ||
      (
        await rows(
          c,
          "SELECT backgroundId FROM avatar_card_backgrounds WHERE cardId=? AND backgroundId=?",
          [cardId, id]
        )
      ).length
    )
      return;
    if (a.balance < Number(item.price)) reject("사용 가능 포인트가 부족해요.");
    await c.query(
      "INSERT INTO avatar_card_backgrounds(cardId,backgroundId) VALUES(?,?)",
      [cardId, id]
    );
    a.balance -= Number(item.price);
    await ledger(c, studentId, -Number(item.price), "배경 구매 · " + item.name);
  });
}
export async function equipBackground(
  studentId: number,
  cardId: string,
  id: BackgroundId
) {
  backgroundId.parse(id);
  return transaction(studentId, async c => {
    if (
      id !== "classic" &&
      !(
        await rows(
          c,
          "SELECT backgroundId FROM avatar_card_backgrounds WHERE cardId=? AND backgroundId=?",
          [cardId, id]
        )
      ).length
    )
      reject("보유한 배경만 장착할 수 있어요.");
    await c.query(
      "INSERT INTO avatar_card_style(cardId,backgroundId) VALUES(?,?) ON DUPLICATE KEY UPDATE backgroundId=VALUES(backgroundId)",
      [cardId, id]
    );
  });
}
