import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getAlimtalkTestStudent: vi.fn(), reserveKakaoNotificationDelivery: vi.fn(), completeKakaoNotificationDelivery: vi.fn() }));
vi.mock("./solapiAlimtalk", async importOriginal => ({ ...await importOriginal<typeof import("./solapiAlimtalk")>(), getSolapiConfig: () => ({ apiKey: "key", apiSecret: "secret", senderNumber: "0311234567", pfId: "pf", remainingOneTemplateId: "one", paymentConfirmedTemplateId: "paid" }), sendSolapiAlimtalk: vi.fn() }));
import * as db from "./db";
import { sendSolapiAlimtalk } from "./solapiAlimtalk";
import { previewAlimtalkTest, sendAlimtalkTest } from "./alimtalkTest";
import { academyRouter } from "./routers/academy";
const student = { id: 7, name: "박서율", parentPhone: "01012345678", totalCount: 100, registrationCount: 4, grade: "초3", tuition: 200000, subjectCount: 5, paymentMethod: "계좌이체" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getAlimtalkTestStudent).mockResolvedValue(student as any);
  vi.mocked(db.reserveKakaoNotificationDelivery).mockResolvedValue(9);
  vi.mocked(sendSolapiAlimtalk).mockResolvedValue({ providerMessageId: "test-message" });
});
describe("admin Alimtalk test", () => {
  it("previews actual variables without sending or reserving a delivery", async () => {
    const preview = await previewAlimtalkTest();
    expect(preview.variables.remaining_one).toEqual({ "#{학생명}": "박서율", "#{원비안내}": "원비는 초등부 16회 기준 20만원입니다.", "#{결제방법}": "계좌이체로" });
    expect(preview.variables.payment_confirmed["#{변경후횟수}"]).toBe("116");
    expect(sendSolapiAlimtalk).not.toHaveBeenCalled();
    expect(db.reserveKakaoNotificationDelivery).not.toHaveBeenCalled();
  });
  it.each(["remaining_one", "payment_confirmed"] as const)("sends %s with isolated test deduplication", async type => {
    const { revision } = await previewAlimtalkTest();
    await sendAlimtalkTest({ type, revision, requestId: "request-1" }, 1);
    expect(db.reserveKakaoNotificationDelivery).toHaveBeenCalledWith({ studentId: 7, notificationType: type, dedupeKey: "test:1:request-1" });
    expect(sendSolapiAlimtalk).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ to: student.parentPhone, kakaoOptions: expect.objectContaining({ templateId: type === "remaining_one" ? "one" : "paid" }) }));
  });
  it("rejects changed recipients before reserving or sending", async () => {
    const { revision } = await previewAlimtalkTest();
    vi.mocked(db.getAlimtalkTestStudent).mockResolvedValue({ ...student, parentPhone: "01099999999" } as any);
    await expect(sendAlimtalkTest({ type: "remaining_one", revision, requestId: "r" }, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sendSolapiAlimtalk).not.toHaveBeenCalled();
  });
  it("does not resend duplicate requests", async () => {
    const { revision } = await previewAlimtalkTest();
    vi.mocked(db.reserveKakaoNotificationDelivery).mockResolvedValue(null);
    await expect(sendAlimtalkTest({ type: "remaining_one", revision, requestId: "r" }, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sendSolapiAlimtalk).not.toHaveBeenCalled();
  });
  it("records provider failure without reporting success", async () => {
    const { revision } = await previewAlimtalkTest();
    vi.mocked(sendSolapiAlimtalk).mockRejectedValue(new Error("provider rejected"));
    await expect(sendAlimtalkTest({ type: "remaining_one", revision, requestId: "r" }, 1)).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(db.completeKakaoNotificationDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
  it.each([null, { id: 2, role: "user" }])("blocks non-admin callers", async user => {
    const caller = academyRouter.createCaller({ user, req: {}, res: {} } as any);
    await expect(caller.alimtalkTest.preview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.alimtalkTest.send({ type: "remaining_one", revision: "a".repeat(64), requestId: "ecf6f3de-57c9-4f37-bf4c-3e024f4305ac" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sendSolapiAlimtalk).not.toHaveBeenCalled();
  });
});
