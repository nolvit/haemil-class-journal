import { describe, expect, it, vi } from "vitest";
import { handleOverlayBack } from "../client/src/avatarRewards/avatarNavigation";

describe("avatar overlay back navigation", () => {
  it("re-arms the parent guard when only a nested card was closed", () => {
    const rearm = vi.fn();

    expect(handleOverlayBack(() => false, rearm)).toBe("rearmed");
    expect(rearm).toHaveBeenCalledOnce();
  });

  it("does not add another history entry after the owner closes", () => {
    const rearm = vi.fn();

    expect(handleOverlayBack(() => true, rearm)).toBe("closed");
    expect(rearm).not.toHaveBeenCalled();
  });
});
