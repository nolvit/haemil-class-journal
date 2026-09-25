import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  coursePaceText,
  MathCourseDetails,
  ProgressMeter,
} from "@/components/MathCourseProgress";
import {
  progressLabels,
  progressStates,
  assessmentLabels,
  type ProgressState,
} from "@shared/mathCurriculum";
import type { MathProgress as Progress } from "@shared/mathProgress";
import { toast } from "sonner";
type Cell = Progress["terms"][number]["units"][number]["cells"][number];
const studentCollator = new Intl.Collator("ko-KR", { numeric: true });
export default function MathProgress() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number>();
  const [editing, setEditing] = useState<Cell>();
  const [state, setState] = useState<ProgressState | "auto">("waiting");
  const [reason, setReason] = useState("");
  const query = trpc.academy.mathProgress.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const utils = trpc.useUtils();
  const save = trpc.academy.mathProgress.save.useMutation({
    onSuccess: async () => {
      await utils.academy.mathProgress.invalidate();
      setEditing(undefined);
      toast.success("진행도를 저장했습니다.");
    },
    onError: e => toast.error(e.message),
  });
  if (user?.role !== "admin") return <p>관리자만 확인할 수 있습니다.</p>;
  const student = query.data?.find(s => s.id === selected);
  return (
    <div className="journal-page-shell">
      <section className="journal-page-heading">
        <div>
          <p className="eyebrow">MATH COURSE PROGRESS</p>
          <h1>수학 과정 현황</h1>
          <p>
            전체 수학 수강생의 중등 과정 진행도를 확인하고 인식되지 않은 기록을
            보정합니다.
          </p>
        </div>
      </section>
      <div className="my-5 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          placeholder="학생 이름 또는 학년 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          새로고침
        </Button>
      </div>
      {query.isLoading ? (
        <p>진행도를 불러오는 중입니다.</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-500">
            {query.data?.length ?? 0}명 · 현재 학년부터 과정 기록을 누적합니다.
          </p>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#EFF5F0]">
                <tr>
                  {[
                    "학생",
                    "현재 및 누적 과정",
                    "기본 · 학습률 · 평가율",
                    "최근 4주",
                    "기본 과정 진행 속도",
                    "자동 인식 실패 기록",
                    "상세",
                  ].map(h => (
                    <th key={h} className="whitespace-nowrap p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data
                  ?.filter(s => `${s.name} ${s.grade}`.includes(search))
                  .sort(
                    (a, b) =>
                      studentCollator.compare(a.grade, b.grade) ||
                      studentCollator.compare(a.name, b.name) ||
                      a.id - b.id
                  )
                  .map(s => (
                    <tr key={s.id} className="border-t">
                      <td className="whitespace-nowrap p-3 font-semibold">
                        {s.name}
                        <span className="ml-2 text-xs font-normal text-stone-500">
                          {s.grade}
                        </span>
                        {s.progress.focusedLearning.length > 0 && <div className="mt-1 text-[11px] font-normal text-[#765E10]">
                          {s.progress.focusedLearning.filter(item => item.phase === "retraining").length > 0 &&
                            `재수강 ${s.progress.focusedLearning.filter(item => item.phase === "retraining").length}건`}
                          {s.progress.focusedLearning.some(item => item.phase === "retraining") &&
                            s.progress.focusedLearning.some(item => item.phase === "reassessment_pending") && " · "}
                          {s.progress.focusedLearning.filter(item => item.phase === "reassessment_pending").length > 0 &&
                            `재평가 예정 ${s.progress.focusedLearning.filter(item => item.phase === "reassessment_pending").length}건`}
                        </div>}
                      </td>
                      <td className="p-3">
                        {s.progress.terms.map(t => (
                          <div key={t.term} className="whitespace-nowrap">
                            {t.term} · {t.percent}%
                          </div>
                        ))}
                      </td>
                      <td className="min-w-36 p-3">
                        <div className="mb-1 text-xs">
                          기본 {s.progress.percent}% · 학습 {s.progress.learningPercent}% · 평가{" "}
                          {s.progress.masteryPercent}%
                        </div>
                        <ProgressMeter value={s.progress.percent} />
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {s.progress.recentCourse ? (
                          <>
                            <div className="font-semibold">
                              기본 +{s.progress.recentCourse.courseDeltaPercent}
                              %p
                            </div>
                            <div className="text-xs text-stone-500">
                              학습 +
                              {s.progress.recentCourse.learningDeltaPercent}%p ·
                              평가 +
                              {s.progress.recentCourse.assessmentDeltaPercent}%p
                            </div>
                          </>
                        ) : (
                          "업데이트 중"
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs">
                        {s.progress.recentCourse
                          ? coursePaceText(s.progress.recentCourse)
                          : "업데이트 중"}
                      </td>
                      <td className="p-3">{s.progress.unmatched.length}건</td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelected(s.id)}
                        >
                          보기·수정
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            과정 %는 학습·실력문제·평가 항목을 같은 기준으로 세어 전체 항목 중
            완료한 항목의 비율입니다. 출석률이나 최근 4주 증가율은 아닙니다.
            최근 4주 진행 속도는 완료 항목 증가폭을 실제 수학 수업일로 나눠
            비교합니다. 평가율은 점수가 아닌 평가 항목 완료 비율입니다.
          </p>
          {query.data?.length === 0 && (
            <p className="mt-4">수학 수강 학생이 없습니다.</p>
          )}
        </>
      )}
      <Dialog
        open={!!student}
        onOpenChange={open => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{student?.name} · 수학 과정</DialogTitle>
          </DialogHeader>
          {student && (
            <>
              <MathCourseDetails
                progress={student.progress}
                edit={cell => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(cell);
                      setState(cell.override?.state ?? "auto");
                      setReason(cell.override?.reason ?? "");
                    }}
                  >
                    수정
                  </Button>
                )}
              />
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">
                  자동 인식 확인 필요 {student.progress.unmatched.length}건
                </summary>
                <p className="my-3 text-xs text-stone-500">
                  기록을 확인한 뒤 해당 소단원 또는 평가의 수정 버튼으로
                  진행도를 보정하세요.
                </p>
                {student.progress.unmatched.map(r => (
                  <div key={r.id} className="border-t py-3 text-sm">
                    <p>
                      {r.date} · {r.reason}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs text-stone-600">
                      {r.text}
                    </pre>
                  </div>
                ))}
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={open => {
          if (!open && !save.isPending) setEditing(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>진행도 보정</DialogTitle>
          </DialogHeader>
          {editing && (
            <>
              <p className="text-sm">
                {assessmentLabels[
                  editing.label as keyof typeof assessmentLabels
                ] ?? editing.label}
              </p>
              <p className="text-xs text-stone-500">
                자동 판정: {progressLabels[editing.automatic]}
                {editing.override
                  ? ` · 마지막 보정 ${new Date(editing.override.updatedAt).toLocaleString("ko-KR")}`
                  : ""}
              </p>
              <label className="grid gap-2 text-sm">
                적용 상태
                <select
                  className="rounded border p-2"
                  value={state}
                  onChange={e => setState(e.target.value as typeof state)}
                >
                  <option value="auto">자동 판정으로 복원</option>
                  {progressStates.map(s => (
                    <option key={s} value={s}>
                      {progressLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                보정 사유
                <Input
                  maxLength={500}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="예: 이전 교재에서 학습 완료"
                />
              </label>
              <p className="text-xs text-stone-500">
                수동 보정은 이후 일지 입력에도 유지됩니다. 자동 판정으로
                복원하면 기존 보정을 해제합니다.
              </p>
              <Button
                disabled={save.isPending || !reason.trim()}
                onClick={() => {
                  if (selected)
                    save.mutate({
                      studentId: selected,
                      key: editing.key,
                      state: state === "auto" ? null : state,
                      reason,
                    });
                }}
              >
                저장
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
