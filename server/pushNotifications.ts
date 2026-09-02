import webPush from "web-push";
import * as academyDb from "./db";
import { ENV } from "./_core/env";

export type ParentPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) return false;
  webPush.setVapidDetails(
    ENV.vapidSubject,
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
  configured = true;
  return true;
}

export function getVapidPublicKey() {
  return ENV.vapidPublicKey;
}

export async function sendStudentPush(
  studentId: number,
  payload: ParentPushPayload,
  context: {
    type: academyDb.NotificationDeliveryType;
    eventDate?: string;
  }
) {
  const recordResult = async (result: {
    targetCount: number;
    sent: number;
    failed: number;
    unavailable: boolean;
  }) => {
    try {
      await academyDb.createNotificationDeliveryLog({
        studentId,
        notificationType: context.type,
        title: payload.title,
        body: payload.body,
        eventDate: context.eventDate,
        targetCount: result.targetCount,
        sentCount: result.sent,
        failedCount: result.failed,
        unavailable: result.unavailable,
      });
    } catch (error) {
      console.error("[Push] failed to save delivery log", error);
    }
    return result;
  };
  if (!ensureConfigured())
    return recordResult({
      targetCount: 0,
      sent: 0,
      failed: 0,
      unavailable: true,
    });
  const subscriptions = await academyDb.listParentPushSubscriptions(studentId);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async subscription => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (error: any) {
        failed += 1;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await academyDb.deleteParentPushSubscription(subscription.id);
          return;
        }
        console.error("[Push] delivery failed", error?.statusCode ?? error);
      }
    })
  );
  return recordResult({
    targetCount: subscriptions.length,
    sent,
    failed,
    unavailable: false,
  });
}

export function totalCountPushPayload(
  token: string,
  studentName: string,
  before: number,
  after: number
): ParentPushPayload {
  const increased = after > before;
  return {
    title: increased
      ? "원비 납부를 확인했습니다"
      : "총 수업 횟수가 변경되었습니다",
    body: `${studentName} 학생의 총 수업 횟수가 ${before}회에서 ${after}회로 변경되었습니다.${increased ? " 소중한 자녀 믿고 맡겨주셔서 감사드립니다." : ""}`,
    url: `/p/${token}`,
    tag: `count-${studentName}-${after}`,
  };
}

export function attendancePushPayload(
  token: string,
  studentName: string,
  eventType: "check_in" | "check_out",
  occurredAt: Date
): ParentPushPayload {
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(occurredAt);
  const label = eventType === "check_in" ? "등원" : "하원";
  return {
    title: `${studentName} 학생 ${label} 알림`,
    body: `${studentName} 학생이 ${time}에 ${label}했습니다.`,
    url: `/p/${token}`,
    tag: `${eventType}-${studentName}-${occurredAt.toISOString().slice(0, 10)}`,
  };
}

export function remainingTwoCountPushPayload(
  token: string,
  studentName: string,
  message: string,
  totalCount: number
): ParentPushPayload {
  return {
    title: `${studentName} 학생 수업 횟수 안내`,
    body: message,
    url: `/p/${token}`,
    tag: `remaining-two-${studentName}-${totalCount}`,
  };
}
