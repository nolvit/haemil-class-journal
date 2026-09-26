import { expect, it } from "vitest";
import { hasDeparted, isAtAcademy } from "./attendanceSummaryRules";

it("splits arrived students into currently at the academy and departed", () => {
  expect(isAtAcademy("present", null)).toBe(true);
  expect(hasDeparted("present", "18:30")).toBe(true);
  expect(isAtAcademy("present", "18:30")).toBe(false);
  expect(hasDeparted("makeup", "19:10")).toBe(true);
  expect(isAtAcademy("makeup_double", "")).toBe(true);
  expect(hasDeparted("absent", "18:30")).toBe(false);
  expect(isAtAcademy("not_entered", null)).toBe(false);
});
