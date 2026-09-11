import { describe, expect, it } from "vitest";
import {
  attendancePoints,
  avatarPrice,
  avatarOrderPrice,
  randomPrice,
} from "../shared/avatarRewardRules";
import { rewardBulkAdjustmentInput } from "../shared/avatarRewards";
describe("journal avatar rewards", () => {
  it("adds a fixed mode surcharge after each base tier", () => {
    for (const count of [0, 1, 2, 3, 20]) {
      expect(avatarOrderPrice(count, "original")).toBe(avatarPrice(count));
      expect(avatarOrderPrice(count, "wannabe")).toBe(avatarPrice(count) + 100);
      expect(avatarOrderPrice(count, "superstar")).toBe(
        avatarPrice(count) + 200
      );
    }
  });
  it("requires every departure and caps daily attendance", () => {
    expect(attendancePoints([{ arrival: 0, departure: null }])).toBe(0);
    expect(attendancePoints([{ arrival: 0, departure: 200 * 60000 }])).toBe(
      150
    );
    expect(attendancePoints([{ arrival: 0, departure: 59999 }])).toBe(0);
    expect(attendancePoints([])).toBe(0);
  });
  it("does not double count overlapping sessions", () => {
    expect(
      attendancePoints([
        { arrival: 0, departure: 60 * 60000 },
        { arrival: 30 * 60000, departure: 90 * 60000 },
      ])
    ).toBe(90);
  });
  it("rejects corrupt attendance and counters", () => {
    expect(() => attendancePoints([{ arrival: 10, departure: 0 }])).toThrow();
    expect(() => avatarPrice(-1)).toThrow();
    expect(() => avatarPrice(0.5)).toThrow();
  });
  it("uses completed orders and remains fixed from the fourth", () => {
    expect([0, 1, 2, 3, 4, 100].map(avatarPrice)).toEqual([
      50, 100, 150, 200, 200, 200,
    ]);
  });
  it("prices selected parts, accessories and random actions by attempt", () => {
    expect(
      [0, 1, 2, 3].map(x => avatarOrderPrice(x, "original", 2, 1))
    ).toEqual([75, 140, 205, 275]);
    expect([0, 1, 2, 3].map(x => randomPrice(x))).toEqual([1, 2, 3, 5]);
    expect([0, 1, 2, 3].map(x => randomPrice(x, true))).toEqual([
      10, 20, 30, 50,
    ]);
  });
  it("validates multi-student bonus point requests", () => {
    const request = (studentId: number) => ({
      studentId,
      delta: 100,
      reason: "과제 성실 보너스",
      requestId: crypto.randomUUID(),
    });
    expect(
      rewardBulkAdjustmentInput.parse({ adjustments: [request(1), request(2)] })
        .adjustments
    ).toHaveLength(2);
    expect(() =>
      rewardBulkAdjustmentInput.parse({ adjustments: [request(1), request(1)] })
    ).toThrow();
    expect(() =>
      rewardBulkAdjustmentInput.parse({
        adjustments: [{ ...request(1), delta: -100 }],
      })
    ).toThrow();
  });
});
