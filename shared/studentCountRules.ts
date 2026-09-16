import { getRegistrationPackageCount } from "./studentCountPolicy";

export function getRegistrationCountPreview(
  totalCount: number,
  registrationCount: number,
  lessonUnitMultiplier = 1
) {
  const beforeTotalCount = Math.max(0, totalCount);
  const addedCount = getRegistrationPackageCount(
    Math.max(0, registrationCount),
    lessonUnitMultiplier
  );
  return {
    beforeTotalCount,
    addedCount,
    afterTotalCount: beforeTotalCount + addedCount,
  };
}
