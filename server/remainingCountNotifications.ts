import {
  listRemainingTwoNotificationCandidates,
  markRemainingTwoNotificationAttempt,
} from "./db";
import {
  remainingTwoCountPushPayload,
  sendAdminPush,
  sendStudentPush,
} from "./pushNotifications";

let dispatchRunning = false;

export function remainingTwoAdminConfirmationPayload(input: {
  studentName: string;
  sentCount: number;
  paymentMethod: string;
}) {
  return {
    title: "원비 납부 알림 발송 결과",
    body: `${input.studentName}학생. 수신 기기 ${input.sentCount}대. 결제방식 ${input.paymentMethod}. 원비 납부 알림 정상 발송.`,
    url: "/students",
    tag: `remaining-two-admin-${input.studentName}-${Date.now()}`,
  };
}

export function koreaDateAndHour(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day" | "hour") =>
    parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

export async function dispatchRemainingTwoNotifications(now = new Date()) {
  const korea = koreaDateAndHour(now);
  if (korea.hour !== 19 || dispatchRunning)
    return { checked: false, attempted: 0, sent: 0 };

  dispatchRunning = true;
  let attempted = 0;
  let sent = 0;
  try {
    const candidates = await listRemainingTwoNotificationCandidates(korea.date);
    for (const student of candidates) {
      await markRemainingTwoNotificationAttempt(
        student.id,
        student.totalCount,
        now
      );
      attempted += 1;
      let result = {
        targetCount: 0,
        sent: 0,
        failed: 0,
        unavailable: false,
      };
      try {
        result = await sendStudentPush(
          student.id,
          remainingTwoCountPushPayload(
            student.publicToken,
            student.name,
            student.totalCount
          ),
          { type: "remaining_two", eventDate: korea.date }
        );
      } catch (error) {
        console.error("잔여 2회 보호자 알림 발송 실패", error);
      }
      sent += result.sent;
      try {
        await sendAdminPush(
          remainingTwoAdminConfirmationPayload({
            studentName: student.name,
            sentCount: result.sent,
            paymentMethod: student.paymentMethod,
          })
        );
      } catch (error) {
        console.error("잔여 2회 관리자 확인 알림 발송 실패", error);
      }
    }
    return { checked: true, attempted, sent };
  } finally {
    dispatchRunning = false;
  }
}
