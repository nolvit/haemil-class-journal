export type AttendanceLiveUpdate = {
  studentId: number;
  eventDate: string;
  eventType: "check_in" | "check_out";
  occurredAt: string;
};

export function parseAttendanceLiveUpdate(value: string) {
  try {
    const event = JSON.parse(value) as Partial<AttendanceLiveUpdate>;
    if (
      !Number.isInteger(event.studentId) ||
      !event.eventDate?.match(/^\d{4}-\d{2}-\d{2}$/) ||
      (event.eventType !== "check_in" && event.eventType !== "check_out") ||
      !event.occurredAt
    )
      return null;
    return event as AttendanceLiveUpdate;
  } catch {
    return null;
  }
}
