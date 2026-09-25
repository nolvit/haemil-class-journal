import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LockKeyhole, CheckCircle2, RefreshCcw } from "lucide-react";
import { assessmentLabels, progressLabels } from "@shared/mathCurriculum";
import type { MathProgress, RecentCourseStats } from "@shared/mathProgress";
import { trpc } from "@/lib/trpc";

type MathProgressView = MathProgress & {
  recentCourse?: RecentCourseStats & {
    paceLabel?: "빠름" | "보통" | "느림" | null;
    paceArrow?: "↑" | "→" | "↓" | null;
  };
};

export function coursePaceText(
  recent: NonNullable<MathProgressView["recentCourse"]>
) {
  if (recent.paceArrow && recent.paceLabel)
    return `${recent.paceArrow} ${recent.paceLabel}`;
  if (recent.mathSessionDays < 5)
    return `수학 수업일 ${recent.mathSessionDays}/5일`;
  if (recent.coursePointsPerSession === null) return "진도 변화 없음";
  return "비교 자료 부족";
}

function completionPeriod(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const period = day <= 10 ? "초" : day <= 20 ? "중순" : "말";
  const currentYear = new Date().getFullYear();
  return `${year === currentYear ? "" : `${year}년 `}${month}월 ${period}`;
}

export function ProgressMeter({
  value,
  averageValue,
}: {
  value: number;
  averageValue?: number;
}) {
  const average =
    averageValue === undefined
      ? undefined
      : Math.max(0, Math.min(100, averageValue));
  return (
    <div className={average === undefined ? "" : "relative pb-3"}>
      <div
        className="h-2 overflow-hidden rounded-full bg-[#E9E6DD]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="과정 진행률"
      >
        <div
          className="h-full rounded-full bg-[#397A70] transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      {average !== undefined && (
        <span
          className="absolute top-[10px] h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-[#9A7B45]"
          style={{ left: `${average}%` }}
          title={`원내 평균 진행률 ${average}%`}
          aria-label={`원내 평균 진행률 ${average}%`}
        />
      )}
    </div>
  );
}
export function MathCourseDetails({
  progress,
  edit,
  sameCourseAverage,
}: {
  progress: MathProgressView;
  sameCourseAverage?: { term: string; percent: number } | null;
  edit?: (
    cell: MathProgress["terms"][number]["units"][number]["cells"][number]
  ) => React.ReactNode;
}) {
  return (
    <div className="space-y-4 text-[#193D3C]">
      {progress.focusedLearning.length > 0 && (
        <section className="rounded-xl border border-[#D7C797] bg-[#FBF7E9] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9DCAE] text-[#315B57]">
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-[#315B57]">
                집중 관리 중인 학습
              </h3>
              <p className="mt-0.5 text-xs text-[#71817D]">
                평가 후 부족했던 내용을 다시 학습하고 있습니다.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {progress.focusedLearning.map(item => (
              <div
                key={item.key}
                className="rounded-lg border border-[#E5D8AF] bg-white/80 px-3 py-2"
              >
                <p className="text-sm font-semibold text-[#315B57]">
                  {item.label} 소단원 보완학습 중
                </p>
                <p className="mt-0.5 text-[11px] text-[#71817D]">
                  {item.term} · {item.startedAt.replaceAll("-", ".")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="text-xs leading-relaxed text-[#71817D]">
        소단원 학습 → 고난이도 실력문제 → 소단원 평가 → 중단원 예비 평가 → 실력문제 예비 평가 → 최종 평가
      </p>
      <div className="rounded-xl border border-[#B7CFC5] bg-[#EFF5F0] p-4">
        <div className="mb-3 font-semibold">
          <span>1단계 · 기본 과정 {progress.percent}%</span>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-[11px] text-[#71817D]">학습률</p>
            <p className="text-lg font-bold">{progress.learningPercent}%</p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-[11px] text-[#71817D]">평가율</p>
            <p className="text-lg font-bold">{progress.masteryPercent}%</p>
          </div>
        </div>
        <ProgressMeter
          value={progress.percent}
          averageValue={sameCourseAverage?.percent}
        />
        {sameCourseAverage && (
          <p className="mt-1 text-[11px] text-[#7C6A48]">
            ▲{" "}
            {sameCourseAverage.term.replace(
              /^중([123])-([12])$/,
              "중$1 - $2학기"
            )}{" "}
            원내 평균 진행률 {sameCourseAverage.percent}%
          </p>
        )}
        {progress.recentCourse && (
          <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#71817D]">최근 4주</span>
              <strong className="text-[#193D3C]">
                기본 과정 +{progress.recentCourse.courseDeltaPercent}%p
              </strong>
            </div>
            <p className="mt-1 text-[#71817D]">
              학습률 +{progress.recentCourse.learningDeltaPercent}%p · 평가율 +
              {progress.recentCourse.assessmentDeltaPercent}%p
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#71817D]">기본 과정 진행 속도</span>
              <strong className="text-[#193D3C]">
                {coursePaceText(progress.recentCourse)}
              </strong>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#71817D]">기본 과정 완료 예상 시점</span>
              <strong className="text-[#193D3C]">
                {progress.recentCourse.hasSkipped
                  ? "건너뜀 항목 확인 필요"
                  : progress.terms.length > 0 &&
                progress.recentCourse.estimatedCompletionSessions === 0
                  ? "기본 과정 완료"
                  : progress.recentCourse.estimatedCompletionDate
                    ? `${completionPeriod(progress.recentCourse.estimatedCompletionDate)} 완료 예상`
                    : "예측 자료 부족"}
              </strong>
            </div>
            <p className="mt-1 text-[11px] text-[#71817D]">
              평가율은 평가 점수가 아닌 평가 단계 완료 비율입니다.
            </p>
          </div>
        )}
        <Accordion type="multiple" className="mt-3">
          {progress.terms.map(term => (
            <AccordionItem key={term.term} value={term.term}>
              <AccordionTrigger>
                {term.term}{" "}
                <span className="text-xs">
                  학습 {term.learningPercent}% · 평가 {term.masteryPercent}%
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {term.units.map(unit => (
                    <div key={unit.number} className="rounded-xl bg-white p-3">
                      <div className="flex justify-between gap-2 font-semibold">
                        <span>
                          {unit.number}. {unit.name}
                        </span>
                        {unit.complete ? (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0 text-emerald-700"
                            aria-label="완료"
                          />
                        ) : (
                          <span>{unit.percent}%</span>
                        )}
                      </div>
                      <div className="my-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-stone-100 px-2 py-1">
                          학습 {progressLabels[unit.learn]}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2 py-1">
                          실력문제 {progressLabels[unit.challenge]}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2 py-1">
                          평가 {progressLabels[unit.test]}
                        </span>
                      </div>
                      <ProgressMeter value={unit.percent} />
                      <Accordion type="single" collapsible>
                        <AccordionItem value="details">
                          <AccordionTrigger className="text-xs">
                            소단원 및 평가 상세
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2">
                              {unit.cells.map(cell => (
                                <div
                                  key={cell.key}
                                  className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2 text-xs"
                                >
                                  <span className="min-w-0 flex-1 break-keep">
                                    {cell.sector === "learn" ? "학습 · " : ""}
                                    {assessmentLabels[
                                      cell.label as keyof typeof assessmentLabels
                                    ] ?? cell.label}
                                  </span>
                                  <span
                                    className={
                                      cell.state === "complete"
                                        ? "font-semibold text-emerald-700"
                                        : "text-stone-500"
                                    }
                                  >
                                    {progressLabels[cell.state]}
                                    {cell.override ? " · 보정" : ""}
                                  </span>
                                  {edit?.(cell)}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      {["교과 과정", "고난이도 과정", "경시 과정"].map((name, i) => (
        <div
          key={name}
          className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4"
        >
          <div>
            <p className="font-semibold">
              {i + 2}단계 · {name}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {i === 0
                ? "기본 과정 이후"
                : i === 1
                  ? "교과 과정 이후"
                  : "심화 도전 과정"}
            </p>
          </div>
          <LockKeyhole className="h-5 w-5 text-stone-400" aria-label="잠김" />
        </div>
      ))}
    </div>
  );
}
export default function ParentMathProgress({
  token,
  studentId,
}: {
  token: string;
  studentId?: number;
}) {
  const query = trpc.academy.mathProgress.public.useQuery(
    { token, studentId, version: 2 },
    { enabled: !!token }
  );
  if (query.isLoading) return null;
  if (query.error)
    return (
      <p className="text-sm text-stone-500">
        수학 과정 현황을 불러오지 못했습니다.{" "}
        <button onClick={() => void query.refetch()} className="underline">
          다시 시도
        </button>
      </p>
    );
  if (!query.data) return null;
  return (
    <section className="rounded-2xl border border-[#DDD7C9] bg-white px-5 shadow-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value="math">
          <AccordionTrigger className="py-5 text-base font-semibold text-[#193D3C]">
            중등 수학 과정 현황{" "}
            <span className="text-sm">
              학습 {query.data.learningPercent}% · 평가{" "}
              {query.data.masteryPercent}%
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <MathCourseDetails
              progress={query.data}
              sameCourseAverage={query.data.sameCourseAverage}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
