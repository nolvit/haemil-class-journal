import { createHmac, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";
import * as academyDb from "./db";
import { withEuroRo } from "../shared/koreanParticles";

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";

export type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
  pfId: string;
  remainingOneTemplateId: string;
  paymentConfirmedTemplateId: string;
};

export type SolapiMessage = {
  to: string;
  from: string;
  text: string;
  kakaoOptions: {
    pfId: string;
    templateId: string;
    variables: Record<string, string>;
  };
};

export function getSolapiConfig(): SolapiConfig {
  return {
    apiKey: ENV.solapiApiKey,
    apiSecret: ENV.solapiApiSecret,
    senderNumber: ENV.solapiSenderNumber,
    pfId: ENV.solapiKakaoPfId,
    remainingOneTemplateId: ENV.solapiRemainingOneTemplateId,
    paymentConfirmedTemplateId: ENV.solapiPaymentConfirmedTemplateId,
  };
}

export function isSolapiConfigured(config: SolapiConfig) {
  return Object.values(config).every(value => value.trim().length > 0);
}

export function normalizeSolapiPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
}

export function buildSolapiAuthorization(input: {
  apiKey: string;
  apiSecret: string;
  date: string;
  salt: string;
}) {
  const signature = createHmac("sha256", input.apiSecret)
    .update(input.date + input.salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${input.apiKey}, date=${input.date}, salt=${input.salt}, signature=${signature}`;
}

export function remainingOneAlimtalkMessage(input: {
  config: SolapiConfig;
  to: string;
  studentName: string;
  paymentMethod: string;
  tuitionMessage: string;
}): SolapiMessage {
  const { studentName, paymentMethod, tuitionMessage, config } = input;
  const paymentMethodWithParticle = withEuroRo(paymentMethod);
  return {
    to: normalizeSolapiPhone(input.to),
    from: normalizeSolapiPhone(config.senderNumber),
    text: `원비 납부 안내\n\n${studentName} 학생의 남은 수업이 1회입니다.\n${tuitionMessage}\n원비 납부 방법은 ${paymentMethodWithParticle} 등록되어 있습니다.\n다음 수업 등록을 부탁드립니다.`,
    kakaoOptions: {
      pfId: config.pfId,
      templateId: config.remainingOneTemplateId,
      variables: {
        "#{학생명}": studentName,
        "#{원비안내}": tuitionMessage,
        "#{결제방법}": paymentMethodWithParticle,
      },
    },
  };
}

export function paymentConfirmedAlimtalkMessage(input: {
  config: SolapiConfig;
  to: string;
  studentName: string;
  before: number;
  after: number;
}): SolapiMessage {
  const { studentName, before, after, config } = input;
  return {
    to: normalizeSolapiPhone(input.to),
    from: normalizeSolapiPhone(config.senderNumber),
    text: `원비 납부를 확인했습니다\n\n${studentName} 학생의 총 수업 횟수가 ${before}회에서 ${after}회로 변경되었습니다.\n소중한 자녀 믿고 맡겨주셔서 감사드립니다.`,
    kakaoOptions: {
      pfId: config.pfId,
      templateId: config.paymentConfirmedTemplateId,
      variables: {
        "#{학생명}": studentName,
        "#{변경전횟수}": String(before),
        "#{변경후횟수}": String(after),
      },
    },
  };
}

export async function sendSolapiAlimtalk(
  config: SolapiConfig,
  message: SolapiMessage,
  options: {
    fetchImpl?: typeof fetch;
    now?: Date;
    salt?: string;
  } = {}
) {
  const date = (options.now ?? new Date()).toISOString();
  const salt = options.salt ?? randomBytes(16).toString("hex");
  const response = await (options.fetchImpl ?? fetch)(SOLAPI_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildSolapiAuthorization({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        date,
        salt,
      }),
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    any
  >;
  if (!response.ok) {
    const error = new Error(
      String(result.errorMessage || result.message || `HTTP ${response.status}`)
    );
    (error as any).providerResponse = result;
    throw error;
  }
  return {
    providerMessageId: String(
      result.messageId ||
        result.groupId ||
        result.groupInfo?.groupId ||
        result.messageList?.[0]?.messageId ||
        ""
    ),
  };
}

async function deliverOnce(input: {
  studentId: number;
  notificationType: academyDb.KakaoNotificationType;
  dedupeKey: string;
  phone: string | null;
  buildMessage: (config: SolapiConfig) => SolapiMessage;
}) {
  const config = getSolapiConfig();
  if (!isSolapiConfigured(config)) return { status: "disabled" as const };

  const deliveryId = await academyDb.reserveKakaoNotificationDelivery({
    studentId: input.studentId,
    notificationType: input.notificationType,
    dedupeKey: input.dedupeKey,
  });
  if (!deliveryId) return { status: "duplicate" as const };

  const phone = normalizeSolapiPhone(input.phone ?? "");
  if (!/^01\d{8,9}$/.test(phone)) {
    await academyDb.completeKakaoNotificationDelivery({
      id: deliveryId,
      status: "unavailable",
      errorMessage: "보호자 전화번호가 없거나 형식이 올바르지 않습니다.",
    });
    return { status: "unavailable" as const };
  }

  try {
    const result = await sendSolapiAlimtalk(config, input.buildMessage(config));
    await academyDb.completeKakaoNotificationDelivery({
      id: deliveryId,
      status: "sent",
      providerMessageId: result.providerMessageId,
    });
    return { status: "sent" as const };
  } catch (error) {
    await academyDb.completeKakaoNotificationDelivery({
      id: deliveryId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "알림톡 발송 실패",
    });
    console.error("[Solapi] 알림톡 발송 실패", error);
    return { status: "failed" as const };
  }
}

export function sendRemainingOneAlimtalk(input: {
  studentId: number;
  phone: string | null;
  studentName: string;
  paymentMethod: string;
  tuitionMessage: string;
  totalCount: number;
}) {
  return deliverOnce({
    studentId: input.studentId,
    notificationType: "remaining_one",
    dedupeKey: `total-count:${input.totalCount}`,
    phone: input.phone,
    buildMessage: config =>
      remainingOneAlimtalkMessage({ ...input, config, to: input.phone ?? "" }),
  });
}

export function sendPaymentConfirmedAlimtalk(input: {
  studentId: number;
  phone: string | null;
  studentName: string;
  before: number;
  after: number;
}) {
  return deliverOnce({
    studentId: input.studentId,
    notificationType: "payment_confirmed",
    dedupeKey: `total-count:${input.after}`,
    phone: input.phone,
    buildMessage: config =>
      paymentConfirmedAlimtalkMessage({
        ...input,
        config,
        to: input.phone ?? "",
      }),
  });
}
