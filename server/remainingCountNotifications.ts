import {
  listRemainingTwoNotificationCandidates,
  markRemainingTwoNotificationAttempt,
} from "./db";
import {
  remainingTwoCountPushPayload,
  sendStudentPush,
} from "./pushNotifications";

let dispatchRunning = false;

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
      const result = await sendStudentPush(
        student.id,
        remainingTwoCountPushPayload(
          student.publicToken,
          student.name,
          student.message,
          student.totalCount
        ),
        { type: "remaining_two", eventDate: korea.date }
      );
      sent += result.sent;
    }
    return { checked: true, attempted, sent };
  } finally {
    dispatchRunning = false;
  }
}
