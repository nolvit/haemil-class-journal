import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import { assessmentLabels, progressLabels } from "@shared/mathCurriculum";
import type { MathProgress } from "@shared/mathProgress";
import { trpc } from "@/lib/trpc";
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
  progress: MathProgress;
  sameCourseAverage?: { term: string; percent: number } | null;
  edit?: (
    cell: MathProgress["terms"][number]["units"][number]["cells"][number]
  ) => React.ReactNode;
}) {
  return (
    <div className="space-y-4 text-[#193D3C]">
      <p className="text-xs leading-relaxed text-[#71817D]">
        소단원 학습 → 고난이도 실력문제 → 소단원 평가 → 예비평가 → 최종평가
      </p>
      <div className="rounded-xl border border-[#B7CFC5] bg-[#EFF5F0] p-4">
        <div className="mb-3 flex justify-between gap-2 font-semibold">
          <span>1단계 · 기본 과정</span>
          <span>{progress.percent}%</span>
        </div>
        <ProgressMeter
          value={progress.percent}
          averageValue={sameCourseAverage?.percent}
        />
        {sameCourseAverage && (
          <p className="mt-1 text-[11px] text-[#7C6A48]">
            ▲ {sameCourseAverage.term.replace(/^중([123])-([12])$/, "중$1 - $2학기")} 원내 평균 진행률 {sameCourseAverage.percent}%
          </p>
        )}
        <Accordion type="multiple" className="mt-3">
          {progress.terms.map(term => (
            <AccordionItem key={term.term} value={term.term}>
              <AccordionTrigger>
                {term.term} <span>{term.percent}%</span>
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
    { token, studentId },
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
            <span className="text-sm">기본 {query.data.percent}%</span>
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
