import { describe, expect, it } from "vitest";
import { parentMathJournalContent, parentMathJournalScheduledContent } from "./parentMathJournal";
import { isMathJournalOutcomeVisible } from "./journalRules";

describe("parent math journal small-unit display", () => {
  it("uses the curriculum name after each consecutive small-unit title", () => {
    expect(
      parentMathJournalContent(
        "[중2-2 / 1단계 / 2-3단원]\n[중2-2 / 1단계 / 2-4단원]",
        "수학",
        "2026-09-28"
      )
    ).toBe(
      "[중2-2 / 1단계 / 2-3단원]\n여러 가지 사각형\n\n" +
        "[중2-2 / 1단계 / 2-4단원]\n여러 가지 사각형 사이의 관계"
    );
  });

  it("does not add a middle-unit title or repeat a manually written name", () => {
    const content =
      "[중2-2 / 1단계 / 2단원]\n2-1 소단원 평가\n" +
      "[중2-2 / 1단계 / 2-1단원]\n평행사변형";
    expect(parentMathJournalContent(content, "수학", "2026-09-28")).toBe(content);
  });

  it("leaves other subjects, unmatched titles, and pre-launch display intact", () => {
    const content = "[중2-2 / 1단계 / 2-3단원]";
    expect(parentMathJournalContent(content, "영어", "2026-09-28")).toBe(content);
    expect(parentMathJournalContent(content, "수학", "2026-09-27")).toBe(content);
    expect(
      parentMathJournalContent("[중2-2 / 1단계 / 8-1단원]", "수학", "2026-09-28")
    ).toBe("[중2-2 / 1단계 / 8-1단원]");
  });

  it("uses the correct middle-3 second-term title on either side of the switch", () => {
    const content = "[중3-2 / 1단계 / 5-2단원]";
    expect(parentMathJournalContent(content, "수학", "2026-12-31")).toBe(
      content + "\n상자그림"
    );
    expect(parentMathJournalContent(content, "수학", "2027-01-01")).toBe(
      content + "\n산포도"
    );
  });

  it("shows previously saved selection rows on separate lines without rewriting legacy titles", () => {
    const stored =
      "[중1-2 / 기본 / 3단원] 3-1 다각형 · 진행 중\n" +
      "[중1-2 / 기본 / 3단원] 3-2 삼각형의 내각과 외각 · 완료";
    expect(parentMathJournalContent(stored, "수학", "2026-09-28")).toBe(
      "[중1-2 / 기본 / 3단원]\n" +
      "3-1 다각형 · 진행 중\n" +
      "3-2 삼각형의 내각과 외각 · 완료"
    );
    expect(parentMathJournalContent(stored, "영어", "2026-09-28")).toBe(stored);
    expect(parentMathJournalContent(stored, "수학", "2026-09-27")).toBe(
      "[중1-2 / 기본 / 3단원]\n" +
      "3-1 다각형 · 진행 중\n" +
      "3-2 삼각형의 내각과 외각 · 완료"
    );
  });
});

describe("scheduled math lesson text for parents", () => {
  const saved =
    "[중1-2 / 기본 / 3단원]\n" +
    "3-1 다각형 · 진행 중\n" +
    "3-2 삼각형의 내각과 외각 · 완료\n" +
    "[중1-2 / 기본 / 4단원]\n" +
    "4-1 다면체 · 건너뜀\n" +
    "선생님 메모: 복습 완료";

  it("shows every selected step as planned while preserving titles and free prose", () => {
    expect(parentMathJournalScheduledContent(saved, "수학", "2026-09-28", false)).toBe(
      "[중1-2 / 기본 / 3단원]\n" +
      "3-1 다각형 · 예정\n" +
      "3-2 삼각형의 내각과 외각 · 예정\n" +
      "[중1-2 / 기본 / 4단원]\n" +
      "4-1 다면체 · 예정\n" +
      "선생님 메모: 복습 완료"
    );
  });

  it("normalizes old one-line selected steps before showing them as planned", () => {
    const old = "[중1-2 / 기본 / 3단원] 3-1 다각형 · 완료";
    expect(parentMathJournalScheduledContent(old, "수학", "2026-09-28", false)).toBe(
      "[중1-2 / 기본 / 3단원]\n3-1 다각형 · 예정"
    );
  });

  it("restores the saved states after the lesson and leaves non-math unchanged", () => {
    expect(parentMathJournalScheduledContent(saved, "수학", "2026-09-28", true)).toBe(saved);
    expect(parentMathJournalScheduledContent(saved, "영어", "2026-09-28", false)).toBe(saved);
  });

  it("uses the homework timing rule for departure and the 22:00 fallback", () => {
    const lesson = { content: saved, journalDate: "2026-09-28", attendanceStatus: "present" as const, departureTime: null };
    const before = isMathJournalOutcomeVisible({ ...lesson, now: new Date("2026-09-28T12:59:00Z") });
    const departed = isMathJournalOutcomeVisible({ ...lesson, departureTime: "20:30", now: new Date("2026-09-28T12:59:00Z") });
    const cutoff = isMathJournalOutcomeVisible({ ...lesson, now: new Date("2026-09-28T13:00:00Z") });
    expect(parentMathJournalScheduledContent(saved, "수학", lesson.journalDate, before)).toContain("3-1 다각형 · 예정");
    expect(parentMathJournalScheduledContent(saved, "수학", lesson.journalDate, departed)).toContain("3-1 다각형 · 진행 중");
    expect(parentMathJournalScheduledContent(saved, "수학", lesson.journalDate, cutoff)).toContain("3-2 삼각형의 내각과 외각 · 완료");
  });
});
