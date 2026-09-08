import { afterEach, describe, expect, it, vi } from "vitest";
import { readyPushRegistration, registeredForGuardian } from "../client/src/lib/parentPushState";
import { getPwaInstallSnapshot } from "../client/src/lib/pwaInstall";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("보호자 알림 실제 상태 확인", () => {
  it("관리자 무시 응답을 보호자 구독 등록 성공으로 처리하지 않는다", () => {
    expect(registeredForGuardian({ success: true, studentCount: 0 })).toBe(false);
    expect(registeredForGuardian({ success: true, studentCount: 2 })).toBe(true);
    expect(registeredForGuardian({ success: false, studentCount: 2 })).toBe(false);
  });
  it("서비스워커 미준비 상태는 무한 대기하지 않는다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { serviceWorker: { ready: new Promise(() => {}) } });
    const result = expect(readyPushRegistration(100)).rejects.toThrow("초과");
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("준비된 서비스워커를 반환하고 제한 시간을 해제한다", async () => {
    vi.useFakeTimers();
    const registration = { pushManager: {} };
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(registration) } });
    expect(await readyPushRegistration()).toBe(registration);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("홈 화면 바로가기나 과거 저장값을 standalone 실행으로 오인하지 않는다", () => {
    vi.stubGlobal("navigator", { standalone: false });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => "1" } });
    expect(getPwaInstallSnapshot().installed).toBe(false);
  });
  it("iOS 및 display-mode standalone 실행을 확인한다", () => {
    vi.stubGlobal("navigator", { standalone: true });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(getPwaInstallSnapshot().installed).toBe(true);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(getPwaInstallSnapshot().installed).toBe(true);
  });
});
