import { describe, expect, it } from "vitest";
import { getPushDeviceLabel } from "../shared/pushDeviceLabels";

describe("push device labels", () => {
  it("labels common guardian devices and browsers", () => {
    expect(
      getPushDeviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"
      )
    ).toBe("iPhone · Safari");
    expect(
      getPushDeviceLabel(
        "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SamsungBrowser/27.0 Chrome/125.0"
      )
    ).toBe("Android · 삼성 인터넷");
  });

  it("uses a safe label when the user agent is missing", () => {
    expect(getPushDeviceLabel(null)).toBe("기기 · 브라우저");
  });
});
