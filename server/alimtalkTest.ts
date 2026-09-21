import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { buildTuitionNotificationLine } from "../shared/tuitionNotificationRules";
import { getMonthlySessionCount } from "../shared/tuitionRules";
import { getSolapiConfig, isSolapiConfigured, normalizeSolapiPhone, remainingOneAlimtalkMessage, paymentConfirmedAlimtalkMessage, sendSolapiAlimtalk } from "./solapiAlimtalk";

export async function previewAlimtalkTest() {
  const student = await db.getAlimtalkTestStudent();
  const phone = normalizeSolapiPhone(student.parentPhone ?? "");
  const config = getSolapiConfig();
  const before = Number(student.totalCount);
  const after = before + getMonthlySessionCount(Number(student.registrationCount));
  const tuitionMessage = buildTuitionNotificationLine({ ...student, registrationCount: Number(student.registrationCount), tuition: Number(student.tuition) });
  const messages = {
    remaining_one: remainingOneAlimtalkMessage({ config, to: phone, studentName: student.name, paymentMethod: (student.paymentMethod ?? "미등록"), tuitionMessage }),
    payment_confirmed: paymentConfirmedAlimtalkMessage({ config, to: phone, studentName: student.name, before, after }),
  };
  // A stale preview must never silently send to a changed guardian number.
  const revision = createHash("sha256").update(JSON.stringify({ id: student.id, messages })).digest("hex");
  return { studentId: student.id, studentName: student.name, phone, before, after, tuitionMessage, paymentMethod: (student.paymentMethod ?? "미등록"), revision,
    ready: isSolapiConfigured(config) && /^01\d{8,9}$/.test(phone) && after > before,
    variables: { remaining_one: messages.remaining_one.kakaoOptions.variables, payment_confirmed: messages.payment_confirmed.kakaoOptions.variables },
  };
}

export async function sendAlimtalkTest(input: { type: db.KakaoNotificationType; revision: string; requestId: string }, adminId: number) {
  const preview = await previewAlimtalkTest();
  if (!preview.ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "솔라피 설정·보호자 전화번호·등록 횟수를 확인해 주세요." });
  if (preview.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "학생 정보가 변경됐습니다. 새로고침 후 수신번호를 다시 확인해 주세요." });
  const config = getSolapiConfig();
  const message = input.type === "remaining_one"
    ? remainingOneAlimtalkMessage({ config, to: preview.phone, studentName: preview.studentName, paymentMethod: preview.paymentMethod, tuitionMessage: preview.tuitionMessage })
    : paymentConfirmedAlimtalkMessage({ config, to: preview.phone, studentName: preview.studentName, before: preview.before, after: preview.after });
  const id = await db.reserveKakaoNotificationDelivery({ studentId: preview.studentId, notificationType: input.type, dedupeKey: `test:${adminId}:${input.requestId}` });
  if (!id) throw new TRPCError({ code: "CONFLICT", message: "이미 접수한 시험 발송 요청입니다. 솔라피 발송 내역을 확인해 주세요." });
  try {
    const result = await sendSolapiAlimtalk(config, message);
    await db.completeKakaoNotificationDelivery({ id, status: "sent", providerMessageId: result.providerMessageId });
    return result;
  } catch {
    await db.completeKakaoNotificationDelivery({ id, status: "failed", errorMessage: "시험 발송 실패 또는 접수 확인 불가. 솔라피 발송 내역 확인 필요." });
    throw new TRPCError({ code: "BAD_GATEWAY", message: "발송 접수를 확인하지 못했습니다. 템플릿 승인·서버 설정과 솔라피 발송 내역을 확인해 주세요." });
  }
}
