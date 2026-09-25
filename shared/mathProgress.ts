import {
  mathCurriculum,
  mathCurriculumForDate,
  type ProgressState,
  assessmentKeys,
  assessmentLabels,
  MIDDLE3_SECOND_TERM_SWITCH_DATE,
} from "./mathCurriculum";
export type MathJournalEntry = {
  key: string;
  state: "active" | "complete" | "skipped";
};
export type MathJournalPayload = {
  version: 1;
  sessionKind: "math" | "english";
  freeText: string;
  entries: MathJournalEntry[];
};
export type ProgressJournal = {
  id: number;
  content: string | null;
  journalDate: string;
  isDraft: boolean;
  mathProgress?: MathJournalPayload | null;
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
export const progressKeys = Array.from(new Set([
  ...mathCurriculum,
  ...mathCurriculumForDate(MIDDLE3_SECOND_TERM_SWITCH_DATE),
].flatMap(c =>
  c.units.flatMap((u, i) => [
    ...u.smalls.map((_, j) => `${c.term}:${i + 1}:learn:${j + 1}`),
    `${c.term}:${i + 1}:challenge`,
    ...u.smalls.map((_, j) => `${c.term}:${i + 1}:test:${j + 1}`),
    ...assessmentKeys.map(k => `${c.term}:${i + 1}:${k}`),
  ])
)));
const legacyAssessmentKeys = assessmentKeys.filter(k => k !== "practicePreliminary");

export function mathUnitOptions(term: string, unitNumber: number, date: string) {
  const unit = mathCurriculumForDate(date)
    .find(course => course.term === term)?.units[unitNumber - 1];
  if (!unit) return [];
  const prefix = `${term}:${unitNumber}`;
  return [
    ...unit.smalls.map((name, index) => ({
      key: `${prefix}:learn:${index + 1}`,
      label: `${unitNumber}-${index + 1} ${name}`,
      sector: "learn" as const,
    })),
    { key: `${prefix}:challenge`, label: "고난이도 실력문제 풀기", sector: "learn" as const },
    ...unit.smalls.map((_, index) => ({
      key: `${prefix}:test:${index + 1}`,
      label: `${unitNumber}-${index + 1} 소단원 평가`,
      sector: "assessment" as const,
    })),
    ...assessmentKeys.map(key => ({
      key: `${prefix}:${key}`,
      label: assessmentLabels[key],
      sector: "assessment" as const,
    })),
  ];
}

export function mathItemLabel(key: string, date: string) {
  const [term, unit] = key.split(":");
  return mathUnitOptions(term, Number(unit), date).find(item => item.key === key)?.label ?? key;
}

export function formatMathJournalContent(payload: MathJournalPayload, date: string) {
  const selected: string[] = [];
  let previousUnit = "";
  for (const entry of payload.entries) {
    const [term, unit] = entry.key.split(":");
    const label = mathItemLabel(entry.key, date);
    const state = entry.state === "complete" ? "완료" : entry.state === "skipped" ? "건너뜀" : "진행 중";
    const currentUnit = `${term}:${unit}`;
    if (currentUnit !== previousUnit) selected.push(`[${term} / 기본 / ${unit}단원]`);
    selected.push(`${label} · ${state}`);
    previousUnit = currentUnit;
  }
  const englishHeading = payload.sessionKind === "english" &&
    !/(?:^|\n)\s*영어\s*집중/.test(payload.freeText) ? "영어 집중 수업" : "";
  return [englishHeading, ...selected, payload.freeText.trim()]
    .filter(Boolean).join("\n");
}

/**
 * 이미 저장된 선택형 수학 일지의 옛 한 줄 표시만 화면에서 정리한다.
 * 저장 데이터나 1단계 형식의 과거 일지는 바꾸지 않는다.
 */
export function normalizeMathJournalDisplayContent(content: string): string {
  const lines = content.split(/\r?\n/);
  const display: string[] = [];
  const structuredLine = /^(\s*)\[(중[1-3]-[12])\s*\/\s*기본\s*\/\s*(\d+)단원\][ \t]+(.+?)\s*·\s*(완료|건너뜀|진행 중)[ \t]*$/;
  let previousUnit = "";
  let changed = false;

  for (const line of lines) {
    const match = line.match(structuredLine);
    if (!match) {
      display.push(line);
      previousUnit = "";
      continue;
    }
    const unit = `${match[2]}:${match[3]}`;
    if (unit !== previousUnit) display.push(`${match[1]}[${match[2]} / 기본 / ${match[3]}단원]`);
    display.push(`${match[4].trim()} · ${match[5]}`);
    previousUnit = unit;
    changed = true;
  }

  return changed ? display.join("\n") : content;
}
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

export function isEnglishFocusedLesson(content: string) {
  const text = content.normalize("NFKC");
  return (
    /(?:^|\n)\s*(?:-\s*)?영어\s*집중(?:\s*수업)?(?:\s|$)/.test(text) &&
    !/\[\s*중\s*[123]/.test(text)
  );
}

function validHeader(h: ReturnType<typeof parseHeaders>[number], date: string) {
  const c = mathCurriculumForDate(date).find(c => c.term === h.term),
    u = c?.units[h.unit - 1];
  return c &&
    u &&
    (h.small === null || (h.small >= 1 && h.small <= u.smalls.length))
    ? { c, u }
    : null;
}

export type FocusedLearningItem = {
  key: string;
  term: string;
  unit: number;
  small: number;
  label: string;
  startedAt: string;
  journalId?: number;
};

/**
 * 명시적인 재수강/재평가 기록만 날짜와 일지 ID 순으로 적용한다.
 * 정규 과정 상태와 진행률에는 이 결과를 합치지 않는다.
 */
export function calculateFocusedLearning(
  journals: ProgressJournal[],
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
): FocusedLearningItem[] {
  const active = new Map<string, FocusedLearningItem>();
  const ordered = [...journals]
    .filter(
      row =>
        !row.isDraft && row.journalDate <= today && Boolean(row.content?.trim())
    )
    .sort((a, b) => a.journalDate.localeCompare(b.journalDate) || a.id - b.id);

  for (const row of ordered) {
    for (const header of parseHeaders(row.content ?? "")) {
      if (!header.basic) continue;
      const valid = validHeader(header, today);
      if (!valid) continue;
      const events = Array.from(
        header.body.matchAll(/(\d+)\s*-\s*(\d+)\s*소단원\s*(재수강|재평가)/g)
      );
      for (const event of events) {
        const unit = Number(event[1]);
        const small = Number(event[2]);
        if (unit !== header.unit || small < 1 || small > valid.u.smalls.length)
          continue;
        const key = `${header.term}:${unit}:${small}`;
        if (event[3] === "재평가") {
          active.delete(key);
          continue;
        }
        active.set(key, {
          key,
          term: header.term,
          unit,
          small,
          label: `${unit}-${small} ${valid.u.smalls[small - 1]}`,
          startedAt: row.journalDate,
          journalId: row.id,
        });
      }
    }
  }

  return Array.from(active.values()).sort(
    (a, b) =>
      a.term.localeCompare(b.term, "ko") || a.unit - b.unit || a.small - b.small
  );
}
function emptyStates() {
  return Object.fromEntries(
    progressKeys.map(k => [k, "waiting" as ProgressState])
  );
}
function applyRecord(
  row: ProgressJournal,
  automatic: Record<string, ProgressState>,
  allowedTerms: Set<string>,
  date: string
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
    if (!mathCurriculumForDate(date).some(c => c.term === h.term)) {
      invalid = true;
      continue;
    }
    if (!allowedTerms.has(h.term)) {
      ignored = true;
      continue;
    }
    const valid = validHeader(h, date);
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
      ...legacyAssessmentKeys.map(k => `${prefix}:${k}`),
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
    const hasPracticePreliminary = /실력\s*문제\s*예비\s*평가/.test(body);
    if (hasPracticePreliminary) {
      mark(`${prefix}:practicePreliminary`, "complete");
      recognized = true;
      headerRecognized = true;
    }
    // The new assessment must not also count as the old challenge or preliminary.
    const ordinaryBody = body.replace(/실력\s*문제\s*예비\s*평가/g, "");
    if (
      /(?:고난[이]?도\s*(?:실력)?\s*문제|실력\s*(?:문제|향상)|고난도|고난이도)/.test(
        ordinaryBody
      )
    )
      reach(
        `${prefix}:challenge`,
        /(?:고난[이]?도|실력).*?(?:완료|마침)/.test(ordinaryBody)
          ? "complete"
          : "active"
      );
    for (const e of Array.from(
      ordinaryBody.matchAll(/(\d+)\s*-\s*(\d+)\s*소단원\s*평가/g)
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
      if (re.test(ordinaryBody)) reach(`${prefix}:${key}`, "complete");
    // A plain final assessment denotes the first final round; no second-round assumption.
    if (/최종\s*평가/.test(ordinaryBody) && !/[12]\s*차\s*최종\s*평가/.test(ordinaryBody))
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
  options: {
    exactDate?: string;
    termOverride?: string;
    snapshotDate?: string;
  } = {}
): ProgressBaseline {
  const snapshotDate = options.snapshotDate ?? BASELINE_DATE;
  const source = [...journals]
    .filter(
      r =>
        !r.isDraft &&
        (options.exactDate
          ? r.journalDate === options.exactDate
          : r.journalDate <= snapshotDate) &&
        r.content?.trim() &&
        !isEnglishFocusedLesson(r.content)
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
        .filter(h => h.grade === initialGrade && validHeader(h, snapshotDate))
        .map(h => h.term)
    )
  );
  const states = emptyStates();
  const allowed = new Set(
    mathCurriculumForDate(snapshotDate)
      .filter(c => Number(c.term[1]) === initialGrade)
      .map(c => c.term)
  );
  const result = parsedSource
    ? applyRecord(parsedSource, states, allowed, snapshotDate)
    : null;
  return {
    terms,
    cutoffEntries: Object.fromEntries(
      journals
        .filter(r => r.journalDate === (options.snapshotDate ?? BASELINE_DATE))
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
  _baseline: ProgressBaseline | undefined,
  _today: string
) {
  // Both current middle-3 students and students promoted from middle-2 use
  // the dated middle-3 curriculum. High-school graduates remain excluded.
  return middleGrade(grade) !== 4;
}
export function calculateMathProgress(
  journals: ProgressJournal[],
  overrides: ProgressOverride[] = [],
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  options: { baseline?: ProgressBaseline; grade?: string } = {}
) {
  const baseline = options.baseline;
  const focusedLearning = calculateFocusedLearning(journals, today);
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
      for (const entry of row.mathProgress?.entries ?? []) {
        const term = entry.key.split(":")[0];
        if (term && Number(term[1]) >= (baseline.initialGrade ?? 1) &&
            Number(term[1]) <= (currentGrade ?? 3) &&
            mathCurriculumForDate(today).some(course => course.term === term))
          trackedTerms.add(term);
      }
      if (row.mathProgress) continue;
      for (const h of parseHeaders(row.content ?? ""))
        if (
          h.basic &&
          h.grade >= (baseline.initialGrade ?? 1) &&
          h.grade <= (currentGrade ?? 3) &&
          validHeader(h, today)
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
    const gradeCourses = mathCurriculumForDate(today).filter(
      c => Number(c.term[1]) === currentGrade
    );
    // Retain the promoted middle-2 cohort's middle-3 first-semester start.
    // A student already in middle-3 starts in the actual school-year semester.
    const alreadyMiddle3 = currentGrade === 3 && baseline.initialGrade === 3;
    const secondSemester = Number(today.slice(5, 7)) >= 7;
    const startingCourse = currentGrade === 3
      ? (alreadyMiddle3 && secondSemester ? gradeCourses.at(-1) : gradeCourses[0])
      : gradeCourses.at(-1);
    if (startingCourse) trackedTerms.add(startingCourse.term);
  }
  const curriculum = mathCurriculumForDate(today).filter(
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
  if (
    baseline?.sourceId &&
    !baseline.recognized &&
    !isEnglishFocusedLesson(baseline.sourceText ?? "")
  )
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
      (baseline && isCoveredByBaseline(row, baseline))
    )
      continue;
    if (row.mathProgress) continue;
    if (!row.content?.trim() || isEnglishFocusedLesson(row.content)) continue;
    const result = applyRecord(row, automatic, allowed, today);
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
  // Grandfather only units already complete according to historical journals.
  // Structured entries never trigger inferred completion of this new step.
  for (const course of curriculum)
    course.units.forEach((unit, index) => {
      const prefix = `${course.term}:${index + 1}`;
      const historicalKeys = [
        ...unit.smalls.map((_, small) => `${prefix}:learn:${small + 1}`),
        `${prefix}:challenge`,
        ...unit.smalls.map((_, small) => `${prefix}:test:${small + 1}`),
        ...legacyAssessmentKeys.map(key => `${prefix}:${key}`),
      ];
      if (historicalKeys.every(key => automatic[key] === "complete"))
        automatic[`${prefix}:practicePreliminary`] = "complete";
    });
  for (const row of [...journals].sort((a, b) =>
    a.journalDate.localeCompare(b.journalDate) || a.id - b.id
  )) {
    if (row.isDraft || row.journalDate > today ||
        (baseline && isCoveredByBaseline(row, baseline)) ||
        row.mathProgress?.sessionKind !== "math") continue;
    for (const entry of row.mathProgress.entries)
      if (allowed.has(entry.key.split(":")[0]) && entry.key in automatic)
        automatic[entry.key] = entry.state;
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
          label: k === "practicePreliminary" ? assessmentLabels[k] : k,
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
      const fraction = (keys: string[]) =>
        keys.filter(k => state(k) === "complete").length / keys.length;
      const learningKeys = [...learning.map(c => c.key), `${prefix}:challenge`];
      const masteryKeys = tests.map(c => c.key);
      const learningPercent = Math.round(100 * fraction(learningKeys));
      const masteryPercent = Math.round(100 * fraction(masteryKeys));
      const percent = Math.round(100 * fraction(cells.map(c => c.key)));
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
    const completionRate = (selected: typeof termCells) =>
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
      percent: completionRate(termCells),
    };
  });
  const allCells = terms.flatMap(term =>
    term.units.flatMap(unit => unit.cells)
  );
  const completionRate = (selected: typeof allCells) =>
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
    percent: completionRate(allCells),
    unmatched,
    focusedLearning,
  };
}
export type MathProgress = ReturnType<typeof calculateMathProgress>;

export type RecentCourseStats = {
  courseDeltaPercent: number;
  learningDeltaPercent: number;
  assessmentDeltaPercent: number;
  coursePointsPerSession: number | null;
  mathSessionDays: number;
  learningSessionDays: number;
  assessmentSessionDays: number;
  learningStepsGained: number;
  assessmentStepsGained: number;
  remainingLearningSteps: number;
  remainingAssessmentSteps: number;
  sufficientPaceData: boolean;
  estimatedCompletionSessions: number | null;
  estimatedCompletionDate: string | null;
  hasSkipped: boolean;
};

/** Kept for installed PWAs that still run the previous client bundle. */
export type LegacyRecentLearningStats = {
  deltaPercent: number;
  deltaSteps: number;
  learningSessions: number;
  stepsPerSession: number | null;
  remainingSteps: number;
  estimatedLearningSessions: number | null;
  sufficientData: boolean;
  estimatedCompletionDate: string | null;
};

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mathSessionKinds(row: ProgressJournal, today: string) {
  if (row.mathProgress) {
    if (row.isDraft || row.mathProgress.sessionKind !== "math" ||
        (!row.content?.trim() && !row.mathProgress.entries.length)) return null;
    const hasLearning = row.mathProgress.entries.some(entry =>
      /:learn:|:challenge$/.test(entry.key));
    const hasAssessment = row.mathProgress.entries.some(entry =>
      /:test:|:preliminary$|:practicePreliminary$|:final[12]$/.test(entry.key));
    return { learning: hasLearning || !hasAssessment, assessment: hasAssessment };
  }
  if (
    row.isDraft ||
    !row.content?.trim() ||
    isEnglishFocusedLesson(row.content)
  )
    return null;
  let learning = false;
  let assessment = false;
  // Remedial learning and reassessment still consume a math class day even
  // when they do not complete a new curriculum cell.
  for (const header of parseHeaders(row.content)) {
    if (!header.basic || !validHeader(header, today)) continue;
    const body = header.body
      .split("\n")
      .filter(
        line => !/(?:예정|미실시|미완료|진행\s*전|평가\s*대기)/.test(line)
      )
      .join("\n");
    const hasAssessment =
      /(?:\d+\s*-\s*\d+\s*소단원\s*(?:재)?평가|(?:중단원\s*|실력\s*문제\s*)?예비\s*평가|(?:[12]\s*차\s*)?최종\s*평가)/.test(
        body
      );
    if (hasAssessment) assessment = true;
    if (!hasAssessment && (header.small !== null || Boolean(body.trim())))
      learning = true;
  }
  return learning || assessment ? { learning, assessment } : null;
}

export function isMathProgressSession(row: ProgressJournal, today: string) {
  return mathSessionKinds(row, today) !== null;
}

function countsAsLegacyLearningSession(row: ProgressJournal, today: string) {
  if (row.mathProgress)
    return mathSessionKinds(row, today)?.learning ?? false;
  if (
    row.isDraft ||
    !row.content?.trim() ||
    /재수강/.test(row.content) ||
    isEnglishFocusedLesson(row.content)
  )
    return false;
  return parseHeaders(row.content).some(
    header =>
      header.basic &&
      validHeader(header, today) !== null &&
      (header.small !== null || Boolean(header.body.trim()))
  );
}

function progressSnapshot(progress: MathProgress, reference: MathProgress) {
  // Both dates use today's tracked cells as their denominator. A newly added
  // term must not make the historical percentage appear artificially high.
  const completed = new Set(
    progress.terms.flatMap(term =>
      term.units.flatMap(unit =>
        unit.cells
          .filter(cell => cell.state === "complete")
          .map(cell => cell.key)
      )
    )
  );
  const cells = reference.terms.flatMap(term =>
    term.units.flatMap(unit => unit.cells)
  );
  const learningCells = cells.filter(
    cell => cell.sector === "learn" || cell.sector === "challenge"
  );
  const assessmentCells = cells.filter(cell => cell.sector === "test");
  const coursePercent = cells.length
    ? (100 * cells.filter(cell => completed.has(cell.key)).length) / cells.length
    : 0;
  return {
    coursePercent,
    learningComplete: learningCells.filter(cell => completed.has(cell.key))
      .length,
    learningTotal: learningCells.length,
    assessmentComplete: assessmentCells.filter(cell => completed.has(cell.key))
      .length,
    assessmentTotal: assessmentCells.length,
  };
}

export function estimateCompletionDateBySchedule(
  today: string,
  requiredSessions: number,
  scheduleWeekdays: number[],
  blockedDates: Iterable<string> = []
) {
  if (requiredSessions <= 0) return today;
  const weekdays = new Set(
    scheduleWeekdays.filter(
      day => Number.isInteger(day) && day >= 0 && day <= 6
    )
  );
  if (!weekdays.size) return null;
  const blocked = new Set(blockedDates);
  let remaining = requiredSessions;
  for (let offset = 1; offset <= 365; offset++) {
    const date = shiftDate(today, offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!weekdays.has(weekday) || blocked.has(date)) continue;
    remaining--;
    if (remaining <= 0) return date;
  }
  return null;
}

export function calculateRecentCourseStats(
  journals: ProgressJournal[],
  grade: string,
  currentProgress: MathProgress,
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  forecast: {
    scheduleWeekdays?: number[];
    blockedDates?: Iterable<string>;
  } = {},
  baseline?: ProgressBaseline
): RecentCourseStats {
  const startDate = shiftDate(today, -28);
  const historicalRows = journals.filter(
    row => !row.isDraft && row.journalDate <= startDate && row.content?.trim()
  );
  let historicalBaseline = baseline;
  if (startDate < BASELINE_DATE || !historicalBaseline) {
    historicalBaseline = createProgressBaseline([], grade, { snapshotDate: startDate });
    // A math-group journal can legitimately record an English-only lesson.
    // Keep the last recognizable legacy state instead of resetting the snapshot.
    for (const row of [...historicalRows].sort(
      (a, b) => b.journalDate.localeCompare(a.journalDate) || b.id - a.id
    )) {
      if (row.mathProgress) continue;
      const candidate = createProgressBaseline([row], grade, {
        snapshotDate: startDate,
      });
      if (candidate.recognized) {
        historicalBaseline = candidate;
        break;
      }
    }
  }
  // Staff corrections are not new lessons. Apply the current corrections to
  // both snapshots so they cannot create artificial four-week gains.
  const currentOverrides = currentProgress.terms.flatMap(term =>
    term.units.flatMap(unit =>
      unit.cells.flatMap(cell => (cell.override ? [cell.override] : []))
    )
  );
  const historicalProgress = calculateMathProgress(
    startDate >= BASELINE_DATE && baseline ? historicalRows : [],
    currentOverrides,
    startDate,
    {
      baseline: historicalBaseline,
      grade,
    }
  );
  const current = progressSnapshot(currentProgress, currentProgress);
  const historical = progressSnapshot(historicalProgress, currentProgress);
  const roundPercent = (value: number) => Math.round(value * 10) / 10;
  const learningStepsGained = Math.max(
    0,
    current.learningComplete - historical.learningComplete
  );
  const assessmentStepsGained = Math.max(
    0,
    current.assessmentComplete - historical.assessmentComplete
  );
  const remainingLearningSteps =
    current.learningTotal - current.learningComplete;
  const remainingAssessmentSteps =
    current.assessmentTotal - current.assessmentComplete;
  const courseDelta = Math.max(
    0,
    current.coursePercent - historical.coursePercent
  );
  const mathDays = new Set<string>();
  const learningDays = new Set<string>();
  const assessmentDays = new Set<string>();
  for (const row of journals) {
    if (row.journalDate <= startDate || row.journalDate > today) continue;
    const kinds = mathSessionKinds(row, today);
    if (!kinds) continue;
    mathDays.add(row.journalDate);
    if (kinds.learning) learningDays.add(row.journalDate);
    if (kinds.assessment) assessmentDays.add(row.journalDate);
  }
  const mathSessionDays = mathDays.size;
  const learningSessionDays = learningDays.size;
  const assessmentSessionDays = assessmentDays.size;
  const coursePointsPerSession =
    mathSessionDays > 0 && courseDelta > 0
      ? courseDelta / mathSessionDays
      : null;
  const sufficientPaceData =
    mathSessionDays >= 5 && coursePointsPerSession !== null;
  const sessionsNeeded = (remaining: number, gained: number, observedDays: number) =>
    remaining === 0 ? 0 : gained > 0 && observedDays >= 2
      ? Math.ceil((remaining * observedDays) / gained) : null;
  const learningNeeded = sessionsNeeded(remainingLearningSteps, learningStepsGained, learningSessionDays);
  const assessmentNeeded = sessionsNeeded(remainingAssessmentSteps, assessmentStepsGained, assessmentSessionDays);
  const remainingItems = remainingLearningSteps + remainingAssessmentSteps;
  const hasSkipped = currentProgress.terms.some(term => term.units.some(unit =>
    unit.cells.some(cell => cell.state === "skipped")));
  const estimatedCompletionSessions = hasSkipped
    ? null
    : remainingItems === 0
      ? 0
      : learningNeeded !== null && assessmentNeeded !== null
        ? learningNeeded + assessmentNeeded
        : null;
  const estimatedCompletionDate =
    current.learningTotal + current.assessmentTotal > 0 &&
    remainingItems === 0 && !hasSkipped
      ? today
      : estimatedCompletionSessions !== null &&
          forecast.scheduleWeekdays?.length
        ? estimateCompletionDateBySchedule(
            today,
            estimatedCompletionSessions,
            forecast.scheduleWeekdays,
            forecast.blockedDates
          )
        : null;
  return {
    courseDeltaPercent: roundPercent(courseDelta),
    learningDeltaPercent: Math.round(
      (100 * learningStepsGained) / (current.learningTotal || 1)
    ),
    assessmentDeltaPercent: Math.round(
      (100 * assessmentStepsGained) / (current.assessmentTotal || 1)
    ),
    coursePointsPerSession,
    mathSessionDays,
    learningSessionDays,
    assessmentSessionDays,
    learningStepsGained,
    assessmentStepsGained,
    remainingLearningSteps,
    remainingAssessmentSteps,
    sufficientPaceData,
    estimatedCompletionSessions,
    estimatedCompletionDate,
    hasSkipped,
  };
}

export function calculateLegacyRecentLearningStats(
  recentCourse: RecentCourseStats,
  journals: ProgressJournal[],
  currentProgress: MathProgress,
  today: string,
  forecast: {
    scheduleWeekdays?: number[];
    blockedDates?: Iterable<string>;
  } = {}
): LegacyRecentLearningStats {
  const startDate = shiftDate(today, -28);
  const learningSessions = new Set(
    journals
      .filter(
        row =>
          row.journalDate > startDate &&
          row.journalDate <= today &&
          countsAsLegacyLearningSession(row, today)
      )
      .map(row => row.journalDate)
  ).size;
  const stepsPerSession =
    learningSessions > 0 && recentCourse.learningStepsGained > 0
      ? Math.round(
          (recentCourse.learningStepsGained / learningSessions) * 100
        ) / 100
      : null;
  const sufficientData = learningSessions >= 5 && stepsPerSession !== null;
  const estimatedLearningSessions =
    recentCourse.remainingLearningSteps === 0
      ? 0
      : sufficientData
        ? Math.ceil(recentCourse.remainingLearningSteps / stepsPerSession!)
        : null;
  return {
    deltaPercent: recentCourse.learningDeltaPercent,
    deltaSteps: recentCourse.learningStepsGained,
    learningSessions,
    stepsPerSession,
    remainingSteps: recentCourse.remainingLearningSteps,
    estimatedLearningSessions,
    sufficientData,
    estimatedCompletionDate:
      currentProgress.learningPercent >= 100
        ? today
        : estimatedLearningSessions !== null &&
            forecast.scheduleWeekdays?.length
          ? estimateCompletionDateBySchedule(
              today,
              estimatedLearningSessions,
              forecast.scheduleWeekdays,
              forecast.blockedDates
            )
          : null,
  };
}
