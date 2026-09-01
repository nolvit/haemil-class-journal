export function getRegistrationCountPreview(totalCount: number, registrationCount: number, multiplier = 4) {
  const beforeTotalCount = Math.max(0, totalCount);
  const addedCount = Math.max(0, registrationCount) * multiplier;
  return {
    beforeTotalCount,
    addedCount,
    afterTotalCount: beforeTotalCount + addedCount,
  };
}
