import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RestrictedPage } from "./Students";

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AssignmentAdmin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.academy.assignments.adminList.useQuery();
  const usage = trpc.academy.assignments.ocrUsage.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{ attemptId: string; pageNumber: number } | null>(null);
  const [keyEdits, setKeyEdits] = useState<Record<number, string>>({});
  const [gradingEdits, setGradingEdits] = useState<Record<number, "value" | "ratio" | "exact">>({});
  const [exactFormEdits, setExactFormEdits] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");
  const [extraCalls, setExtraCalls] = useState(0);
  useEffect(() => { if (usage.data) setExtraCalls(usage.data.paidAllowance); }, [usage.data?.month, usage.data?.paidAllowance]);
  const detail = trpc.academy.assignments.adminDetail.useQuery(
    { assignmentId: selectedId ?? "" },
    { enabled: selectedId !== null }
  );
  const photo = trpc.academy.assignments.adminPhoto.useQuery(
    { attemptId: photoTarget?.attemptId ?? "", pageNumber: photoTarget?.pageNumber ?? 1 },
    { enabled: photoTarget !== null, gcTime: 0, refetchOnMount: "always" }
  );
  const refresh = () => {
    void utils.academy.assignments.adminList.invalidate();
    void utils.academy.assignments.adminDetail.invalidate();
    void utils.academy.assignments.ocrUsage.invalidate();
  };
  const close = trpc.academy.assignments.close.useMutation({
    onSuccess: () => { refresh(); toast.success("과제를 닫았습니다."); },
    onError: error => toast.error(error.message),
  });
  const reopen = trpc.academy.assignments.reopen.useMutation({
    onSuccess: () => { refresh(); toast.success("다음 제출 시도 1회를 허용했습니다."); },
    onError: error => toast.error(error.message),
  });
  const correctKey = trpc.academy.assignments.correctKey.useMutation({
    onSuccess: () => { refresh(); toast.success("정답 키를 수정하고 기존 제출도 다시 채점했습니다."); },
    onError: error => toast.error(error.message),
  });
  const regrade = trpc.academy.assignments.regrade.useMutation({
    onSuccess: () => { refresh(); toast.success("기존 제출을 재채점했습니다."); },
    onError: error => toast.error(error.message),
  });
  const setAllowance = trpc.academy.assignments.setPaidAllowance.useMutation({
    onSuccess: () => { refresh(); toast.success("이번 달 추가 OCR 허용 건수를 저장했습니다."); },
    onError: error => toast.error(error.message),
  });
  if (user?.role !== "admin") return <RestrictedPage title="자동채점 과제 관리" />;

  const current = detail.data?.assignment;
  const month = usage.data?.month ?? new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit"}).format(new Date());
  const used = usage.data?.used ?? 0;
  const freeLimit = usage.data?.freeLimit ?? 1000;
  const paidAllowance = usage.data?.paidAllowance ?? 0;

  return (
    <div className="journal-page-shell">
      <section className="journal-page-heading">
        <div>
          <p className="eyebrow">PRINTED ASSIGNMENTS</p>
          <h1>자동채점 과제 관리</h1>
          <p>학생별 인쇄 과제의 제출 이력, 정답 키와 OCR 사용량을 확인합니다.</p>
        </div>
        <Badge className="bg-[#E8EFED] px-3 py-2 text-[#315B57] hover:bg-[#E8EFED]">
          <ClipboardCheck className="mr-1.5 h-4 w-4" />과제 관리
        </Badge>
      </section>

      <Card className="journal-surface mt-6">
        <CardContent className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-semibold text-[#193D3C]">OCR 사용량 · {month}</h2>
            {usage.isLoading && <p className="mt-1 text-sm text-[#71817D]">OCR 설정과 사용량을 확인하는 중입니다.</p>}
            {usage.error && <p className="mt-1 text-sm text-[#A44735]">OCR 사용량을 불러올 수 없습니다: {usage.error.message}</p>}
            {usage.data && <p className="mt-1 text-sm text-[#53645F]">{used}건 사용 · 무료 {freeLimit}건 · 추가 승인 {paidAllowance}건</p>}
            <p className="mt-1 text-xs text-[#71817D]">한도 도달 시 사진의 숫자 인식이 중단됩니다. 보호자 페이지의 직접 입력은 계속 사용할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-[#53645F]">이번 달 유료 추가 허용 건수
              <Input type="number" min={0} step={1} value={extraCalls} onChange={event => setExtraCalls(Number(event.target.value))} className="mt-1 w-32 bg-white" />
            </label>
            <Button variant="outline" disabled={!usage.data || setAllowance.isPending || !Number.isSafeInteger(extraCalls) || extraCalls < 0} onClick={() => {
              if (window.confirm(`${month}월 OCR 유료 추가 한도를 ${extraCalls}건으로 지정할까요?`)) setAllowance.mutate({month, extraCalls});
            }}>한도 저장</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card className="journal-surface">
          <CardContent className="p-4">
            <h2 className="font-semibold text-[#193D3C]">발행한 과제</h2>
            {list.isLoading && <p className="mt-4 text-sm text-[#71817D]">과제 목록을 불러오는 중입니다.</p>}
            {list.error && <p className="mt-4 text-sm text-red-700">{list.error.message}</p>}
            {list.data?.assignments.length === 0 && <p className="mt-4 text-sm text-[#71817D]">발행한 과제가 없습니다.</p>}
            <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto">
              {list.data?.assignments.map(assignment => (
                <button key={assignment.id} type="button" onClick={() => { setSelectedId(assignment.id); setPhotoTarget(null); setKeyEdits({}); setGradingEdits({}); setExactFormEdits({}); setReason(""); }} className={`w-full rounded-xl border p-3 text-left transition hover:border-[#789A91] ${selectedId === assignment.id ? "border-[#315B57] bg-[#ECF3F0]" : "border-[#E5E3DC] bg-white"}`}>
                  <div className="flex items-start justify-between gap-2"><b>{assignment.title}</b><Badge variant="outline">{assignment.status === "open" ? "진행 중" : "마감"}</Badge></div>
                  <p className="mt-1 text-xs text-[#71817D]">{assignment.studentName} · {assignment.questionCount}문항 · 제출 {assignment.attemptCount}회</p>
                  <p className="mt-1 text-xs text-[#71817D]">{assignment.code} · {formatDate(assignment.createdAt)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="journal-surface">
          <CardContent className="p-4 md:p-5">
            {!selectedId && <p className="text-sm text-[#71817D]">과제를 선택하면 답안과 제출 이력을 볼 수 있습니다.</p>}
            {selectedId && detail.isLoading && <p className="text-sm text-[#71817D]">과제를 불러오는 중입니다.</p>}
            {detail.error && <p className="text-sm text-red-700">{detail.error.message}</p>}
            {current && <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-[#193D3C]">{current.title}</h2><p className="text-xs text-[#71817D]">{current.studentName} · {current.code}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={close.isPending || current.status === "closed"} onClick={() => close.mutate({assignmentId: current.id})}>과제 닫기</Button>
                  <Button size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate({assignmentId: current.id})}>다음 응시 허용</Button>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <h3 className="font-semibold text-[#315B57]">정답 키</h3>
                <p className="text-xs text-[#71817D]">정답·채점 방식을 수정하면 기존 제출도 즉시 다시 채점됩니다. 사유를 남겨 주세요.</p>
                <label className="block text-xs text-[#53645F]">수정 사유
                  <Input value={reason} onChange={event => setReason(event.target.value)} placeholder="예: 인쇄 정답 오기 수정" className="mt-1 bg-white" />
                </label>
                <div className="max-h-80 space-y-2 overflow-auto">
                  {current.items.map(item => (
                    <div key={item.ordinal} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E5E3DC] bg-white p-2 text-sm">
                      <span className="w-14 font-semibold">{item.ordinal}번</span>
                      <span className="text-xs text-[#71817D]">{item.answerType === "choice" ? "객관식" : "수치"}</span>
                      <Input aria-label={`${item.ordinal}번 정답`} value={keyEdits[item.ordinal] ?? item.answerKey} onChange={event => setKeyEdits(previous => ({...previous, [item.ordinal]: event.target.value}))} className="h-8 min-w-24 flex-1 bg-white" />
                      {item.answerType === "numeric" && <>
                        <select aria-label={`${item.ordinal}번 채점 방식`} className="rounded-md border border-[#D8D8D0] bg-white px-2 py-1 text-xs" value={gradingEdits[item.ordinal] ?? item.gradingRule} onChange={event => setGradingEdits(previous => ({...previous, [item.ordinal]: event.target.value as "value" | "ratio" | "exact"}))}>
                          <option value="value">수치 동치</option><option value="ratio">비율 동치</option><option value="exact">문자 그대로</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-[#53645F]"><input type="checkbox" checked={exactFormEdits[item.ordinal] ?? item.exactForm} onChange={event => setExactFormEdits(previous => ({...previous, [item.ordinal]: event.target.checked}))} />정확한 표기 필수</label>
                      </>}
                      <Button size="sm" variant="outline" disabled={correctKey.isPending || !reason.trim() || ((keyEdits[item.ordinal] ?? item.answerKey) === item.answerKey && (gradingEdits[item.ordinal] ?? item.gradingRule) === item.gradingRule && (exactFormEdits[item.ordinal] ?? item.exactForm) === item.exactForm)} onClick={() => correctKey.mutate({assignmentId: current.id, ordinal: item.ordinal, answerKey: keyEdits[item.ordinal] ?? item.answerKey, gradingRule: gradingEdits[item.ordinal] ?? item.gradingRule, exactForm: exactFormEdits[item.ordinal] ?? item.exactForm, reason: reason.trim()})}>저장</Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" disabled={regrade.isPending || !reason.trim() || current.attempts.length === 0} onClick={() => {
                  if (window.confirm("기존 제출을 현재 정답 키로 다시 채점할까요? 원래 제출 답안은 유지됩니다.")) regrade.mutate({assignmentId: current.id, reason: reason.trim()});
                }}><RefreshCw className="mr-1.5 h-4 w-4" />기존 제출 재채점</Button>
              </div>
              <div className="mt-6 space-y-2"><h3 className="font-semibold text-[#315B57]">제출 이력</h3>
                {current.attempts.length === 0 && <p className="text-sm text-[#71817D]">아직 제출이 없습니다.</p>}
                {current.attempts.map((attempt, index) => (
                  <details key={attempt.id} className="rounded-lg border border-[#E5E3DC] bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold">{index + 1}차 · {attempt.score}/{attempt.total}점 · {formatDate(attempt.submittedAt)}</summary>
                    {attempt.photoPages.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{attempt.photoPages.map(pageNumber => <Button key={pageNumber} type="button" size="sm" variant="outline" onClick={() => setPhotoTarget({ attemptId: attempt.id, pageNumber })}>{pageNumber}쪽 답안지 사진 보기</Button>)}</div>}
                    <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{attempt.results.map(result => <p key={result.ordinal} className={result.correct ? "text-[#315B57]" : "text-[#A44735]"}>{result.ordinal}번: {result.submittedAnswer || "미입력"} / 정답 {result.correctAnswer} {result.correct ? "✓" : "✗"}</p>)}</div>
                  </details>
                ))}
              </div>
            </>}
          </CardContent>
        </Card>
      </div>
      <Dialog open={photoTarget !== null} onOpenChange={open => { if (!open) setPhotoTarget(null); }}>
        <DialogContent className="max-h-[94dvh] w-[96vw] max-w-[900px] overflow-auto">
          <DialogTitle>제출 답안지 · {photoTarget?.pageNumber}쪽</DialogTitle>
          {photo.isLoading && <p className="text-sm text-[#71817D]">답안지 사진을 불러오는 중입니다.</p>}
          {photo.error && <p className="text-sm text-red-700">사진을 열 수 없습니다: {photo.error.message}</p>}
          {!photo.isLoading && !photo.error && !photo.data && <p className="rounded-lg bg-[#F6F2E9] p-4 text-sm text-[#765E10]">이 사진은 30일 보관 기간이 지나 삭제되었습니다.</p>}
          {photo.data && <img src={photo.data} alt={`제출된 답안지 ${photoTarget?.pageNumber}쪽`} className="mx-auto h-auto max-h-[82dvh] max-w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
