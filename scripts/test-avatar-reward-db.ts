import mysql from "mysql2/promise";
import assert from "node:assert/strict";
import * as store from "../server/avatarRewardStore";
const original = process.env.DATABASE_URL!;
const databaseName = `reward_qa_${Date.now()}`;
assert.match(databaseName, /^reward_qa_\d+$/);
const control = await mysql.createConnection(original);
const url = new URL(original);
url.pathname = "/" + databaseName;
let passed = 0;
try {
  const [tables] = await control.query<any[]>("SHOW TABLES");
  console.log(
    "Legacy room tables:",
    tables
      .map(r => Object.values(r)[0])
      .filter(n => /room|world|furniture/i.test(String(n)))
  );
  await control.query(`CREATE DATABASE \`${databaseName}\``);
  process.env.DATABASE_URL = url.href;
  const c = await mysql.createConnection(url.href);
  await c.query(
    "CREATE TABLE students(id INT PRIMARY KEY,active BOOLEAN NOT NULL,name VARCHAR(80),grade VARCHAR(80))"
  );
  await c.query(
    "CREATE TABLE attendance_records(studentId INT,journalDate DATE,status VARCHAR(30),arrivalTime VARCHAR(32),departureTime VARCHAR(32),PRIMARY KEY(studentId,journalDate))"
  );
  await c.query(
    "INSERT INTO students VALUES(1,1,'QA','test'),(2,1,'QA2','test')"
  );
  await store.ensureRewardSchema();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  await c.query(
    "INSERT INTO attendance_records VALUES(1,?,'present','14:00','17:00')",
    [today]
  );
  let s = await store.rewardSnapshot(1);
  assert.equal(s.account.balance, 150);
  passed++;
  await Promise.all(Array.from({ length: 6 }, () => store.rewardSnapshot(1)));
  s = await store.rewardSnapshot(1);
  assert.equal(s.ledger.length, 1);
  assert.equal(s.account.balance, 150);
  passed++;
  await c.query(
    "UPDATE attendance_records SET departureTime=NULL WHERE studentId=1"
  );
  s = await store.rewardSnapshot(1);
  assert.equal(s.account.balance, 0);
  assert.equal(s.ledger[0].delta, -150);
  passed++;
  await c.query(
    "UPDATE attendance_records SET departureTime='16:00' WHERE studentId=1"
  );
  s = await store.rewardSnapshot(1);
  assert.equal(s.account.balance, 120);
  passed++;
  await store.setRewardMaster(
    1,
    "/avatar-rewards/avatars/official/official_male_avatar.png"
  );
  // Synthetic credit belongs only to the isolated QA database.
  await c.query(
    "UPDATE reward_accounts SET balance=1000,lifetime=1000 WHERE studentId=1"
  );
  const input = {
    top: "후드티",
    bottom: "청바지",
    shoes: "운동화",
    hair: "쉼표머리",
    background: "도시 옥상",
    accessories: [],
    mode: "original" as const,
  };
  const parallel = await Promise.allSettled([
    store.submitRewardOrder(1, input),
    store.submitRewardOrder(1, input),
  ]);
  assert.equal(parallel.filter(x => x.status === "fulfilled").length, 1);
  s = await store.rewardSnapshot(1);
  assert.equal(s.account.balance, 500);
  passed++;
  const o = s.orders[0];
  await assert.rejects(() => store.cancelRewardOrder(2, o.id));
  passed++;
  await Promise.all([
    store.cancelRewardOrder(1, o.id),
    store.cancelRewardOrder(1, o.id),
  ]);
  s = await store.rewardSnapshot(1);
  assert.equal(s.account.balance, 1000);
  assert.equal(s.account.completedOrders, 0);
  passed++;
  const next = await store.submitRewardOrder(1, input);
  await store.publishRewardCandidates(1, next.id, [
    "/candidate-a.png",
    "/candidate-b.png",
  ]);
  s = await store.rewardSnapshot(1);
  const ready = s.orders.find(x => x.id === next.id)!;
  await assert.rejects(() =>
    store.selectRewardCandidate(1, next.id, "missing")
  );
  passed++;
  const selected = await Promise.allSettled(
    ready.candidates.map(x => store.selectRewardCandidate(1, next.id, x.id))
  );
  assert.equal(selected.filter(x => x.status === "fulfilled").length, 1);
  s = await store.rewardSnapshot(1);
  assert.equal(s.cards.length, 1);
  assert.equal(s.account.completedOrders, 1);
  assert.equal(s.nextPrice, 1000);
  passed++;
  await assert.rejects(() => store.cancelRewardOrder(1, next.id));
  passed++;
  await assert.rejects(() =>
    store.setRewardRepresentative(2, s.cards[0].id, 20)
  );
  await store.setRewardRepresentative(1, s.cards[0].id, 20);
  s = await store.rewardSnapshot(1);
  assert.equal(s.account.cropY, 20);
  assert.equal(s.account.representativeId, s.cards[0].id);
  passed++;
  await assert.rejects(() => store.submitRewardOrder(1, input));
  passed++;
  await c.end();
  console.log(`PASS ${passed} real MySQL integration scenarios`);
} finally {
  await control.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  await control.end();
  console.log("Isolated QA database removed");
}
process.exit(0);
