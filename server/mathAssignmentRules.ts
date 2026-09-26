export type GradingRule = "value" | "ratio" | "exact";

function normalizedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").replace(/[−–—]/g, "-").replace(/[：]/g, ":").replace(/[／]/g, "/").replace(/[，]/g, ",");
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

type Fraction = { numerator: bigint; denominator: bigint };
function fraction(raw: string): Fraction | null {
  const value = normalizedText(raw).replace(/,/g, "");
  const match = /^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/.exec(value);
  if (!match) return null;
  const decimal = (part: string): Fraction => {
    const negative = part.startsWith("-");
    const unsigned = part.replace(/^[+-]/, "");
    const [whole, decimals = ""] = unsigned.split(".");
    const denominator = 10n ** BigInt(decimals.length);
    return { numerator: BigInt(`${negative ? "-" : ""}${whole}${decimals}`), denominator };
  };
  const left = decimal(match[1]);
  const right = match[2] ? decimal(match[2]) : { numerator: 1n, denominator: 1n };
  if (right.numerator === 0n) return null;
  let numerator = left.numerator * right.denominator;
  let denominator = left.denominator * right.numerator;
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function numericWithUnit(raw: string): { value: Fraction; unit: string } | null {
  const value = normalizedText(raw);
  for (let end = value.length; end > 0; end--) {
    const number = fraction(value.slice(0, end));
    if (number) {
      const unit = value.slice(end);
      return /^(?:|cm|cm2|cm3|°|m|개|km|배|분|원|명|팀|가지)$/.test(unit)
        ? { value: number, unit } : null;
    }
  }
  return null;
}

function ratio(raw: string): Fraction[] | null {
  const parts = normalizedText(raw).split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const values = parts.map(fraction);
  return values.every((part): part is Fraction => part !== null) && values.some(part => part!.numerator !== 0n)
    ? values as Fraction[] : null;
}

export function isSupportedAnswerKey(answerType: "choice" | "numeric", key: string, rule: GradingRule): boolean {
  if (answerType === "choice") return rule === "exact" && /^[1-5]$/.test(normalizeChoice(key) ?? "");
  if (rule === "ratio") return ratio(key) !== null;
  return numericWithUnit(key) !== null;
}

export function normalizeChoice(raw: string): string | null {
  const value = normalizedText(raw);
  const circles: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
  return /^[1-5]$/.test(value) ? value : circles[raw.trim()] ?? null;
}

export function gradeAnswer(input: {
  answerType: "choice" | "numeric";
  answerKey: string;
  submittedAnswer: string;
  gradingRule: GradingRule;
  exactForm: boolean;
}): boolean {
  if (!input.submittedAnswer.trim()) return false;
  if (input.answerType === "choice") {
    const expected = normalizeChoice(input.answerKey);
    return expected !== null && expected === normalizeChoice(input.submittedAnswer);
  }
  const key = normalizedText(input.answerKey);
  const submitted = normalizedText(input.submittedAnswer);
  if (input.exactForm || input.gradingRule === "exact") return key === submitted;
  if (input.gradingRule === "ratio") {
    const a = ratio(key); const b = ratio(submitted);
    if (!a || !b || a.length !== b.length) return false;
    const pivot = a.findIndex(part => part.numerator !== 0n);
    if (pivot < 0 || b[pivot].numerator === 0n) return false;
    return a.every((part, index) =>
      part.numerator * b[pivot].numerator * b[index].denominator * a[pivot].denominator ===
      b[index].numerator * a[pivot].numerator * part.denominator * b[pivot].denominator
    );
  }
  const a = numericWithUnit(key); const b = numericWithUnit(submitted);
  return !!a && !!b && a.unit === b.unit && a.value.numerator === b.value.numerator && a.value.denominator === b.value.denominator;
}
