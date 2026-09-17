import { describe, expect, it } from "vitest";
import {
  REMAINING_ONE_ALERT_MESSAGE,
  shouldSendRemainingOneNotification,
} from "../shared/remainingCountNotificationRules";

const baseState = {
  portalEnabled: true,
  message: REMAINING_ONE_ALERT_MESSAGE,
  remainingCount: 1,
  totalCount: 12,
  sentTotalCount: null,
};

describe("remaining one-session notification rule", () => {
  it("sends only when exactly one session remains", () => {
    expect(shouldSendRemainingOneNotification(baseState)).toBe(true);
    expect(
      shouldSendRemainingOneNotification({ ...baseState, remainingCount: 2 })
    ).toBe(false);
    expect(
      shouldSendRemainingOneNotification({ ...baseState, remainingCount: 0 })
    ).toBe(false);
  });

  it("requires a portal, a custom message, and a new count cycle", () => {
    expect(
      shouldSendRemainingOneNotification({ ...baseState, portalEnabled: false })
    ).toBe(false);
    expect(
      shouldSendRemainingOneNotification({ ...baseState, message: "  " })
    ).toBe(false);
    expect(
      shouldSendRemainingOneNotification({ ...baseState, sentTotalCount: 12 })
    ).toBe(false);
  });
});
