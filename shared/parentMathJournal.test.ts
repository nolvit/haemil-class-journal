import { describe, expect, it } from "vitest";
import { parentMathJournalContent } from "./parentMathJournal";

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
});
