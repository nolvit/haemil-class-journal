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
export const BASELINE_DATE = "2026-09-22";
export type ProgressBaseline = {
  terms?: string[];
  cutoffEntries?: Record<string, string>;
  termCorrection?: string;
  initialGrade: number | null;
  states: Record<string, ProgressState>;
  sourceId: number | null;
  sourceDate: string | null;
  sourceText: string | null;
  recognized: boolean;
};
export const progressKeys = mathCurriculum.flatMap(c =>
  c.units.flatMap((u, i) => [
    ...u.smalls.map((_, j) => `${c.term}:${i + 1}:learn:${j + 1}`),
    `${c.term}:${i + 1}:challenge`,
    ...u.smalls.map((_, j) => `${c.term}:${i + 1}:test:${j + 1}`),
    ...assessmentKeys.map(k => `${c.term}:${i + 1}:${k}`),
  ])
);
export function middleGrade(grade: string): number | null {
  const m = grade.match(/중(?:학교|등부|등)?\s*([123])/);
  if (m) return Number(m[1]);
  if (/고(?:등|등학교)?\s*[123]/.test(grade)) return 4;
  return null;
}
function parseHeaders(content: string) {
  const text = content.normalize("NFKC").replace(/[–−—]/g, "-");
  const matches = Array.from(
    text.matchAll(
      /\[\s*중\s*([123])\s*-\s*([12])\s*\/\s*([^/\]]+)\s*\/\s*(\d+)\s*(?:-\s*(\d+))?\s*단원\s*\]/g
    )
  );
  return matches.map((m, i) => ({
    term: `중${m[1]}-${m[2]}`,
    grade: Number(m[1]),
    basic: /^(?:기본(?:\s*과정)?|1\s*단계)$/.test(m[3].trim()),
    unit: Number(m[4]),
    small: m[5] ? Number(m[5]) : null,
    body: text.slice(
      m.index! + m[0].length,
      matches[i + 1]?.index ?? text.length
    ),
  }));
}
function validHeader(h: ReturnType<typeof parseHeaders>[number]) {
  const c = mathCurriculum.find(c => c.term === h.term),
    u = c?.units[h.unit - 1];
  return c &&
    u &&
    (h.small === null || (h.small >= 1 && h.small <= u.smalls.length))
    ? { c, u }
    : null;
}
function emptyStates() {
  return Object.fromEntries(
    progressKeys.map(k => [k, "waiting" as ProgressState])
  );
}
function applyRecord(
  row: ProgressJournal,
  automatic: Record<string, ProgressState>,
  allowedTerms: Set<string>
) {
  let recognized = false,
    invalid = false,
    ignored = false;
  const mark = (key: string, state: ProgressState) => {
    if (
      key in automatic &&
      (state === "complete" || automatic[key] === "waiting")
    )
      automatic[key] = state;
  };
  for (const h of parseHeaders(row.content ?? "")) {
    if (!h.basic) {
      ignored = true;
      continue;
    }
    if (!mathCurriculum.some(c => c.term === h.term)) {
      invalid = true;
      continue;
    }
    if (!allowedTerms.has(h.term)) {
      ignored = true;
      continue;
    }
    const valid = validHeader(h);
    if (!valid) {
      invalid = true;
      continue;
    }
    let headerRecognized = false;
    const { c, u } = valid,
      prefix = `${h.term}:${h.unit}`;
    const learning = u.smalls.map((_, j) => `${prefix}:learn:${j + 1}`);
    const tests = u.smalls.map((_, j) => `${prefix}:test:${j + 1}`);
    const sequence = [
      ...learning,
      `${prefix}:challenge`,
      ...tests,
      ...assessmentKeys.map(k => `${prefix}:${k}`),
    ];
    const reach = (key: string, state: ProgressState) => {
      const index = sequence.indexOf(key);
      if (index < 0) return;
      sequence.slice(0, index).forEach(k => mark(k, "complete"));
      mark(key, state);
      recognized = true;
      headerRecognized = true;
    };
    if (h.small !== null) reach(`${prefix}:learn:${h.small}`, "active");
    // Ignore explicitly scheduled/not-yet-performed evaluation lines.
    const body = h.body
      .split("\n")
      .filter(
        line => !/(?:예정|미실시|미완료|진행\s*전|평가\s*대기)/.test(line)
      )
      .join("\n");
    if (
      /(?:고난[이]?도\s*(?:실력)?\s*문제|실력\s*(?:문제|향상)|고난도|고난이도)/.test(
        body
      )
    )
      reach(
        `${prefix}:challenge`,
        /(?:고난[이]?도|실력).*?(?:완료|마침)/.test(body)
          ? "complete"
          : "active"
      );
    for (const e of Array.from(
      body.matchAll(/(\d+)\s*-\s*(\d+)\s*소단원\s*평가/g)
    )) {
      const n = Number(e[2]);
      if (Number(e[1]) !== h.unit || n < 1 || n > u.smalls.length) {
        invalid = true;
        continue;
      }
      reach(`${prefix}:test:${n}`, "complete");
    }
    for (const [key, re] of [
      ["preliminary", /(?:중단원\s*)?예비\s*평가/],
      ["final1", /1\s*차\s*최종\s*평가/],
      ["final2", /2\s*차\s*최종\s*평가/],
    ] as const)
      if (re.test(body)) reach(`${prefix}:${key}`, "complete");
    // A plain final assessment denotes the first final round; no second-round assumption.
    if (/최종\s*평가/.test(body) && !/[12]\s*차\s*최종\s*평가/.test(body))
      reach(`${prefix}:final1`, "complete");
    if (headerRecognized) {
      for (let n = 1; n < h.unit; n++)
        progressKeys
          .filter(k => k.startsWith(`${h.term}:${n}:`))
          .forEach(k => mark(k, "complete"));
    }
  }
  return { recognized, invalid, ignored };
}
export function createProgressBaseline(
  journals: ProgressJournal[],
  grade: string,
  options: { exactDate?: string; termOverride?: string } = {}
): ProgressBaseline {
  const source = [...journals]
    .filter(
      r =>
        !r.isDraft &&
        (options.exactDate
          ? r.journalDate === options.exactDate
          : r.journalDate <= BASELINE_DATE) &&
        r.content?.trim()
    )
    .sort(
      (a, b) => b.journalDate.localeCompare(a.journalDate) || b.id - a.id
    )[0];
  const parsedSource =
    source && options.termOverride
      ? {
          ...source,
          content: source.content!.replace(
            /(\[\s*)중\s*[123]\s*-\s*[12](\s*\/)/g,
            `$1${options.termOverride}$2`
          ),
        }
      : source;
  const headers = parseHeaders(parsedSource?.content ?? "").filter(
    h => h.basic
  );
  const initialGrade = options.termOverride
    ? Number(options.termOverride[1])
    : (middleGrade(grade) ?? headers.at(-1)?.grade ?? null);
  const terms = Array.from(
    new Set(
      headers
        .filter(h => h.grade === initialGrade && validHeader(h))
        .map(h => h.term)
    )
  );
  const states = emptyStates();
  const allowed = new Set(
    mathCurriculum
      .filter(c => Number(c.term[1]) === initialGrade)
      .map(c => c.term)
  );
  const result = parsedSource
    ? applyRecord(parsedSource, states, allowed)
    : null;
  return {
    terms,
    cutoffEntries: Object.fromEntries(
      journals
        .filter(r => r.journalDate === BASELINE_DATE)
        .map(r => [r.id, journalVersion(r)])
    ),
    termCorrection: options.termOverride,
    initialGrade,
    states,
    sourceId: source?.id ?? null,
    sourceDate: source?.journalDate ?? null,
    sourceText: source?.content ?? null,
    recognized: result?.recognized ?? false,
  };
}
export function journalVersion(row: ProgressJournal) {
  return JSON.stringify([row.journalDate, row.content, row.isDraft]);
}
function isCoveredByBaseline(row: ProgressJournal, baseline: ProgressBaseline) {
  if (row.journalDate < BASELINE_DATE) return true;
  if (row.journalDate > BASELINE_DATE) return false;
  if (baseline.cutoffEntries)
    return baseline.cutoffEntries[row.id] === journalVersion(row);
  return (
    baseline.sourceDate === BASELINE_DATE &&
    (row.id < (baseline.sourceId ?? 0) ||
      (row.id === baseline.sourceId && row.content === baseline.sourceText))
  );
}
export function isMathProgressEligible(
  grade: string,
  baseline: ProgressBaseline | undefined,
  today: string
) {
  const current = middleGrade(grade);
  if (current === 4) return false;
  if (current !== 3) return true;
  return (
    today >= "2027-01-01" &&
    baseline?.initialGrade != null &&
    baseline.initialGrade <= 2
  );
}
export function calculateMathProgress(
  journals: ProgressJournal[],
  overrides: ProgressOverride[] = [],
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  options: { baseline?: ProgressBaseline; grade?: string } = {}
) {
  const baseline = options.baseline;
  const currentGrade = options.grade
    ? (middleGrade(options.grade) ?? baseline?.initialGrade)
    : null;
  const trackedTerms = new Set(
    baseline?.terms ??
      (baseline
        ? parseHeaders(baseline.sourceText ?? "")
            .filter(h => h.basic && h.grade === baseline.initialGrade)
            .map(h => h.term)
        : [])
  );
  if (baseline)
    for (const row of journals) {
      if (
        row.isDraft ||
        row.journalDate > today ||
        isCoveredByBaseline(row, baseline)
      )
        continue;
      for (const h of parseHeaders(row.content ?? ""))
        if (
          h.basic &&
          h.grade >= (baseline.initialGrade ?? 1) &&
          h.grade <= (currentGrade ?? 3) &&
          validHeader(h)
        )
          trackedTerms.add(h.term);
    }
  // No retroactive first-semester rows when a new curriculum is introduced later.
  if (
    baseline &&
    !baseline.termCorrection &&
    currentGrade != null &&
    !Array.from(trackedTerms).some(t => Number(t[1]) === currentGrade)
  ) {
    const latest = mathCurriculum
      .filter(c => Number(c.term[1]) === currentGrade)
      .at(-1);
    if (latest) trackedTerms.add(latest.term);
  }
  const curriculum = mathCurriculum.filter(
    c =>
      !baseline ||
      (trackedTerms.has(c.term) &&
        Number(c.term[1]) >= (baseline.initialGrade ?? 1) &&
        Number(c.term[1]) <= (currentGrade ?? 3))
  );
  const allowed = new Set(curriculum.map(c => c.term));
  const automatic = { ...emptyStates(), ...(baseline?.states ?? {}) };
  const unmatched: {
    id: number;
    date: string;
    text: string;
    reason: string;
  }[] = [];
  if (baseline?.sourceId && !baseline.recognized)
    unmatched.push({
      id: baseline.sourceId,
      date: baseline.sourceDate!,
      text: baseline.sourceText ?? "",
      reason: "초기 기준 일지 확인 필요",
    });
  for (const row of journals) {
    if (
      row.isDraft ||
      row.journalDate > today ||
      !row.content?.trim() ||
      (baseline && isCoveredByBaseline(row, baseline))
    )
      continue;
    const result = applyRecord(row, automatic, allowed);
    if (result.recognized && row.id === baseline?.sourceId) {
      const index = unmatched.findIndex(r => r.id === row.id);
      if (index >= 0) unmatched.splice(index, 1);
    }
    if (result.invalid || (!result.recognized && !result.ignored))
      unmatched.push({
        id: row.id,
        date: row.journalDate,
        text: row.content,
        reason: result.invalid
          ? "단원 번호 확인 필요"
          : "과정·평가 표기 확인 필요",
      });
  }
  const overrideMap: Record<string, ProgressOverride | undefined> =
    Object.fromEntries(overrides.map(o => [o.key, o]));
  const state = (key: string) => overrideMap[key]?.state ?? automatic[key];
  const summarize = (states: ProgressState[]): ProgressState =>
    states.every(s => s === "complete")
      ? "complete"
      : states.some(s => s !== "waiting")
        ? "active"
        : "waiting";
  const terms = curriculum.map(c => {
    const units = c.units.map((u, i) => {
      const prefix = `${c.term}:${i + 1}`;
      const cells = [
        ...u.smalls.map((name, j) => ({
          key: `${prefix}:learn:${j + 1}`,
          label: `${i + 1}-${j + 1} ${name}`,
          sector: "learn" as const,
        })),
        {
          key: `${prefix}:challenge`,
          label: "고난이도 실력문제 풀기",
          sector: "challenge" as const,
        },
        ...u.smalls.map((_, j) => ({
          key: `${prefix}:test:${j + 1}`,
          label: `${i + 1}-${j + 1} 소단원 평가`,
          sector: "test" as const,
        })),
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
      const learning = cells.filter(c => c.sector === "learn"),
        tests = cells.filter(c => c.sector === "test");
      const learn = summarize(learning.map(c => c.state)),
        test = summarize(tests.map(c => c.state)),
        challenge = state(`${prefix}:challenge`);
      const complete = cells.every(c => c.state === "complete");
      // Five equally weighted workflow phases. The two final rounds share the final phase.
      const fraction = (keys: string[]) =>
        keys.filter(k => state(k) === "complete").length / keys.length;
      const learningKeys = [
        ...learning.map(c => c.key),
        `${prefix}:challenge`,
      ];
      const masteryKeys = tests.map(c => c.key);
      const learningPercent = Math.round(100 * fraction(learningKeys));
      const masteryPercent = Math.round(100 * fraction(masteryKeys));
      const percent = Math.round(
        20 *
          (fraction(learning.map(c => c.key)) +
            (challenge === "complete" ? 1 : 0) +
            fraction(u.smalls.map((_, j) => `${prefix}:test:${j + 1}`)) +
            (state(`${prefix}:preliminary`) === "complete" ? 1 : 0) +
            fraction([`${prefix}:final1`, `${prefix}:final2`]))
      );
      return {
        number: i + 1,
        name: u.name,
        cells,
        learn,
        challenge,
        test,
        learningPercent,
        masteryPercent,
        percent,
        complete,
      };
    });
    const termCells = units.flatMap(u => u.cells);
    const completionRate = (
      selected: typeof termCells
    ) =>
      selected.length
        ? Math.round(
            (selected.filter(cell => cell.state === "complete").length /
              selected.length) *
              100
          )
        : 0;
    return {
      term: c.term,
      units,
      learningPercent: completionRate(
        termCells.filter(
          cell => cell.sector === "learn" || cell.sector === "challenge"
        )
      ),
      masteryPercent: completionRate(
        termCells.filter(cell => cell.sector === "test")
      ),
      percent: Math.round(
        units.reduce((n, u) => n + u.percent, 0) / units.length
      ),
    };
  });
  const allCells = terms.flatMap(term =>
    term.units.flatMap(unit => unit.cells)
  );
  const completionRate = (
    selected: typeof allCells
  ) =>
    selected.length
      ? Math.round(
          (selected.filter(cell => cell.state === "complete").length /
            selected.length) *
            100
        )
      : 0;
  return {
    terms,
    learningPercent: completionRate(
      allCells.filter(
        cell => cell.sector === "learn" || cell.sector === "challenge"
      )
    ),
    masteryPercent: completionRate(
      allCells.filter(cell => cell.sector === "test")
    ),
    percent: terms.length
      ? Math.round(terms.reduce((n, t) => n + t.percent, 0) / terms.length)
      : 0,
    unmatched,
  };
}
export type MathProgress = ReturnType<typeof calculateMathProgress>;

export type RecentLearningStats = {
  deltaPercent: number;
  learningSessions: number;
  perSession: number | null;
  sufficientData: boolean;
  estimatedCompletionDate: string | null;
};

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function countsAsLearningSession(row: ProgressJournal) {
  if (row.isDraft || !row.content?.trim() || /재수강/.test(row.content))
    return false;
  return parseHeaders(row.content).some(
    header =>
      header.basic &&
      header.small !== null &&
      validHeader(header) !== null
  );
}

export function calculateRecentLearningStats(
  journals: ProgressJournal[],
  grade: string,
  currentLearningPercent: number,
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
): RecentLearningStats {
  const startDate = shiftDate(today, -28);
  const historicalRows = journals.filter(
    row => !row.isDraft && row.journalDate <= startDate && row.content?.trim()
  );
  const historicalBaseline = createProgressBaseline(historicalRows, grade);
  const historicalProgress = calculateMathProgress([], [], startDate, {
    baseline: historicalBaseline,
    grade,
  });
  const deltaPercent = Math.max(
    0,
    currentLearningPercent - historicalProgress.learningPercent
  );
  const learningSessions = new Set(
    journals
      .filter(
        row =>
          row.journalDate > startDate &&
          row.journalDate <= today &&
          countsAsLearningSession(row)
      )
      .map(row => row.journalDate)
  ).size;
  const perSession =
    learningSessions > 0
      ? Math.round((deltaPercent / learningSessions) * 100) / 100
      : null;
  const sufficientData = learningSessions >= 5 && deltaPercent > 0;
  let estimatedCompletionDate: string | null = null;
  if (currentLearningPercent >= 100) estimatedCompletionDate = today;
  else if (sufficientData) {
    const days = Math.ceil(
      ((100 - currentLearningPercent) / deltaPercent) * 28
    );
    if (Number.isFinite(days) && days > 0 && days <= 365)
      estimatedCompletionDate = shiftDate(today, days);
  }
  return {
    deltaPercent,
    learningSessions,
    perSession,
    sufficientData,
    estimatedCompletionDate,
  };
}
