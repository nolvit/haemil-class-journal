import { describe, expect, it } from "vitest";
import { attendancePushPayload, totalCountPushPayload } from "./pushNotifications";

describe("parent push notification copy", () => {
  it("uses the payment confirmation message when total count increases", () => {
    const payload = totalCountPushPayload("token12345", "김해밀", 108, 120);
    expect(payload.title).toBe("원비 납부를 확인했습니다");
    expect(payload.body).toContain("108회에서 120회");
    expect(payload.body).toContain("믿고 맡겨주셔서 감사드립니다");
    expect(payload.url).toBe("/p/token12345");
  });

  it("uses a neutral message when total count decreases", () => {
    const payload = totalCountPushPayload("token12345", "김해밀", 120, 118);
    expect(payload.title).toBe("총 수업 횟수가 변경되었습니다");
    expect(payload.body).not.toContain("원비 납부");
  });

  it("labels check-in and check-out separately", () => {
    const time = new Date("2026-09-01T09:00:00.000Z");
    expect(attendancePushPayload("token12345", "김해밀", "check_in", time).title).toContain("등원");
    expect(attendancePushPayload("token12345", "김해밀", "check_out", time).title).toContain("하원");
  });
});
