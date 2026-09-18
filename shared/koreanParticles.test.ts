import { describe, expect, it } from "vitest";
import { withEuroRo } from "./koreanParticles";

describe("Korean particles", () => {
  it("selects 로 or 으로 from the final consonant", () => {
    expect(withEuroRo("계좌이체")).toBe("계좌이체로");
    expect(withEuroRo("카드")).toBe("카드로");
    expect(withEuroRo("현금")).toBe("현금으로");
  });
});
