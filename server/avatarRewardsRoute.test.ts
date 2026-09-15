import { describe, expect, it } from "vitest";
import { isAvatarRewardsSpaEntry } from "./_core/vite";

describe("avatar rewards production routing", () => {
  it.each([
    "/avatar-rewards",
    "/avatar-rewards/",
    "/avatar-rewards?source=push",
    "/avatar-rewards/?source=notification",
  ])("serves the SPA entry for %s", url => {
    expect(isAvatarRewardsSpaEntry(url)).toBe(true);
  });

  it.each([
    "/avatar-rewards/avatars/missing.png",
    "/avatar-rewards/audio/missing.mp3",
    "/avatar-rewards/not-a-route",
    "/avatar-rewardsoops",
  ])("keeps missing assets and nested paths out of the SPA for %s", url => {
    expect(isAvatarRewardsSpaEntry(url)).toBe(false);
  });
});
