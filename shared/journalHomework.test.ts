import { describe, expect, it } from "vitest";
import { initialJournalHomework } from "./journalRules";

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
