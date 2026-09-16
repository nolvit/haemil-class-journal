import type { AttendanceStatus } from "./journalRules";
import { getAttendanceSessionUnits } from "./attendanceSummaryRules";

export type StudentCountPolicy = {
  lessonUnitMultiplier: number;
  lessonUnitEffectiveFrom: string | null;
};

export function normalizeLessonUnitMultiplier(
  value: number | null | undefined
) {
  return Number(value) === 2 ? 2 : 1;
}

export function getLessonUnitMultiplierForPlan(
  grade: string,
  subjectCount: number
) {
  if (grade.trim().startsWith("초")) return 2;
  return subjectCount >= 2 ? 2 : 1;
}

export function getAttendanceCountUnits(
  status: AttendanceStatus | null | undefined,
  journalDate: string,
  policy: StudentCountPolicy
) {
  const multiplier =
    policy.lessonUnitEffectiveFrom &&
    journalDate >= policy.lessonUnitEffectiveFrom
      ? normalizeLessonUnitMultiplier(policy.lessonUnitMultiplier)
      : 1;
  return getAttendanceSessionUnits(status) * multiplier;
}

/** 새 횟수제의 등록 상품 총 횟수. 주 3/4/5회는 14/18/22회이며 2회 단위 상품은 두 배다. */
export function getRegistrationPackageCount(
  weeklyRegistrationCount: number,
  lessonUnitMultiplier: number
) {
  const weekly = Number(weeklyRegistrationCount);
  const base =
    weekly === 3 ? 14 : weekly === 4 ? 18 : weekly === 5 ? 22 : weekly * 4;
  return base * normalizeLessonUnitMultiplier(lessonUnitMultiplier);
}

export function getRemainingTwoClassAlertCount(lessonUnitMultiplier: number) {
  return 2 * normalizeLessonUnitMultiplier(lessonUnitMultiplier);
}

export function getMigratedTotalCount(input: {
  totalCount: number;
  usedCount: number;
  targetMultiplier: number;
}) {
  const remainingCount = input.totalCount - input.usedCount;
  if (remainingCount <= 0) {
    return {
      remainingCount,
      migratedRemainingCount: remainingCount,
      migratedTotalCount: input.totalCount,
    };
  }
  return {
    remainingCount,
    migratedRemainingCount:
      remainingCount * normalizeLessonUnitMultiplier(input.targetMultiplier),
    migratedTotalCount:
      input.usedCount +
      remainingCount * normalizeLessonUnitMultiplier(input.targetMultiplier),
  };
}
