import { describe, it, expect } from "vitest";
import {
  calculateMathProgress,
  type ProgressJournal,
  type ProgressOverride,
} from "../shared/mathProgress";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
const row = (
  content: string,
  id = 1,
  extra: Partial<ProgressJournal> = {}
): ProgressJournal => ({
  id,
  content,
  journalDate: "2026-09-21",
  isDraft: false,
  ...extra,
});
const calc = (rows: ProgressJournal[], overrides: ProgressOverride[] = []) =>
  calculateMathProgress(rows, overrides, "2026-09-22");
const unit = (p: ReturnType<typeof calc>, n = 2) =>
  p.terms.find(t => t.term === "중2-2")!.units[n - 1];
describe("math course progress", () => {
  it("completes earlier learning but never assumes earlier exams", () => {
    const p = calc([row("[중2-2 / 기본 / 2-3단원]")]);
    const u = unit(p);
    expect(u.cells.filter(c => c.sector === "learn").map(c => c.state)).toEqual(
      ["complete", "complete", "active", "waiting", "waiting"]
    );
    expect(unit(p, 1).learn).toBe("complete");
    expect(unit(p, 1).test).toBe("waiting");
    expect(u.complete).toBe(false);
  });
  it("requires every major evaluation before marking the unit complete", () => {
    const a = row(
      "[중2-2 / 기본 / 2단원]\n2-1 소단원 평가\n중단원 예비 평가\n1차 최종 평가"
    );
    expect(unit(calc([a])).learn).toBe("complete");
    expect(unit(calc([a])).test).toBe("active");
    const p = calc([a, row("[중2-2 / 기본 / 2단원]\n2차 최종 평가", 2)]);
    expect(unit(p).complete).toBe(true);
    expect(unit(p).percent).toBe(100);
  });
  it("does not lower completion when later records review earlier units", () => {
    const rows = [
      row("[중2-2 / 기본 / 7-2단원]"),
      row("[중2-2 / 기본 / 1-1단원]", 2),
    ];
    expect(unit(calc(rows), 1).learn).toBe("complete");
    expect(calc(rows)).toEqual(calc([...rows].reverse()));
  });
  it("ignores drafts and future entries", () => {
    const p = calc([
      row("[중2-2 / 기본 / 7-2단원]", 1, { isDraft: true }),
      row("[중2-2 / 기본 / 7-2단원]", 2, { journalDate: "2026-10-01" }),
    ]);
    expect(p.percent).toBe(0);
    expect(p.unmatched).toHaveLength(0);
  });
  it("reports undefined courses, malformed headers and invalid small units", () => {
    const p = calc([
      row("[중3-2 / 기본 / 1-1단원]"),
      row("수학 학습", 2),
      row("[중2-2 / 기본 / 2-99단원]", 3),
    ]);
    expect(p.percent).toBe(0);
    expect(p.unmatched).toHaveLength(3);
  });
  it("recognizes whitespace variations and separates multiple course blocks", () => {
    const p = calc([
      row(
        "[ 중 2 - 2 / 기본 / 2 - 3 단원 ]\n[중1-2 / 기본 / 1단원]\n중단원 예비평가\n1차 최종평가\n2차 최종평가"
      ),
    ]);
    expect(p.unmatched).toHaveLength(0);
    expect(p.terms[0].units[0].complete).toBe(true);
    expect(unit(p).test).toBe("waiting");
  });
  it("preserves explicit manual states and allows automatic restoration", () => {
    const rows = [row("[중2-2 / 기본 / 2-3단원]")];
    const o: ProgressOverride = {
      key: "중2-2:2:learn:1",
      state: "waiting",
      reason: "확인 필요",
      updatedByUserId: 1,
      updatedAt: "2026-09-22",
    };
    expect(unit(calc(rows, [o])).cells[0].state).toBe("waiting");
    expect(unit(calc(rows)).cells[0].state).toBe("complete");
  });
  it("rejects non-admin list and correction access", async () => {
    const user = {
      id: 1,
      openId: "test",
      role: "user",
      name: null,
      email: null,
      loginMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as const;
    const caller = appRouter.createCaller({
      user,
      req: {},
      res: {},
    } as TrpcContext);
    await expect(caller.academy.mathProgress.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.academy.mathProgress.save({
        studentId: 1,
        key: "중2-2:2:learn:1",
        state: "complete",
        reason: "검증",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
