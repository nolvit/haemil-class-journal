/** Assignment database timestamps are UTC, including mysql2 dateStrings values. */
export function assignmentTimestampIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const text = value.trim();
  // A MySQL timestamp has no offset. Never let the browser interpret it as local time.
  const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  return new Date(utc).toISOString();
}

const assignmentDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatAssignmentTimestamp(value: string | Date): string {
  return assignmentDateFormatter.format(new Date(assignmentTimestampIso(value)));
}
