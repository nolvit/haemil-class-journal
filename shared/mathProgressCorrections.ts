import { createProgressBaseline, type ProgressJournal } from "./mathProgress";
export const mathProgressCorrectionPlans = [
  {
    key: "2026-09-22-kimhwarang-mon-v1",
    name: "김화랑",
    exactDate: "2026-09-21",
  },
  {
    key: "2026-09-22-moonminseo-tue-v1",
    name: "문민서",
    exactDate: "2026-09-22",
  },
  {
    key: "2026-09-22-jeonyuchan-fri-v1",
    name: "전유찬",
    exactDate: "2026-09-18",
  },
  {
    key: "2026-09-22-hanjaebeom-term-v1",
    name: "한재범",
    termOverride: "중1-1",
  },
] as const;
export type MathProgressCorrectionPlan = {
  key: string;
  name: string;
  exactDate?: string;
  termOverride?: string;
};
export function resolveCorrectionStudent<
  T extends { id: number; name: string },
>(roster: T[], name: string) {
  const matches = roster.filter(s => s.name.trim() === name);
  if (matches.length !== 1)
    throw new Error(
      `진행도 기준 정정: ${name} 학생이 ${matches.length}명입니다. 대상을 확인해 주세요.`
    );
  return matches[0];
}
export function correctedProgressBaseline(
  journals: ProgressJournal[],
  grade: string,
  plan: MathProgressCorrectionPlan
) {
  const result = createProgressBaseline(journals, grade, plan);
  if (!result.sourceId)
    throw new Error(
      `진행도 기준 정정: ${plan.name} ${plan.exactDate ?? "기준일 이전"} 일지가 없습니다.`
    );
  if (!result.recognized)
    throw new Error(
      `진행도 기준 정정: ${plan.name} ${result.sourceDate} 일지의 단원 표기를 확인해 주세요.`
    );
  return result;
}
