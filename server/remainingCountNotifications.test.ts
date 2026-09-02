import { describe, expect, it } from "vitest";
import { koreaDateAndHour } from "./remainingCountNotifications";

describe("remaining count notification schedule", () => {
  it("recognizes 7 PM in Korea", () => {
    expect(koreaDateAndHour(new Date("2026-09-02T10:00:00.000Z"))).toEqual({
      date: "2026-09-02",
      hour: 19,
    });
  });

  it("does not treat 6:59 PM as the delivery hour", () => {
    expect(
      koreaDateAndHour(new Date("2026-09-02T09:59:00.000Z")).hour
    ).toBe(18);
  });
});
