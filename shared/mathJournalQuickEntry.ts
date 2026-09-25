import { mathUnitOptions, type MathJournalEntry } from "./mathProgress";

export type MathReviewSuggestion = {
  key: string;
  term: string;
  unit: number;
  label: string;
};

/** Completed evaluations can suggest review lessons without changing course completion. */
export function getMathReviewSuggestions(entries: readonly MathJournalEntry[], date: string): MathReviewSuggestion[] {
  const suggestions = new Map<string, MathReviewSuggestion>();
  for (const entry of entries) {
    if (entry.state !== "complete") continue;
    const [term, unitText, kind, smallText] = entry.key.split(":");
    const unit = Number(unitText);
    if (!term || !Number.isInteger(unit) || !mathUnitOptions(term, unit, date).some(option => option.key === entry.key)) continue;
    const label = kind === "test" && /^[1-9]\d*$/.test(smallText ?? "")
      ? `${unit}-${Number(smallText)} 소단원 재수강`
      : kind === "preliminary" ? "중단원 재수강" : null;
    if (!label) continue;
    const key = `${term}:${unit}:${label}`;
    suggestions.delete(key);
    suggestions.set(key, { key, term, unit, label });
  }
  return Array.from(suggestions.values()).slice(-3).reverse();
}

/** Insert a review lesson under the right title; the review line is not a progress cell. */
export function appendMathReviewText(
  freeText: string,
  entries: readonly MathJournalEntry[],
  suggestion: MathReviewSuggestion,
) {
  const text = freeText.trimEnd();
  const headers = Array.from(text.matchAll(/\[\s*(중[1-3]-[1-2])\s*\/\s*(?:기본|1\s*단계)\s*\/\s*(\d+)단원\s*\]/g));
  const lastHeader = headers.at(-1);
  const selectedKey = entries.at(-1)?.key.split(":");
  const lastUnit = lastHeader
    ? `${lastHeader[1]}:${lastHeader[2]}`
    : selectedKey ? `${selectedKey[0]}:${selectedKey[1]}` : null;
  const targetUnit = `${suggestion.term}:${suggestion.unit}`;
  if (lastUnit === targetUnit && text.split(/\r?\n/).at(-1)?.trim() === suggestion.label) return text;
  const header = lastUnit === targetUnit ? "" : `[${suggestion.term} / 기본 / ${suggestion.unit}단원]\n`;
  return [text, `${header}${suggestion.label}`].filter(Boolean).join("\n");
}
