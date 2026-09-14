import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listRemainingTwoNotificationCandidates,
  markRemainingTwoNotificationAttempt,
} from "./db";
import { sendAdminPush, sendStudentPush } from "./pushNotifications";
import {
  dispatchRemainingTwoNotifications,
  koreaDateAndHour,
  remainingTwoAdminConfirmationPayload,
} from "./remainingCountNotifications";

vi.mock("./db", () => ({
  listRemainingTwoNotificationCandidates: vi.fn(),
  markRemainingTwoNotificationAttempt: vi.fn(),
}));
vi.mock("./pushNotifications", () => ({
  remainingTwoCountPushPayload: vi.fn(() => ({
    title: "수업 횟수 안내",
    body: "안내",
    url: "/p/token",
    tag: "remaining-two",
  })),
  sendStudentPush: vi.fn(),
  sendAdminPush: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("remaining count notification schedule", () => {
  it("recognizes 7 PM in Korea", () => {
    expect(koreaDateAndHour(new Date("2026-09-02T10:00:00.000Z"))).toEqual({
      date: "2026-09-02",
      hour: 19,
    });
  });

  it("does not treat 6:59 PM as the delivery hour", () => {
    expect(
      koreaDateAndHour(new Date("2026-09-02T09:59:00.000Z")).hour
    ).toBe(18);
  });

  it("reports zero receiving parent devices to the administrator", () => {
    const payload = remainingTwoAdminConfirmationPayload({
      studentName: "김해밀",
      sentCount: 0,
      paymentMethod: "계좌이체",
    });
    expect(payload.body).toBe(
      "김해밀학생. 수신 기기 0대. 결제방식 계좌이체. 원비 납부 알림 정상 발송."
    );
    expect(payload.url).toBe("/students");
  });

  it("sends the administrator a confirmation even when zero devices receive it", async () => {
    vi.mocked(listRemainingTwoNotificationCandidates).mockResolvedValue([
      {
        id: 7,
        name: "김해밀",
        publicToken: "token12345",
        totalCount: 120,
        paymentMethod: "계좌이체",
      },
    ]);
    vi.mocked(markRemainingTwoNotificationAttempt).mockResolvedValue(undefined);
    vi.mocked(sendStudentPush).mockResolvedValue({
      targetCount: 0,
      sent: 0,
      failed: 0,
      unavailable: false,
    });
    vi.mocked(sendAdminPush).mockResolvedValue({
      targetCount: 1,
      sent: 1,
      failed: 0,
      unavailable: false,
    });

    await dispatchRemainingTwoNotifications(
      new Date("2026-09-02T10:00:00.000Z")
    );

    expect(sendAdminPush).toHaveBeenCalledOnce();
    expect(sendAdminPush).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "김해밀학생. 수신 기기 0대. 결제방식 계좌이체. 원비 납부 알림 정상 발송.",
      })
    );
  });
});
