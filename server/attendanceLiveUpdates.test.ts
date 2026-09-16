import { describe, expect, it, vi } from "vitest";
import {
  parseAttendanceLiveUpdate,
  type AttendanceLiveUpdate,
} from "../shared/attendanceLiveUpdates";
import {
  publishAttendanceLiveUpdate,
  serializeAttendanceLiveUpdate,
  subscribeAttendanceLiveUpdates,
} from "./attendanceLiveUpdates";

const event: AttendanceLiveUpdate = {
  studentId: 23,
  eventDate: "2026-09-16",
  eventType: "check_in",
  occurredAt: "2026-09-16T08:10:00.000Z",
};

describe("attendance live updates", () => {
  it("publishes an attendance change only while subscribed", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeAttendanceLiveUpdates(subscriber);

    publishAttendanceLiveUpdate(event);
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith(event);

    unsubscribe();
    publishAttendanceLiveUpdate(event);
    expect(subscriber).toHaveBeenCalledOnce();
  });

  it("serializes the event in SSE format", () => {
    expect(serializeAttendanceLiveUpdate(event)).toBe(
      `event: attendance\ndata: ${JSON.stringify(event)}\n\n`
    );
  });

  it("parses valid events and rejects malformed messages", () => {
    expect(parseAttendanceLiveUpdate(JSON.stringify(event))).toEqual(event);
    expect(parseAttendanceLiveUpdate("not-json")).toBeNull();
    expect(
      parseAttendanceLiveUpdate(JSON.stringify({ ...event, eventType: "open" }))
    ).toBeNull();
  });
});
