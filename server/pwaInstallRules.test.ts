import { describe, expect, it } from "vitest";
import {
  detectPwaInstallEnvironment,
  getManualInstallInstruction,
} from "../shared/pwaInstallRules";

describe("parent PWA install environment", () => {
  it("detects KakaoTalk on Android as an in-app browser", () => {
    const environment = detectPwaInstallEnvironment(
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 KAKAOTALK 11.0"
    );
    expect(environment.isAndroid).toBe(true);
    expect(environment.isInAppBrowser).toBe(true);
    expect(environment.inAppName).toBe("카카오톡");
  });

  it("provides Samsung Internet and Chrome-specific instructions", () => {
    const samsung = detectPwaInstallEnvironment(
      "Mozilla/5.0 (Linux; Android 15) SamsungBrowser/27.0 Chrome/125.0"
    );
    const chrome = detectPwaInstallEnvironment(
      "Mozilla/5.0 (Linux; Android 15) Chrome/125.0 Mobile Safari/537.36"
    );
    expect(getManualInstallInstruction(samsung)).toContain("≡ 또는 ⋮");
    expect(getManualInstallInstruction(chrome)).toContain("앱 설치");
  });

  it("provides the iOS Safari share instruction", () => {
    const safari = detectPwaInstallEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1"
    );
    expect(safari.isSafari).toBe(true);
    expect(getManualInstallInstruction(safari)).toContain("Safari 하단 공유 버튼");
  });
});
