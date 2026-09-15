import { beforeEach, describe, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  account: {
    studentId: 1,
    balance: 700,
    lifetime: 700,
    completedOrders: 0,
    masterUrl: "/avatar.png",
    representativeId: null,
    cropX: 50,
    cropY: 0,
  },
  orders: [] as any[],
  ledger: [] as any[],
  backup: null as any,
}));
vi.mock("mysql2/promise", () => {
  const query = async (sql: string, p: any[] = []) => {
    if (
      sql.startsWith("CREATE") ||
      sql.startsWith("ALTER") ||
      sql.startsWith("INSERT IGNORE INTO avatar_card") ||
      sql.startsWith("SET ")
    )
      return [[], []];
    if (sql.includes("information_schema"))
      return [[{ COLUMN_NAME: "present" }], []];
    if (sql.startsWith("SELECT id FROM students")) return [[{ id: 1 }], []];
    if (sql.startsWith("INSERT INTO reward_accounts")) return [[], []];
    if (sql.startsWith("SELECT * FROM reward_accounts"))
      return [[{ ...fake.account }], []];
    if (
      sql.includes("FROM attendance_records") ||
      sql.includes("FROM reward_days")
    )
      return [[], []];
    if (sql.startsWith("SELECT id FROM avatar_orders"))
      return [
        fake.orders.filter(
          o => o.status === "submitted" || o.status === "ready"
        ),
        [],
      ];
    if (sql.startsWith("INSERT INTO avatar_orders")) {
      fake.orders.push({
        id: p[0],
        studentId: p[1],
        source: "student_order",
        status: "submitted",
        refundReason: null,
        price: p[2],
        input: p[3],
      });
      return [[], []];
    }
    if (sql.startsWith("SELECT * FROM avatar_orders"))
      return [
        fake.orders.filter(o => o.id === p[0] && o.studentId === p[1]),
        [],
      ];
    if (sql.startsWith("UPDATE avatar_orders SET status='cancelled'")) {
      const order = fake.orders.find(o => o.id === p[1]);
      order.status = "cancelled";
      order.refundReason = p[0];
      return [[], []];
    }
    if (sql.startsWith("INSERT INTO reward_ledger")) {
      fake.ledger.push({ studentId: p[0], delta: p[1], reason: p[2] });
      return [[], []];
    }
    if (sql.startsWith("INSERT IGNORE INTO avatar_shop_items")) return [[], []];
    if (sql.startsWith("UPDATE reward_accounts")) {
      fake.account.balance = p[0];
      return [[], []];
    }
    throw new Error("Unmocked SQL: " + sql);
  };
  const connection = {
    query,
    beginTransaction: async () => {
      fake.backup = structuredClone({
        account: fake.account,
        orders: fake.orders,
        ledger: fake.ledger,
      });
    },
    commit: async () => {},
    rollback: async () => Object.assign(fake, fake.backup),
    release: () => {},
  };
  return {
    default: {
      createPool: () => ({ query, getConnection: async () => connection }),
    },
  };
});
import {
  submitRewardOrder,
  cancelRewardOrder,
  countsTowardPaidAvatarOrders,
} from "./avatarRewardStore";
const input = {
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  hair: "헤어",
  background: "배경",
  accessories: [],
  pet: "",
  pose: "",
  extra: "",
  mode: "original" as const,
};
beforeEach(() => {
  process.env.DATABASE_URL = "mysql://localhost/synthetic-unit-test";
  fake.account = {
    studentId: 1,
    balance: 700,
    lifetime: 700,
    completedOrders: 0,
    masterUrl: "/avatar.png",
    representativeId: null,
    cropX: 50,
    cropY: 0,
  };
  fake.orders = [];
  fake.ledger = [];
});
describe("server surcharge transaction boundary", () => {
  it("does not raise future prices for an admin gift", () => {
    expect(countsTowardPaidAvatarOrders("admin_gift")).toBe(false);
    expect(countsTowardPaidAvatarOrders("student_order")).toBe(true);
    expect(countsTowardPaidAvatarOrders(undefined)).toBe(true);
  });
  it.each([
    ["original", 50],
    ["wannabe", 150],
    ["superstar", 250],
  ] as const)(
    "charges and refunds the stored %s total",
    async (mode, price) => {
      const order = await submitRewardOrder(1, { ...input, mode });
      expect(fake.orders[0].price).toBe(price);
      expect(fake.ledger[0].delta).toBe(-price);
      expect(fake.account.balance).toBe(700 - price);
      await cancelRewardOrder(1, order.id, "학생 요청");
      expect(fake.account.balance).toBe(700);
      expect(fake.ledger[1].delta).toBe(price);
      expect(fake.ledger[1].reason).toBe("주문 취소 환불 · 학생 요청");
      expect(fake.orders[0].refundReason).toBe("학생 요청");
    }
  );
  it("rejects a base-affordable order whose surcharge exceeds the balance", async () => {
    fake.account.balance = 249;
    await expect(
      submitRewardOrder(1, { ...input, mode: "superstar" })
    ).rejects.toThrow("부족");
    expect(fake.account.balance).toBe(249);
    expect(fake.orders).toHaveLength(0);
    expect(fake.ledger).toHaveLength(0);
  });
  it("refunds an older order at its original price rather than current rates", async () => {
    fake.account.balance = 200;
    fake.orders = [
      { id: "legacy", studentId: 1, status: "submitted", price: 500 },
    ];
    await cancelRewardOrder(1, "legacy", "기존 주문 환불");
    expect(fake.account.balance).toBe(700);
  });
  it("rejects a paid-order refund without a reason", async () => {
    fake.orders = [
      {
        id: "needs-reason",
        studentId: 1,
        source: "student_order",
        status: "submitted",
        price: 50,
      },
    ];
    await expect(cancelRewardOrder(1, "needs-reason", "  ")).rejects.toThrow(
      "환불 사유"
    );
    expect(fake.orders[0].status).toBe("submitted");
    expect(fake.account.balance).toBe(700);
    expect(fake.ledger).toHaveLength(0);
  });
});
