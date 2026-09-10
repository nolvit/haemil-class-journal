import { describe, expect, it, vi } from "vitest";
import { attendanceRecordPoints } from "./avatarRewardStore";
import { buildRewardPrompt } from "./avatarRewardPrompt";
import {
  rewardOrderInput,
  rewardAdjustmentInput,
} from "../shared/avatarRewards";
import { imagination, randomSuggestion } from "../shared/avatarImagination";
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
  pet: "별빛 아기 용",
  pose: "작은 달 받치기",
  extra: "나비 모양 그림자",
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
    expect(prompt).toContain("V3");
    expect(prompt).toContain("별빛 아기 용");
    expect(prompt).toContain("작은 달 받치기");
    expect(prompt).toContain("나비 모양 그림자");
    expect(prompt).toContain("Both images must clearly differ at first glance");
    expect(prompt).toContain("갈색 쉼표머리");
    expect(prompt).toContain("도시 옥상");
    expect(prompt).toContain("Preserve the facial identity");
    expect(prompt).not.toContain("Image B");
    expect(buildRewardPrompt({ ...input, mode: "superstar" })).toContain(
      "dramatic star styling"
    );
  });
  it("allows optional parts and rejects old modes and excessive accessories", () => {
    expect(rewardOrderInput.safeParse({ ...input, hair: "" }).success).toBe(
      true
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
  it("supports old orders and validates optional additions", () => {
    const { pet, pose, extra, ...old } = input;
    expect(rewardOrderInput.parse(old)).toMatchObject({
      pet: "",
      pose: "",
      extra: "",
    });
    expect(
      rewardOrderInput.safeParse({ ...input, extra: "a".repeat(601) }).success
    ).toBe(false);
  });
  it("offers a different editable random suggestion for every field", () => {
    for (const field of Object.keys(
      imagination
    ) as (keyof typeof imagination)[]) {
      const suggestion = randomSuggestion(
        field,
        imagination[field][0],
        () => 0
      );
      expect(suggestion).not.toBe(imagination[field][0]);
      expect(imagination[field]).toContain(suggestion);
    }
  });
  it("requires a nonzero integer adjustment and a reason", () => {
    const base = {
      studentId: 1,
      delta: 50,
      reason: "보너스",
      requestId: "11111111-1111-4111-8111-111111111111",
    };
    for (const bad of [
      { delta: 0 },
      { delta: 1.5 },
      { reason: " " },
      { delta: 100001 },
    ])
      expect(rewardAdjustmentInput.safeParse({ ...base, ...bad }).success).toBe(
        false
      );
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
    for (const request of [
      caller.wardrobe({ token: "valid-token", studentId: 2 }),
      caller.gallery({ token: "valid-token", studentId: 2, page: 0 }),
      caller.purchaseFrame({
        token: "valid-token",
        studentId: 2,
        frameId: "aurora",
      }),
      caller.purchaseBackground({
        token: "valid-token",
        studentId: 2,
        backgroundId: "library",
      }),
      caller.share({
        token: "valid-token",
        studentId: 2,
        cardId: "11111111-1111-4111-8111-111111111111",
        visible: true,
      }),
      caller.like({
        token: "valid-token",
        studentId: 2,
        cardId: "11111111-1111-4111-8111-111111111111",
        liked: true,
      }),
    ])
      await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.officialCharacters()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.deleteOfficialCharacter({
        id: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.adjust({
        studentId: 1,
        delta: 50,
        reason: "테스트",
        requestId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.cancel({
        studentId: 1,
        orderId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
