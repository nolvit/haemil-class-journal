import { describe, expect, it } from "vitest";
import {
  CARD_ART_HEIGHT,
  CARD_ART_WIDTH,
  CARD_RENDER_HEIGHT,
  CARD_RENDER_SCALE,
  CARD_RENDER_WIDTH,
} from "../client/src/avatarRewards/cardExport";

describe("collection card render resolution", () => {
  it("renders the full card and artwork at twice the legacy resolution", () => {
    expect(CARD_RENDER_SCALE).toBeGreaterThanOrEqual(2);
    expect(CARD_RENDER_WIDTH).toBeGreaterThanOrEqual(1800);
    expect(CARD_RENDER_HEIGHT).toBeGreaterThanOrEqual(2400);
    expect(CARD_ART_WIDTH).toBeGreaterThanOrEqual(1520);
    expect(CARD_ART_HEIGHT).toBeGreaterThanOrEqual(1840);
  });
});
