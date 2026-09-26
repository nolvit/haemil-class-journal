import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  answerSheetGeometry,
  detectAnswerSheetMarkers,
  prepareAnswerSheetPhoto,
  recognizeAnswerSheet,
  type MarkerPoint,
  type PreparedPhoto,
} from "@/lib/answerSheetRecognition";
import { trpc } from "@/lib/trpc";
import { Camera, CheckCircle2, ClipboardCheck, PencilLine, Upload } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const markerNames = ["왼쪽 위", "오른쪽 위", "오른쪽 아래", "왼쪽 아래"];
const choiceLabels = ["①", "②", "③", "④", "⑤"];

type PendingPhoto = {
  pageNumber: number;
  prepared: PreparedPhoto;
  markers: MarkerPoint[];
};

export function AnswerEntryGrid({
  items,
  answers,
  onChange,
}: {
  items: Array<{ ordinal: number; answerType: "choice" | "numeric" }>;
  answers: Record<number, string>;
  onChange: (ordinal: number, value: string) => void;
}) {
  return <div className="mt-3 grid max-h-[65vh] gap-2 overflow-auto sm:grid-cols-2">
    {items.map(item => <div key={item.ordinal} className="rounded-lg border border-[#E5E3DC] bg-white p-3">
      <label className="text-sm font-semibold text-[#315B57]">{item.ordinal}번 · {item.answerType === "choice" ? "객관식" : "수치 답"}</label>
      {item.answerType === "choice" ? <div className="mt-2 flex flex-wrap gap-1">
        {choiceLabels.map((label, index) => <button key={label} type="button" aria-label={`${item.ordinal}번 ${label}`} aria-pressed={answers[item.ordinal] === String(index + 1)} className={`h-9 w-9 rounded-full border text-sm ${answers[item.ordinal] === String(index + 1) ? "border-[#315B57] bg-[#315B57] text-white" : "border-[#D5DCD7] bg-white text-[#315B57]"}`} onClick={() => onChange(item.ordinal, String(index + 1))}>{label}</button>)}
        <Button size="sm" variant="ghost" onClick={() => onChange(item.ordinal, "")}>비움</Button>
      </div> : <Input type="text" inputMode="text" autoComplete="off" aria-label={`${item.ordinal}번 수치 답`} placeholder="숫자만 입력 (예: 1/2, 5)" value={answers[item.ordinal] ?? ""} onChange={event => onChange(item.ordinal, event.target.value)} className="mt-2 bg-white" />}
    </div>)}
  </div>;
}

