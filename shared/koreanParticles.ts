export function withEuroRo(value: string) {
  const trimmed = value.trim();
  const last = trimmed.charCodeAt(trimmed.length - 1);
  if (!trimmed || last < 0xac00 || last > 0xd7a3) return `${trimmed}으로`;
  const finalConsonant = (last - 0xac00) % 28;
  return `${trimmed}${finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로"}`;
}
