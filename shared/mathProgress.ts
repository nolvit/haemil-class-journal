import {
  mathCurriculum,
  type ProgressState,
  assessmentKeys,
} from "./mathCurriculum";
export type ProgressJournal = {
  id: number;
  content: string | null;
  journalDate: string;
  isDraft: boolean;
};
export type ProgressOverride = {
  key: string;
  state: ProgressState;
  reason: string;
  updatedByUserId: number;
  updatedAt: string;
};
export const progressKeys = mathCurriculum.flatMap(c =>
  c.units.flatMap((u, i) => [
    ...u.smalls.flatMap((_, j) => [
      `${c.term}:${i + 1}:learn:${j + 1}`,
      `${c.term}:${i + 1}:test:${j + 1}`,
    ]),
    ...assessmentKeys.map(k => `${c.term}:${i + 1}:${k}`),
  ])
);
export function calculateMathProgress(
  journals: ProgressJournal[],
  overrides: ProgressOverride[] = [],
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
) {
  const automatic: Record<string, ProgressState> = Object.fromEntries(
    progressKeys.map(k => [k, "waiting"])
  );
  const unmatched: {
    id: number;
    date: string;
    text: string;
    reason: string;
  }[] = [];
  const mark = (key: string, state: ProgressState) => {
    if (
      key in automatic &&
      (state === "complete" || automatic[key] === "waiting")
    )
      automatic[key] = state;
  };
  for (const row of journals) {
    if (row.isDraft || row.journalDate > today || !row.content?.trim())
      continue;
    const text = row.content.normalize("NFKC").replace(/[–−—]/g, "-");
    const headers = Array.from(
      text.matchAll(
        /\[\s*중\s*([123])\s*-\s*([12])\s*\/\s*([^/\]]+)\s*\/\s*(\d+)\s*(?:-\s*(\d+))?\s*단원\s*\]/g
      )
    );
    let recognized = false,
      invalid = false;
    for (let h = 0; h < headers.length; h++) {
      const m = headers[h],
        term = `중${m[1]}-${m[2]}`;
      if (m[3].trim() !== "기본") continue;
      const c = mathCurriculum.find(c => c.term === term),
        unit = Number(m[4]),
        small = m[5] ? Number(m[5]) : null;
      const u = c?.units[unit - 1];
      if (
        !c ||
        !u ||
        (small !== null && (small < 1 || small > u.smalls.length))
      ) {
        invalid = true;
        continue;
      }
      const body = text.slice(
        m.index! + m[0].length,
        headers[h + 1]?.index ?? text.length
      );
      const prefix = `${term}:${unit}`;
      if (small !== null) {
        recognized = true;
        c.units.forEach((v, i) =>
          v.smalls.forEach((_, j) => {
            if (i + 1 < unit || (i + 1 === unit && j + 1 < small))
              mark(`${term}:${i + 1}:learn:${j + 1}`, "complete");
          })
        );
        mark(`${prefix}:learn:${small}`, "active");
      }
      let evaluated = false;
      for (const e of Array.from(
        body.matchAll(/(\d+)\s*-\s*(\d+)\s*소단원\s*평가/g)
      )) {
        const n = Number(e[2]);
        if (Number(e[1]) !== unit || n < 1 || n > u.smalls.length) {
          invalid = true;
          continue;
        }
        mark(`${prefix}:test:${n}`, "complete");
        mark(`${prefix}:learn:${n}`, "complete");
        evaluated = true;
      }
      for (const [key, re] of [
        ["preliminary", /중단원\s*예비\s*평가/],
        ["final1", /1\s*차\s*최종\s*평가/],
        ["final2", /2\s*차\s*최종\s*평가/],
      ] as const) {
        if (re.test(body)) {
          mark(`${prefix}:${key}`, "complete");
          evaluated = true;
        }
      }
      if (evaluated) {
        recognized = true; // A major-unit evaluation header denotes entry after learning.
        if (small === null)
          u.smalls.forEach((_, j) =>
            mark(`${prefix}:learn:${j + 1}`, "complete")
          );
      }
    }
    if (!recognized || invalid)
      unmatched.push({
        id: row.id,
        date: row.journalDate,
        text: row.content,
        reason: invalid
          ? "미정의 학기 또는 단원 번호"
          : "과정·평가 표기 확인 필요",
      });
  }
  const overrideMap: Record<string, ProgressOverride | undefined> =
    Object.fromEntries(overrides.map(o => [o.key, o]));
  const state = (key: string) => overrideMap[key]?.state ?? automatic[key];
  const terms = mathCurriculum.map(c => {
    const units = c.units.map((u, i) => {
      const prefix = `${c.term}:${i + 1}`;
      const cells = [
        ...u.smalls.flatMap((name, j) => [
          {
            key: `${prefix}:learn:${j + 1}`,
            label: `${i + 1}-${j + 1} ${name}`,
            sector: "learn" as const,
          },
          {
            key: `${prefix}:test:${j + 1}`,
            label: `${i + 1}-${j + 1} 소단원 평가`,
            sector: "test" as const,
          },
        ]),
        ...assessmentKeys.map(k => ({
          key: `${prefix}:${k}`,
          label: k,
          sector: "test" as const,
        })),
      ].map(cell => ({
        ...cell,
        state: state(cell.key),
        automatic: automatic[cell.key],
        override: overrideMap[cell.key] ?? null,
      }));
      const learning = cells.filter(x => x.sector === "learn");
      const exams = assessmentKeys.map(k => state(`${prefix}:${k}`));
      const summarize = (states: ProgressState[]): ProgressState =>
        states.every(s => s === "complete")
          ? "complete"
          : states.some(s => s !== "waiting")
            ? "active"
            : "waiting";
      const learn = summarize(learning.map(x => x.state));
      const test: ProgressState = exams.every(s => s === "complete")
        ? "complete"
        : cells.some(x => x.sector === "test" && x.state !== "waiting")
          ? "active"
          : "waiting";
      const percent = Math.round(
        (50 * learning.filter(x => x.state === "complete").length) /
          learning.length +
          (50 * exams.filter(x => x === "complete").length) / 3
      );
      return {
        number: i + 1,
        name: u.name,
        cells,
        learn,
        test,
        percent,
        complete: learn === "complete" && test === "complete",
      };
    });
    return {
      term: c.term,
      units,
      percent: Math.round(
        units.reduce((n, u) => n + u.percent, 0) / units.length
      ),
    };
  });
  return {
    terms,
    percent: Math.round(
      terms.reduce((n, t) => n + t.percent, 0) / terms.length
    ),
    unmatched,
  };
}
export type MathProgress = ReturnType<typeof calculateMathProgress>;
