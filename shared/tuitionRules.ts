export const tuitionSchoolLevels = ["elementary", "middle", "high"] as const;
export type TuitionSchoolLevel = typeof tuitionSchoolLevels[number];
export type TuitionMode = "automatic" | "manual";

export type TuitionStandardValue = {
  schoolLevel: string;
  monthlySessionCount: number;
  subjectCountTier: number;
  tuition: number;
};

export type AutomaticTuitionMatch = {
  schoolLevel: TuitionSchoolLevel;
  monthlySessionCount: number;
  subjectCountTier: number;
  tuition: number;
  label: string;
};

export function getTuitionSchoolLevel(grade: string): TuitionSchoolLevel {
  const normalized = grade.trim();
  if (normalized.startsWith("고")) return "high";
  if (normalized.startsWith("중")) return "middle";
  return "elementary";
}

export function getMonthlySessionCount(registrationCount: number) {
  return Math.round(registrationCount * 4);
}

export function getSubjectCountTier(schoolLevel: TuitionSchoolLevel, subjectCount: number) {
  return schoolLevel === "elementary" ? 0 : subjectCount <= 1 ? 1 : 2;
}

export function getAutomaticTuitionMatch(
  grade: string,
  registrationCount: number,
  subjectCount: number,
  standards: TuitionStandardValue[],
): AutomaticTuitionMatch | null {
  if (subjectCount < 1) return null;
  const schoolLevel = getTuitionSchoolLevel(grade);
  const monthlySessionCount = getMonthlySessionCount(registrationCount);
  const subjectCountTier = getSubjectCountTier(schoolLevel, subjectCount);
  const standard = standards.find(item => (
    item.schoolLevel === schoolLevel
    && Number(item.monthlySessionCount) === monthlySessionCount
    && Number(item.subjectCountTier) === subjectCountTier
  ));
  if (!standard) return null;
  const schoolLabel = schoolLevel === "elementary" ? "초등학생" : schoolLevel === "middle" ? "중학생" : "고등학생";
  const subjectLabel = schoolLevel === "elementary" ? "5과목 패키지" : subjectCountTier === 1 ? "1과목" : "2과목 이상";
  return {
    schoolLevel,
    monthlySessionCount,
    subjectCountTier,
    tuition: Number(standard.tuition),
    label: `${schoolLabel} · ${subjectLabel} · 월 ${monthlySessionCount}회`,
  };
}
