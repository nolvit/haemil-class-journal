import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildSolapiAuthorization,
  paymentConfirmedAlimtalkMessage,
  remainingOneAlimtalkMessage,
  sendSolapiAlimtalk,
  type SolapiConfig,
} from "./solapiAlimtalk";

const config: SolapiConfig = {
  apiKey: "api-key",
  apiSecret: "api-secret",
  senderNumber: "031-123-4567",
  pfId: "PFID",
  remainingOneTemplateId: "TPL-ONE",
  paymentConfirmedTemplateId: "TPL-PAID",
};

describe("Solapi Alimtalk", () => {
  it("builds the documented HMAC authorization value", () => {
    const date = "2026-09-18T10:00:00.000Z";
    const salt = "fixed-salt";
    const signature = createHmac("sha256", config.apiSecret)
      .update(date + salt)
      .digest("hex");
    expect(
      buildSolapiAuthorization({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        date,
        salt,
      })
    ).toBe(
      `HMAC-SHA256 apiKey=api-key, date=${date}, salt=${salt}, signature=${signature}`
    );
  });

  it("includes the registered payment method in the remaining-one template", () => {
    const message = remainingOneAlimtalkMessage({
      config,
      to: "010-1234-5678",
      studentName: "김해밀",
      paymentMethod: "계좌이체",
      tuitionMessage: "원비는 중등부 2과목 20회 기준 36만원입니다.",
    });
    expect(message.text).toContain(
      "원비 납부 방법은 계좌이체로 등록되어 있습니다."
    );
    expect(message.kakaoOptions.variables).toEqual({
      "#{학생명}": "김해밀",
      "#{원비안내}": "원비는 중등부 2과목 20회 기준 36만원입니다.",
      "#{결제방법}": "계좌이체로",
    });
  });

  it("builds the payment confirmation title and count variables", () => {
    const message = paymentConfirmedAlimtalkMessage({
      config,
      to: "01012345678",
      studentName: "김해밀",
      before: 100,
      after: 120,
    });
    expect(message.text).toMatch(/^원비 납부를 확인했습니다/);
    expect(message.kakaoOptions.variables).toMatchObject({
      "#{변경전횟수}": "100",
      "#{변경후횟수}": "120",
    });
  });

  it("sends one Alimtalk message with HMAC authentication", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ groupId: "group-1" }), { status: 200 })
    );
    const message = paymentConfirmedAlimtalkMessage({
      config,
      to: "01012345678",
      studentName: "김해밀",
      before: 100,
      after: 120,
    });
    const result = await sendSolapiAlimtalk(config, message, {
      fetchImpl: fetchImpl as typeof fetch,
      now: new Date("2026-09-18T10:00:00.000Z"),
      salt: "fixed-salt",
    });
    expect(result.providerMessageId).toBe("group-1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, request] = fetchImpl.mock.calls[0];
    expect(request?.headers).toMatchObject({
      Authorization: expect.stringContaining("HMAC-SHA256 apiKey=api-key"),
    });
    expect(JSON.parse(String(request?.body))).toEqual({ message });
  });
});
