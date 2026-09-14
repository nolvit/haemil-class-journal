import { describe, expect, it } from "vitest";
import {
  REMAINING_TWO_ALERT_MESSAGE,
  shouldSendRemainingTwoNotification,
} from "../shared/remainingCountNotificationRules";

const baseState = {
  portalEnabled: true,
  message: REMAINING_TWO_ALERT_MESSAGE,
  remainingCount: 2,
  totalCount: 12,
  sentTotalCount: null,
};

describe("remaining two-session notification rule", () => {
  it("sends only when exactly two sessions remain", () => {
    expect(shouldSendRemainingTwoNotification(baseState)).toBe(true);
    expect(
      shouldSendRemainingTwoNotification({ ...baseState, remainingCount: 1 })
    ).toBe(false);
    expect(
      shouldSendRemainingTwoNotification({ ...baseState, remainingCount: 0 })
    ).toBe(false);
  });

  it("requires a portal, a custom message, and a new count cycle", () => {
    expect(
      shouldSendRemainingTwoNotification({ ...baseState, portalEnabled: false })
    ).toBe(false);
    expect(
      shouldSendRemainingTwoNotification({ ...baseState, message: "  " })
    ).toBe(false);
    expect(
      shouldSendRemainingTwoNotification({ ...baseState, sentTotalCount: 12 })
    ).toBe(false);
  });
});
