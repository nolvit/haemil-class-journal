import { describe, expect, it, vi } from "vitest";
import { attendanceRecordPoints } from "./avatarRewardStore";
import { buildRewardPrompt } from "./avatarRewardPrompt";
import { rewardOrderInput } from "../shared/avatarRewards";
import {
  avatarRewardsRouter,
  validateRewardImage,
} from "./routers/avatarRewards";
import type { TrpcContext } from "./_core/context";
vi.mock("./db", () => ({
  getPortalFamilyByToken: vi.fn(async () => [{ id: 1 }]),
}));
const input = {
  top: "후드티",
  bottom: "청바지",
  shoes: "운동화",
  hair: "갈색 쉼표머리",
  background: "도시 옥상",
  accessories: ["별 목걸이"],
  mode: "original" as const,
};
describe("reward integration boundaries", () => {
  it("calculates actual completed attendance only", () => {
    for (const status of ["present", "makeup", "makeup_double"])
      expect(
        attendanceRecordPoints({
          status,
          arrivalTime: "14:00",
          departureTime: "17:00",
        })
      ).toBe(150);
    for (const status of [
      "absent",
      "not_entered",
      "holiday",
      "closed",
      "not_registered",
    ])
      expect(
        attendanceRecordPoints({
          status,
          arrivalTime: "14:00",
          departureTime: "16:00",
        })
      ).toBe(0);
    for (const departureTime of [null, "13:00", "25:00", "abc"])
      expect(
        attendanceRecordPoints({
          status: "present",
          arrivalTime: "14:00",
          departureTime,
        })
      ).toBe(0);
    expect(
      attendanceRecordPoints({
        status: "present",
        arrivalTime: "14:10",
        departureTime: "15:00",
      })
    ).toBe(50);
  });
  it("adapts original semantics and includes hair and background without requiring clothing images", () => {
    const prompt = buildRewardPrompt(input);
    expect(prompt).toContain("V2");
    expect(prompt).toContain("갈색 쉼표머리");
    expect(prompt).toContain("도시 옥상");
    expect(prompt).toContain("Preserve the facial identity");
    expect(prompt).not.toContain("Image B");
    expect(buildRewardPrompt({ ...input, mode: "superstar" })).toContain(
      "dramatic star styling"
    );
  });
  it("rejects missing hair, old modes and excessive accessories", () => {
    expect(rewardOrderInput.safeParse({ ...input, hair: "" }).success).toBe(
      false
    );
    expect(
      rewardOrderInput.safeParse({ ...input, mode: "likeness" }).success
    ).toBe(false);
    expect(
      rewardOrderInput.safeParse({
        ...input,
        accessories: Array(9).fill("모자"),
      }).success
    ).toBe(false);
  });
  it("rejects disguised non-images", () => {
    expect(() =>
      validateRewardImage({
        data: Buffer.from("<svg/>").toString("base64"),
        mime: "image/png",
      })
    ).toThrow();
  });
  it("rejects another student and anonymous administration before accessing the store", async () => {
    const caller = avatarRewardsRouter.createCaller({
      user: null,
      req: {},
      res: {},
    } as TrpcContext);
    await expect(
      caller.snapshot({ token: "valid-token", studentId: 2 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.submit({ token: "valid-token", studentId: 2, order: input })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.cancel({
        studentId: 1,
        orderId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
