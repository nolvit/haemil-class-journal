import { describe, expect, it } from "vitest";
import { relocatedMathJournalPayloads } from "./mathJournalMoves";

describe("math journal sidecar moves", () => {
  const original = [
    { journalId: 10, payload: "first" },
    { journalId: 20, payload: "second" },
    { journalId: 30, payload: "third" },
  ];

  it("moves insertion contents using original payloads despite overlapping targets", () => {
    expect(relocatedMathJournalPayloads(original, [
      { sourceId: 10, targetId: 20 },
      { sourceId: 20, targetId: 30 },
      { sourceId: 30, targetId: 40 },
    ])).toEqual([
      { journalId: 20, payload: "first" },
      { journalId: 30, payload: "second" },
      { journalId: 40, payload: "third" },
    ]);
  });

  it("pulls future contents forward without retaining the deleted day's payload", () => {
    expect(relocatedMathJournalPayloads(original, [
      { sourceId: 20, targetId: 10 },
      { sourceId: 30, targetId: 20 },
    ])).toEqual([
      { journalId: 10, payload: "second" },
      { journalId: 20, payload: "third" },
    ]);
  });

  it("clears a structured target when a legacy journal replaces it", () => {
    expect(relocatedMathJournalPayloads(original, [
      { sourceId: 99, targetId: 20 },
      { sourceId: 20, targetId: 30 },
    ])).toEqual([{ journalId: 30, payload: "second" }]);
  });
});
