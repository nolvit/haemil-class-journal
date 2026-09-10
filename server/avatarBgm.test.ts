import { describe, expect, it } from "vitest";
import {
  avatarBgmPrice,
  avatarBgmTracks,
  avatarBgmTrackId,
} from "../shared/avatarBgm";
import { rewardDDL } from "./avatarRewardSchema";
import { defaultShopItems, shopItemInput } from "../shared/avatarShop";

describe("avatar BGM catalog and purchase policy", () => {
  it("offers only the first owned track for free", () => {
    expect(avatarBgmPrice(0, 300)).toBe(0);
    expect(avatarBgmPrice(1, 300)).toBe(300);
    expect(avatarBgmPrice(10, 450)).toBe(450);
  });

  it("publishes the two supplied tracks with their exact durations", () => {
    expect(
      avatarBgmTracks.map(track => [track.title, track.durationLabel])
    ).toEqual([
      ["달빛 도서관", "3분 4초"],
      ["별빛 산책", "2분 42초"],
    ]);
    for (const track of avatarBgmTracks) {
      expect(avatarBgmTrackId.safeParse(track.id).success).toBe(true);
      expect(track.url).toMatch(/\.mp3$/);
      expect(track.price).toBe(300);
    }
  });

  it("stores permanent ownership separately from playback settings", () => {
    expect(
      rewardDDL.some(statement => statement.includes("avatar_bgm_inventory"))
    ).toBe(true);
    expect(
      rewardDDL.some(statement => statement.includes("avatar_bgm_settings"))
    ).toBe(true);
    expect(
      rewardDDL.some(statement => statement.includes("avatar_shop_items"))
    ).toBe(true);
    expect(
      defaultShopItems.every(item => shopItemInput.safeParse(item).success)
    ).toBe(true);
    expect(
      shopItemInput.safeParse({ ...defaultShopItems[0], rank: "직접 입력" })
        .success
    ).toBe(false);
  });
});
