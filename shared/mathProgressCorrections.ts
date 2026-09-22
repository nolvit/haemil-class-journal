import {
  createProgressBaseline,
  progressKeys,
  type ProgressBaseline,
  type ProgressJournal,
} from "./mathProgress";
import { mathCurriculum } from "./mathCurriculum";

type ExplicitProgressTarget =
  | {
      term: string;
      unit: number;
      stage: "learning";
      small: number;
    }
  | {
      term: string;
      unit: number;
      stage: "preliminary";
    };

export const mathProgressCorrectionPlans = [
  {
    key: "2026-09-22-kimhwarang-explicit-3-2-learning-v2",
    name: "김화랑",
    exactDate: "2026-09-21",
    target: {
      term: "중2-2",
      unit: 3,
      stage: "learning",
      small: 2,
    },
  },
  {
    key: "2026-09-22-moonminseo-explicit-2-2-learning-v2",
    name: "문민서",
    exactDate: "2026-09-22",
    target: {
      term: "중2-2",
      unit: 2,
      stage: "learning",
      small: 2,
    },
  },
  {
    key: "2026-09-22-jeonyuchan-explicit-unit2-preliminary-v2",
    name: "전유찬",
    exactDate: "2026-09-18",
    target: {
      term: "중2-2",
      unit: 2,
      stage: "preliminary",
    },
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
  target?: ExplicitProgressTarget;
};

function applyExplicitProgressTarget(
  baseline: ProgressBaseline,
  target: ExplicitProgressTarget
): ProgressBaseline {
  const curriculum = mathCurriculum.find(c => c.term === target.term);
  const unit = curriculum?.units[target.unit - 1];
  if (!curriculum || !unit)
    throw new Error(
      `진행도 기준 정정: ${target.term} ${target.unit}단원 목표를 찾을 수 없습니다.`
    );

  const states = { ...baseline.states };
  for (const key of progressKeys)
    if (key.startsWith(`${target.term}:`)) states[key] = "waiting";

  // Earlier major units are fully complete.
  for (let unitNumber = 1; unitNumber < target.unit; unitNumber++)
    for (const key of progressKeys)
      if (key.startsWith(`${target.term}:${unitNumber}:`))
        states[key] = "complete";

  const prefix = `${target.term}:${target.unit}`;
  if (target.stage === "learning") {
    if (target.small < 1 || target.small > unit.smalls.length)
      throw new Error(
        `진행도 기준 정정: ${target.term} ${target.unit}-${target.small} 학습 목표를 찾을 수 없습니다.`
      );
    for (let small = 1; small <= target.small; small++)
      states[`${prefix}:learn:${small}`] = "complete";
  } else {
    unit.smalls.forEach((_, index) => {
      states[`${prefix}:learn:${index + 1}`] = "complete";
      states[`${prefix}:test:${index + 1}`] = "complete";
    });
    states[`${prefix}:challenge`] = "complete";
    states[`${prefix}:preliminary`] = "complete";
    states[`${prefix}:final1`] = "waiting";
    states[`${prefix}:final2`] = "waiting";
  }

  return {
    ...baseline,
    terms: [target.term],
    initialGrade: Number(target.term[1]),
    states,
    recognized: true,
  };
}

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
  let result = createProgressBaseline(journals, grade, plan);
  if (!result.sourceId)
    throw new Error(
      `진행도 기준 정정: ${plan.name} ${plan.exactDate ?? "기준일 이전"} 일지가 없습니다.`
    );

  if (plan.target) result = applyExplicitProgressTarget(result, plan.target);
  else if (!result.recognized)
    throw new Error(
      `진행도 기준 정정: ${plan.name} ${result.sourceDate} 일지의 단원 표기를 확인해 주세요.`
    );

  return result;
}