function formatSubmittedAt(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Printed problems stay on paper; the parent page shows only answer numbers. */
export default function ParentAssignments({ token, studentId, showEmptyState = false }: { token: string; studentId: number; showEmptyState?: boolean }) {
  const utils = trpc.useUtils();
  const list = trpc.academy.assignments.publicList.useQuery(
    { token, studentId },
    { enabled: Boolean(token && studentId), refetchInterval: 30_000 }
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedInList = selectedId !== null && Boolean(list.data?.assignments.some(item => item.id === selectedId));
  const contextRef = useRef("");
  contextRef.current = `${token}:${studentId}:${selectedId ?? ""}`;
  const detail = trpc.academy.assignments.publicDetail.useQuery(
    { token, studentId, assignmentId: selectedId ?? "" },
    { enabled: selectedInList, refetchInterval: 30_000 }
  );
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [photos, setPhotos] = useState<Record<number, string>>({});
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [manualMarkers, setManualMarkers] = useState(false);
  const [pageNumberConfirmed, setPageNumberConfirmed] = useState(false);
  const [photoWarnings, setPhotoWarnings] = useState<string[]>([]);
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [latestResult, setLatestResult] = useState<{
    attemptId: string;
    score: number;
    total: number;
    submittedAt: string | Date;
    results: Array<{ ordinal: number; submittedAnswer: string; correct: boolean; correctAnswer: string }>;
  } | null>(null);
  const recognize = trpc.academy.assignments.recognizePage.useMutation();
  const submit = trpc.academy.assignments.submit.useMutation({
    onSuccess: result => {
      setLatestResult(result);
      setReviewChecked(false);
      setPendingPhoto(null);
      setPhotos({});
      void utils.academy.assignments.publicList.invalidate();
      void utils.academy.assignments.publicDetail.invalidate();
      toast.success("답안을 제출하고 채점했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    setSelectedId(null);
    setAnswers({});
    setPhotos({});
    setPendingPhoto(null);
    setLatestResult(null);
  }, [studentId, token]);
  useEffect(() => {
    if (selectedId && list.data && !list.data.assignments.some(item => item.id === selectedId))
      setSelectedId(null);
  }, [list.data, selectedId]);
  useEffect(() => {
    setAnswers({});
    setPhotos({});
    setPendingPhoto(null);
    setPhotoWarnings([]);
    setLatestResult(null);
    setReviewChecked(false);
    setSelectedPageNumber(1);
  }, [selectedId]);

  useEffect(() => {
    if (latestResult && detail.data?.canSubmit && detail.data.attempts.some(attempt => attempt.id === latestResult.attemptId)) {
      setLatestResult(null);
    }
  }, [detail.data?.canSubmit, detail.data?.attempts, latestResult]);

  const assignment = selectedInList && !detail.error ? detail.data : undefined;
  const pageCount = Math.ceil((assignment?.items.length ?? 0) / answerSheetGeometry.rowsPerPage);

  async function loadPhoto(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("이미지 파일을 선택해 주세요."); return; }
    const contextKey = contextRef.current;
    setProcessingPhoto(true);
    setPageNumberConfirmed(false);
    setPhotoWarnings([]);
    try {
      const prepared = await prepareAnswerSheetPhoto(file);
      if (contextRef.current !== contextKey) return;
      const markers = detectAnswerSheetMarkers(prepared.canvas) ?? [];
      setPendingPhoto({ pageNumber: selectedPageNumber, prepared, markers });
      setManualMarkers(markers.length !== 4);
      if (markers.length !== 4) toast.message("검은 모서리 표시 4개를 차례대로 눌러 주세요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "사진을 열지 못했습니다.");
    } finally {
      setProcessingPhoto(false);
    }
  }

  function addMarker(event: React.MouseEvent<HTMLImageElement>) {
    if (!manualMarkers || !pendingPhoto || pendingPhoto.markers.length >= 4) return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rectangle.left) / rectangle.width) * pendingPhoto.prepared.width,
      y: ((event.clientY - rectangle.top) / rectangle.height) * pendingPhoto.prepared.height,
    };
    setPendingPhoto(current => current ? { ...current, markers: [...current.markers, point] } : null);
  }

  async function scanPhoto() {
    if (!pendingPhoto || !assignment || pendingPhoto.markers.length !== 4 || !pageNumberConfirmed) return;
    const contextKey = contextRef.current;
    setProcessingPhoto(true);
    setPhotoWarnings([]);
    try {
      const currentPageItems = assignment.items.filter(item => Math.ceil(item.ordinal / answerSheetGeometry.rowsPerPage) === pendingPhoto.pageNumber);
      const scanned = recognizeAnswerSheet(pendingPhoto.prepared, currentPageItems, pendingPhoto.markers);
      const pageAnswers: Record<number, string> = Object.fromEntries(currentPageItems.map(item => [item.ordinal, ""]));
      for (const answer of scanned.answers) pageAnswers[answer.ordinal] = answer.value;
      const warnings = [...scanned.warnings];
      if (scanned.numericImageDataUrl) {
        try {
          const recognized = await recognize.mutateAsync({
            token, studentId, assignmentId: assignment.id,
            code: assignment.code,
            pageNumber: pendingPhoto.pageNumber,
            imageDataUrl: scanned.numericImageDataUrl,
            regions: scanned.regions,
          });
          for (const answer of recognized.answers) {
            if (answer.confidence === "high") pageAnswers[answer.ordinal] = answer.value;
            else warnings.push(answer.value
              ? `${answer.ordinal}번 숫자 인식 후보 ${answer.value}을(를) 확인하고 직접 입력해 주세요.`
              : `${answer.ordinal}번 숫자 인식이 불확실합니다. 직접 확인해 주세요.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "숫자 답 인식에 실패했습니다.";
          warnings.push(`${message} 숫자 답은 직접 입력해 주세요.`);
          toast.message("숫자 OCR을 사용할 수 없어 직접 입력으로 전환했습니다.");
        }
      }
      if (contextRef.current !== contextKey) return;
      setAnswers(previous => ({ ...previous, ...pageAnswers }));
      setPhotos(previous => ({ ...previous, [pendingPhoto.pageNumber]: pendingPhoto.prepared.imageDataUrl }));
      setPhotoWarnings(warnings);
      setReviewChecked(false);
      setPendingPhoto(null);
      toast.success(`${pendingPhoto.pageNumber}쪽의 인식 결과를 답안 칸에 넣었습니다. 모두 확인해 주세요.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "답안지 위치를 읽지 못했습니다. 모서리를 다시 지정해 주세요.");
    } finally {
      setProcessingPhoto(false);
    }
  }

  function submitAnswers() {
    if (!assignment || !selectedId || !reviewChecked || !assignment.canSubmit || latestResult) return;
    const blankCount = assignment.items.filter(item => !answers[item.ordinal]?.trim()).length;
    if (blankCount && !window.confirm(`${blankCount}문항이 비어 있습니다. 이대로 채점할까요?`)) return;
    submit.mutate({
      token, studentId, assignmentId: selectedId,
      code: assignment.code,
      answers: assignment.items.map(item => ({ ordinal: item.ordinal, value: answers[item.ordinal]?.trim() ?? "" })),
      photos: Object.entries(photos).map(([pageNumber, imageDataUrl]) => ({ pageNumber: Number(pageNumber), imageDataUrl })),
    });
  }

  if (list.isLoading) return <Card className="portal-card mt-4"><CardContent className="p-5 text-sm text-[#71817D]">인쇄 과제를 확인하는 중입니다.</CardContent></Card>;
  if (list.error) return <Card className="portal-card mt-4"><CardContent className="p-5 text-sm text-red-700">과제를 불러오지 못했습니다: {list.error.message}</CardContent></Card>;
  if (!list.data?.assignments.length) return showEmptyState
    ? <Card className="portal-card mt-4"><CardContent className="p-5 text-sm text-[#71817D]">발행된 수학 과제가 없습니다.</CardContent></Card>
    : null;

  return <section className="mt-5" aria-label="인쇄 과제 답안 제출">
    <Card className="portal-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3"><ClipboardCheck className="mt-1 h-5 w-5 text-[#315B57]" /><div><h2 className="text-lg font-semibold text-[#193D3C]">인쇄 과제 답안</h2><p className="text-sm text-[#71817D]">문제는 받은 인쇄물에서 보고, 이곳에는 답만 제출합니다.</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {list.data.assignments.map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`rounded-xl border p-3 text-left ${selectedId === item.id ? "border-[#315B57] bg-[#EDF4F0]" : "border-[#E5E3DC] bg-white"}`}>
            <div className="flex items-start justify-between gap-2"><b className="text-[#193D3C]">{item.title}</b><Badge variant="outline">{item.canSubmit ? "답안 제출 가능" : item.status === "closed" ? "마감" : "제출 완료"}</Badge></div>
            <p className="mt-1 text-xs text-[#71817D]">{item.questionCount}문항 · {item.code} · 제출 {item.attemptCount}회</p>
          </button>)}
        </div>

        {selectedInList && detail.isLoading && <p className="mt-4 text-sm text-[#71817D]">답안을 불러오는 중입니다.</p>}
        {selectedInList && detail.error && <p className="mt-4 text-sm text-red-700">{detail.error.message}</p>}
        {assignment && <div className="mt-6 border-t border-[#E5E3DC] pt-5">
          <h3 className="font-semibold text-[#193D3C]">{assignment.title}</h3>
          <p className="mt-1 text-xs text-[#71817D]">과제 코드 {assignment.code} · 총 {assignment.items.length}문항</p>
          {latestResult && <div className="mt-4 rounded-xl border border-[#A9C8B7] bg-[#EDF7F0] p-4"><p className="flex items-center gap-2 font-semibold text-[#245D43]"><CheckCircle2 className="h-5 w-5" />채점 완료 · {latestResult.score}/{latestResult.total}점</p><p className="mt-1 text-xs text-[#526A66]">{formatSubmittedAt(latestResult.submittedAt)}</p><div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">{latestResult.results.map(result => <p key={result.ordinal} className={result.correct ? "text-[#245D43]" : "text-[#A44735]"}>{result.ordinal}번: {result.submittedAnswer || "미입력"} / 정답 {result.correctAnswer} {result.correct ? "✓" : "✗"}</p>)}</div></div>}
          {assignment.attempts.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-sm font-semibold text-[#315B57]">제출·채점 이력</h4>{assignment.attempts.map((attempt, index) => <details key={attempt.id} className="rounded-lg border border-[#E5E3DC] bg-white p-3" open={index === assignment.attempts.length - 1}><summary className="cursor-pointer text-sm font-semibold">{index + 1}차 · {attempt.score}/{attempt.total}점 · {formatSubmittedAt(attempt.submittedAt)}</summary><div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{attempt.results.map(result => <p key={result.ordinal} className={result.correct ? "text-[#245D43]" : "text-[#A44735]"}>{result.ordinal}번: {result.submittedAnswer || "미입력"} / 정답 {result.correctAnswer} {result.correct ? "✓" : "✗"}</p>)}</div></details>)}</div>}
          {(!assignment.canSubmit || latestResult) && <p className="mt-4 rounded-lg bg-[#F6F2E9] p-3 text-sm text-[#765E10]">현재 추가 제출은 열려 있지 않습니다. 재응시는 담당 교사가 허용하면 가능합니다.</p>}
          {assignment.canSubmit && !latestResult && <>
            <div className="mt-5 rounded-xl border border-[#D8E5DF] bg-[#F7FAF8] p-4">
              <div className="flex items-start gap-2"><Camera className="mt-0.5 h-5 w-5 text-[#315B57]" /><div><h4 className="font-semibold text-[#193D3C]">답안지 사진으로 입력</h4><p className="text-xs leading-5 text-[#71817D]">과제 코드와 쪽 번호를 확인하고, 종이 답안지를 촬영하거나 갤러리에서 원본 사진을 선택해 주세요. 화면을 다시 찍으면 줄무늬 때문에 인식이 어려울 수 있습니다.</p></div></div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-[#53645F]">인쇄된 쪽
                  <select value={selectedPageNumber} onChange={event => { setSelectedPageNumber(Number(event.target.value)); setPendingPhoto(null); }} className="ml-2 rounded-md border border-[#D8D8D0] bg-white px-2 py-2 text-sm">{Array.from({length: pageCount}, (_, index) => <option key={index} value={index + 1}>{index + 1} / {pageCount}쪽</option>)}</select>
                </label>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#D1DDD7] bg-white px-3 py-2 text-sm text-[#315B57] hover:bg-[#EDF4F0]"><Camera className="mr-2 h-4 w-4" />카메라로 찍기<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) void loadPhoto(file); event.currentTarget.value = ""; }} /></label>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#D1DDD7] bg-white px-3 py-2 text-sm text-[#315B57] hover:bg-[#EDF4F0]"><Upload className="mr-2 h-4 w-4" />갤러리에서 선택<input className="sr-only" type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void loadPhoto(file); event.currentTarget.value = ""; }} /></label>
                {photos[selectedPageNumber] && <Badge className="bg-[#E5F0E9] text-[#2F7154]">{selectedPageNumber}쪽 인식 완료</Badge>}
              </div>
              <p className="mt-2 text-xs text-[#71817D]">사진이 없거나 OCR 한도에 도달해도 아래 답안 칸에 직접 입력할 수 있습니다. 휴대전화 키보드의 받아쓰기도 사용할 수 있습니다.</p>
              {pendingPhoto && <div className="mt-4 rounded-lg border border-[#D1DDD7] bg-white p-3">
                <p className="text-sm font-semibold text-[#193D3C]">{pendingPhoto.pageNumber}쪽 사진 확인</p>
                <p className="mt-1 text-xs text-[#71817D]">{manualMarkers ? `검은 기준 사각형을 ${markerNames[pendingPhoto.markers.length] ?? "모두"}부터 차례대로 눌러 주세요.` : "초록 점이 네 모서리의 검은 사각형 중앙에 있는지 확인하세요."}</p>
                <div className="relative mx-auto mt-3 max-w-lg">
                  <img src={pendingPhoto.prepared.imageDataUrl} alt="촬영한 답안지" className={`block h-auto w-full ${manualMarkers ? "cursor-crosshair" : ""}`} onClick={addMarker} />
                  {pendingPhoto.markers.map((point, index) => <span key={index} className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#2F7154] text-[10px] font-bold text-white shadow" style={{left: `${point.x / pendingPhoto.prepared.width * 100}%`, top: `${point.y / pendingPhoto.prepared.height * 100}%`}}>{index + 1}</span>)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="outline" onClick={() => { setPendingPhoto(current => current ? {...current, markers: []} : null); setManualMarkers(true); setPageNumberConfirmed(false); }}>모서리 다시 지정</Button>
                  <label className="flex items-center gap-2 text-xs text-[#53645F]"><input type="checkbox" checked={pageNumberConfirmed} onChange={event => setPageNumberConfirmed(event.target.checked)} />사진의 과제 코드와 {pendingPhoto.pageNumber}/{pageCount}쪽 번호를 확인했습니다.</label>
                  <Button size="sm" disabled={pendingPhoto.markers.length !== 4 || !pageNumberConfirmed || processingPhoto || recognize.isPending} onClick={() => void scanPhoto()}>{processingPhoto ? "인식 중…" : "사진 인식"}</Button>
                </div>
              </div>}
              {photoWarnings.length > 0 && <div className="mt-3 rounded-lg border border-[#E8D4AA] bg-[#FFF9E9] p-3 text-xs text-[#775B25]"><b>확인이 필요한 답</b><ul className="mt-1 list-disc pl-5">{photoWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
            </div>
            <div className="mt-5 flex items-center gap-2"><PencilLine className="h-4 w-4 text-[#315B57]" /><h4 className="font-semibold text-[#193D3C]">답안 확인·수정</h4></div>
            <p className="mt-1 text-xs text-[#71817D]">사진 인식 후에도 모든 번호의 답을 확인해 주세요. 빈칸은 미입력으로 채점됩니다.</p>
            <AnswerEntryGrid items={assignment.items} answers={answers} onChange={(ordinal, value) => { setAnswers(previous => ({ ...previous, [ordinal]: value })); setReviewChecked(false); }} />
            <div className="mt-5 rounded-xl border border-[#C9DCD1] bg-[#F0F7F2] p-4"><label className="flex items-start gap-2 text-sm text-[#315B57]"><input type="checkbox" checked={reviewChecked} onChange={event => setReviewChecked(event.target.checked)} className="mt-1" /><span>모든 번호의 인식 답과 직접 입력 답을 확인했습니다. 제출하면 채점 결과와 정답이 즉시 보이며, 추가 제출은 교사가 허용해야 합니다.</span></label><Button className="mt-3 journal-primary-button" disabled={!reviewChecked || submit.isPending || processingPhoto || Boolean(pendingPhoto)} onClick={submitAnswers}>{submit.isPending ? "채점 중…" : "답안 제출·채점"}</Button></div>
          </>}
        </div>}
      </CardContent>
    </Card>
  </section>;
}
