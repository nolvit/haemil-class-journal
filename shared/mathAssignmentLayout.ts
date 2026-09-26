export type MathAnswerSheetVersion = 3 | 4;

/** Records issued before the version column was added use the 40-question sheet. */
export function normalizeAnswerSheetVersion(value: unknown): MathAnswerSheetVersion {
  return Number(value) === 4 ? 4 : 3;
}

export function mathAssignmentRowsPerPageForVersion(version: unknown): number {
  return normalizeAnswerSheetVersion(version) === 4 ? 20 : 40;
}

export const maxMathAssignmentRowsPerPage = 40;
export const maxMathAssignmentPages = Math.ceil(150 / 20);
