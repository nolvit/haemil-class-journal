import { describe, expect, it } from "vitest";
import { assignmentTimestampIso, formatAssignmentTimestamp } from "./assignmentDates";

describe("assignment timestamps", () => {
  it("interprets a stored UTC timestamp before displaying the next day in Korea", () => {
    const stored = "2026-09-26 18:15:00";
    expect(assignmentTimestampIso(stored)).toBe("2026-09-26T18:15:00.000Z");
    expect(formatAssignmentTimestamp(stored)).toBe("2026. 9. 27. 오전 3:15");
  });

  it("renders database history and an immediate ISO response as the same instant", () => {
    expect(formatAssignmentTimestamp("2026-09-26 18:15:00"))
      .toBe(formatAssignmentTimestamp("2026-09-26T18:15:00.000Z"));
  });

  it("preserves existing offsets and Date values without adding another nine hours", () => {
    const utc = "2026-09-26T18:15:00.000Z";
    expect(assignmentTimestampIso("2026-09-27T03:15:00+09:00")).toBe(utc);
    expect(assignmentTimestampIso(new Date(utc))).toBe(utc);
    expect(formatAssignmentTimestamp("2026-09-27T03:15:00+09:00"))
      .toBe("2026. 9. 27. 오전 3:15");
  });

  it("accepts MySQL fractional seconds and legacy timestamps with a T separator", () => {
    expect(assignmentTimestampIso("2026-09-26 18:15:00.123456"))
      .toBe("2026-09-26T18:15:00.123Z");
    expect(assignmentTimestampIso("2026-09-26T18:15:00"))
      .toBe("2026-09-26T18:15:00.000Z");
  });
});
