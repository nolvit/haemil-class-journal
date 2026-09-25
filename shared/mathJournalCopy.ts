import { mathCurriculumForDate } from "./mathCurriculum";
import { mathUnitOptions, type MathJournalEntry } from "./mathProgress";

type Header = { term: string; unit: number; small: number | null };
type CopySuggestion = { entries: MathJournalEntry[]; freeText: string };
type ItemMatch = { key: string; state: MathJournalEntry["state"]; scheduled: boolean };

/** A new lesson continues only unfinished work; completed or skipped work stays on its original date. */
export function carryForwardMathJournalEntries(entries: readonly MathJournalEntry[], date: string): MathJournalEntry[] {
  const seen = new Set<string>();
  return entries.filter(entry => {
    if (entry.state !== "active" || seen.has(entry.key)) return false;
    const [term, unit] = entry.key.split(":");
    if (!mathUnitOptions(term!, Number(unit), date).some(option => option.key === entry.key)) return false;
    seen.add(entry.key);
    return true;
  }).map(entry => ({ ...entry }));
}

const HEADER_LIKE = /^\s*\[\s*중\s*[123]\s*[-–−—]/;
const HEADER = /^\s*\[\s*중\s*([123])\s*-\s*([12])\s*\/\s*(?:기본(?:\s*과정)?|1\s*단계)\s*\/\s*(\d+)\s*(?:-\s*(\d+))?\s*단원\s*\]\s*(.*)$/;
const SCHEDULED = /(?:\s*[·:\-]\s*|\s*\(\s*|\s+)(?:예정|미실시|미완료|진행\s*전|평가\s*대기)\s*\)?\s*$/;
const STATUS = /(?:\s*[·:\-]\s*|\s*\(\s*|\s+)(진행\s*중|완료|건너뜀)\s*\)?\s*$/;
const ITEM_LIKE = /^\d+\s*-\s*\d+\s+|(?:실력\s*문제\s*예비\s*평가|중단원\s*예비\s*평가|[12]\s*차\s*최종\s*평가|소단원\s*평가|고난[이]?도\s*실력\s*문제)/;

function normalized(value: string) {
  return value.normalize("NFKC").replace(/[–−—]/g, "-");
}

function comparable(value: string) {
  return normalized(value).replace(/\s+/g, "").trim();
}

function parseState(value: string): MathJournalEntry["state"] {
  return value === "완료" ? "complete" : value === "건너뜀" ? "skipped" : "active";
}

/**
 * Suggest only the process items explicitly named in an old math journal.
 * The caller must ask the teacher to confirm the suggestion before saving it.
 */
export function suggestMathJournalCopy(content: string, date: string): CopySuggestion | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !content.trim()) return null;

  const entries = new Map<string, MathJournalEntry>();
  const freeLines: string[] = [];
  const lines = content.split(/\r?\n/);
  let header: Header | null = null;
  let section: string[] = [];
  let sawHeader = false;
  let invalid = false;

  const add = (item: MathJournalEntry) => {
    const previous = entries.get(item.key);
    if (previous && previous.state !== item.state) return false;
    entries.set(item.key, item);
    return true;
  };

  const flush = () => {
    if (!header) {
      freeLines.push(...section);
      section = [];
      return true;
    }
    const options = mathUnitOptions(header.term, header.unit, date);
    if (!options.length) return false;
    const defaultKey = header.small === null
      ? null
      : `${header.term}:${header.unit}:learn:${header.small}`;
    if (defaultKey && !options.some(option => option.key === defaultKey)) return false;
    let defaultState: MathJournalEntry["state"] = "active";
    let defaultScheduled = false;
    let recognized = false;

    const matchItem = (raw: string): ItemMatch[] => {
      let text = normalized(raw).trim();
      const scheduled = SCHEDULED.exec(text);
      if (scheduled) text = text.slice(0, scheduled.index).trim();
      const state = STATUS.exec(text);
      if (state) text = text.slice(0, state.index).trim();
      const target = comparable(text);
      if (!target) return [];
      return options.filter(option => {
        if (comparable(option.label) === target) return true;
        // An old small-unit header often puts only the textbook title on the next line.
        return option.key.includes(":learn:") &&
          comparable(option.label.replace(/^\d+\s*-\s*\d+\s*/, "")) === target;
      }).map(option => ({
        key: option.key,
        state: parseState(state?.[1] ?? ""),
        scheduled: Boolean(scheduled),
      }));
    };

    for (const raw of section) {
      const text = normalized(raw).trim();
      if (defaultKey && /^(진행\s*중|완료|건너뜀)$/.test(text)) {
        defaultState = parseState(text);
        continue;
      }
      if (defaultKey && /^(예정|미실시|미완료|진행\s*전|평가\s*대기)$/.test(text)) {
        defaultScheduled = true;
        freeLines.push(raw);
        continue;
      }
      const matches = matchItem(raw);
      if (matches.length > 1) return false;
      if (matches.length === 1) {
        const item = matches[0];
        if (item.scheduled) {
          if (item.key === defaultKey) defaultScheduled = true;
          freeLines.push(raw);
          continue;
        }
        if (item.key === defaultKey) {
          defaultState = item.state;
          defaultScheduled = false;
        } else if (!add({ key: item.key, state: item.state })) return false;
        recognized = true;
        continue;
      }
      // A numbered or named but unsupported process cannot be safely converted.
      if (ITEM_LIKE.test(text)) return false;
      freeLines.push(raw);
    }
    if (defaultKey && !defaultScheduled) {
      if (!add({ key: defaultKey, state: defaultState })) return false;
      recognized = true;
    }
    section = [];
    return recognized;
  };

  for (const raw of lines) {
    const text = normalized(raw);
    if (!HEADER_LIKE.test(text)) {
      section.push(raw);
      continue;
    }
    if (!flush()) { invalid = true; break; }
    const match = HEADER.exec(text);
    if (!match) { invalid = true; break; }
    const term = `중${match[1]}-${match[2]}`;
    const unit = Number(match[3]);
    const small = match[4] ? Number(match[4]) : null;
    const course = mathCurriculumForDate(date).find(item => item.term === term);
    if (!course?.units[unit - 1] ||
        (small !== null && (small < 1 || small > course.units[unit - 1].smalls.length))) {
      invalid = true;
      break;
    }
    header = { term, unit, small };
    sawHeader = true;
    section = match[5] ? [match[5]] : [];
  }
  if (invalid || !flush() || !sawHeader || !entries.size) return null;
  return { entries: Array.from(entries.values()), freeText: freeLines.join("\n").trim() };
}
