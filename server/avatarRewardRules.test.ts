import { describe, expect, it } from "vitest";
import { attendancePoints, avatarPrice } from "../shared/avatarRewardRules";
describe("journal avatar rewards", () => {
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
      500, 1000, 1500, 2250, 2250, 2250,
    ]);
  });
});
