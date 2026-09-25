import { describe, expect, it } from "vitest";
import { initialJournalHomework, isJournalHomeworkVisible } from "./journalRules";

describe("new math journal homework default", () => {
  it("starts a writable new math journal at 양호 only", () => {
    expect(initialJournalHomework("수학", null, "present")).toBe("양호");
    expect(initialJournalHomework("수학", null, "not_entered")).toBe("양호");
    expect(initialJournalHomework("영어", null, "present")).toBe("");
  });

  it("preserves existing choices, including an intentionally empty value", () => {
    expect(initialJournalHomework("수학", { homework: "미수행" }, "present")).toBe("미수행");
    expect(initialJournalHomework("수학", { homework: "" }, "present")).toBe("");
    expect(initialJournalHomework("수학", { homework: null }, "present")).toBe("");
    expect(initialJournalHomework("수학", {
      content: "", homework: "", notes: "", mathProgress: { entries: [] }, isDraft: false,
    }, "present")).toBe("");
  });

  it("treats a reopened empty insertion slot as a new math journal", () => {
    const vacant = { content: "", homework: "", notes: "", mathProgress: null, isDraft: false };
    expect(initialJournalHomework("수학", vacant, "present")).toBe("양호");
    expect(initialJournalHomework("영어", vacant, "present")).toBe("");
    expect(initialJournalHomework("수학", vacant, "absent")).toBe("");
  });

  it("never supplies homework for a blocked new journal", () => {
    for (const status of ["absent", "not_registered", "holiday", "closed"] as const)
      expect(initialJournalHomework("수학", null, status)).toBe("");
  });
});

describe("math homework display timing", () => {
  const beforeCutoff = new Date("2026-09-25T12:59:00Z"); // 21:59 KST
  const atCutoff = new Date("2026-09-25T13:00:00Z"); // 22:00 KST
  const base = {
    subject: "수학", content: "3-1 다각형", homework: "양호", journalDate: "2026-09-25",
    attendanceStatus: "present" as const, departureTime: null,
  };

  it("hides the default before checkout and shows it after checkout", () => {
    expect(isJournalHomeworkVisible({ ...base, now: beforeCutoff })).toBe(false);
    expect(isJournalHomeworkVisible({ ...base, departureTime: "20:00", now: beforeCutoff })).toBe(true);
  });

  it("shows an attended student's default at 22:00 KST without checkout", () => {
    expect(isJournalHomeworkVisible({ ...base, now: atCutoff })).toBe(true);
    expect(isJournalHomeworkVisible({ ...base, attendanceStatus: "makeup", now: atCutoff })).toBe(true);
    expect(isJournalHomeworkVisible({ ...base, attendanceStatus: "makeup_double", now: atCutoff })).toBe(true);
  });

  it("never marks a scheduled, future, blocked, or draft lesson as good", () => {
    expect(isJournalHomeworkVisible({ ...base, attendanceStatus: "not_entered", now: atCutoff })).toBe(false);
    expect(isJournalHomeworkVisible({ ...base, journalDate: "2026-09-26", departureTime: "20:00", now: atCutoff })).toBe(false);
    expect(isJournalHomeworkVisible({ ...base, isDraft: true, departureTime: "20:00", now: atCutoff })).toBe(false);
    expect(isJournalHomeworkVisible({ ...base, content: "", departureTime: "20:00", now: atCutoff })).toBe(false);
    for (const status of ["absent", "not_registered", "holiday", "closed"] as const)
      expect(isJournalHomeworkVisible({ ...base, attendanceStatus: status, departureTime: "20:00", now: atCutoff })).toBe(false);
  });

  it("preserves prior lessons, other homework choices, and non-math subjects", () => {
    expect(isJournalHomeworkVisible({ ...base, journalDate: "2026-09-24", now: beforeCutoff })).toBe(true);
    expect(isJournalHomeworkVisible({ ...base, subject: "영어", journalDate: "2026-09-26", now: beforeCutoff })).toBe(true);
    expect(isJournalHomeworkVisible({ ...base, homework: "미수행", now: beforeCutoff })).toBe(true);
    expect(isJournalHomeworkVisible({ ...base, homework: "", now: beforeCutoff })).toBe(false);
  });
});
