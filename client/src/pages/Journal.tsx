import JournalHistoryButton from "@/components/JournalHistoryButton";
import { MathJournalSelection } from "@/components/MathJournalSelection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAttendanceLiveUpdates } from "@/hooks/useAttendanceLiveUpdates";
import { journalEditorLoadState } from "@shared/journalEditorLoad";
import { attendanceStatusBadgeClass, attendanceStatusLabels, chooseJournalClassId, formatAttendanceProgressLabel, getAdjacentJournalDate, getJournalCompleteness, getMonday, initialJournalHomework, isJournalAttentionDue, HOMEWORK_STATUS_OPTIONS, homeworkStatusDescriptions, type AttendanceStatus, type HomeworkStatusOption } from "@shared/journalRules";
import { mathItemLabel, normalizeMathJournalDisplayContent, type MathJournalEntry, type MathJournalPayload } from "@shared/mathProgress";
import { carryForwardMathJournalEntries, suggestMathJournalCopy } from "@shared/mathJournalCopy";
import { appendMathReviewText } from "@shared/mathJournalQuickEntry";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardPenLine, Edit3, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import "./journal.css";

function todayInKorea() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); }
function currentTimeInKorea() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function dayLabel(value: string) { const date = new Date(`${value}T00:00:00Z`); return `${["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]} ${date.getUTCDate()}`; }
function weekdayLabel(value: string) { return `${["일", "월", "화", "수", "목", "금", "토"][new Date(`${value}T00:00:00Z`).getUTCDay()]}요일`; }
const journalSubjectFilterKey = "haemil.journal.subject-filter";

type EditorRow = { classGroup: { id: number; name: string; subject: string; accentColor: string }; student: { id: number; name: string; grade: string }; attendance: { status: AttendanceStatus; arrivalTime: string | null; departureTime: string | null } | null; journal: { content: string; homework: string; notes: string; isDraft?: boolean; mathProgress?: MathJournalPayload | null } | null; completeness: { state: "complete" | "attention" | "not_required"; missingFields: Array<"attendance" | "content" | "homework">; isDraft?: boolean } };
type EditorValues = { content: string; homework: string; notes: string; mathEntries: MathJournalEntry[]; mathSessionKind: MathJournalPayload["sessionKind"] };
function editorValuesFromRow(row: EditorRow): EditorValues {
  return {
    content: row.journal?.mathProgress?.freeText ?? row.journal?.content ?? "",
    homework: initialJournalHomework(row.classGroup.subject, row.journal, row.attendance?.status),
    notes: row.journal?.notes ?? "",
    mathEntries: row.journal?.mathProgress?.entries ?? [],
    mathSessionKind: row.journal?.mathProgress?.sessionKind ?? "math",
  };
}
function editorValuesEqual(left: EditorValues, right: EditorValues) {
  return left.content === right.content && left.homework === right.homework && left.notes === right.notes &&
    left.mathSessionKind === right.mathSessionKind && JSON.stringify(left.mathEntries) === JSON.stringify(right.mathEntries);
}
type WeekStudent = { student: EditorRow["student"]; cells: Map<string, EditorRow> };
type WeekGroup = { classGroup: EditorRow["classGroup"]; students: Map<number, WeekStudent> };

export default function Journal() {
  const requestedTarget = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const studentId = Number(query.get("studentId"));
    const classGroupId = Number(query.get("classGroupId"));
    return {
      studentId: Number.isInteger(studentId) && studentId > 0 ? studentId : undefined,
      classGroupId: Number.isInteger(classGroupId) && classGroupId > 0 ? classGroupId : undefined,
      journalDate: query.get("date") || todayInKorea(),
    };
  }, []);
  const [weekAnchor, setWeekAnchor] = useState(() => requestedTarget.journalDate);
  const [includeWeekend, setIncludeWeekend] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(() => new Set(requestedTarget.classGroupId ? [requestedTarget.classGroupId] : []));
  const [classFilterInitialized, setClassFilterInitialized] = useState(Boolean(requestedTarget.classGroupId));
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [editing, setEditing] = useState<{ row: EditorRow; journalDate: string } | null>(null);
  const [commenting, setCommenting] = useState<{ classGroup: EditorRow["classGroup"] } | null>(null);
  const weekStart = getMonday(weekAnchor);
  const classGroups = trpc.academy.classGroups.list.useQuery();
  useEffect(() => {
    if (classFilterInitialized || !classGroups.data?.length) return;
    const rememberedIds = (window.localStorage.getItem(journalSubjectFilterKey) ?? "").split(",").map(Number).filter(id => classGroups.data.some(group => group.id === id));
    const fallbackId = chooseJournalClassId(classGroups.data, rememberedIds[0]);
    setSelectedClasses(new Set(rememberedIds.length ? rememberedIds : fallbackId ? [fallbackId] : []));
    setClassFilterInitialized(true);
  }, [classFilterInitialized, classGroups.data]);
  const queryInput = useMemo(() => ({ weekAnchor: weekStart, includeWeekend }), [weekStart, includeWeekend]);
  const weekly = trpc.academy.weeklyWorkspace.useQuery(queryInput, { enabled: classFilterInitialized });
  const utils = trpc.useUtils();
  const today = todayInKorea();
  useEffect(() => {
    const refreshElapsedTime = () => setRefreshedAt(new Date());
    const timer = window.setInterval(refreshElapsedTime, 30_000);
    const handleVisibilityChange = () => {
      refreshElapsedTime();
      if (document.visibilityState === "visible" && classFilterInitialized)
        void weekly.refetch();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [classFilterInitialized, weekly.refetch]);
  useAttendanceLiveUpdates(event => {
    if (getMonday(event.eventDate) !== weekStart || !classFilterInitialized)
      return;
    setRefreshedAt(new Date());
    void weekly.refetch();
    void utils.academy.workspace.invalidate();
  });
  const visibleDates = useMemo(() => (attentionOnly ? (weekly.data?.dates ?? []).filter(date => date <= today) : (weekly.data?.dates ?? [])), [attentionOnly, today, weekly.data?.dates]);
  const groups = useMemo(() => {
    const map = new Map<number, WeekGroup>();
    weekly.data?.days.forEach(day => day.rows.forEach(raw => {
      const row = raw as EditorRow;
      let group = map.get(row.classGroup.id);
      if (!group) { group = { classGroup: row.classGroup, students: new Map() }; map.set(row.classGroup.id, group); }
      let student = group.students.get(row.student.id);
      if (!student) { student = { student: row.student, cells: new Map() }; group.students.set(row.student.id, student); }
      student.cells.set(day.journalDate, row);
    }));
    return Array.from(map.values()).filter(group => selectedClasses.has(group.classGroup.id)).map(group => ({ ...group, students: Array.from(group.students.values()).filter(student => !attentionOnly || Array.from(student.cells.entries()).some(([date, cell]) => isJournalAttentionDue(date, today, cell.completeness.state))) })).filter(group => group.students.length);
  }, [attentionOnly, selectedClasses, today, weekly.data]);
  // "과목 공지사항"은 학생별이 아니라 반(과목) 전체 단위이므로, 반에
  // 속한 학생 중 한 명이라도 공지 문구가 있으면 그 반은 등록된 것으로
  // 표시한다.
  const groupAnnouncementStatus = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const comment of weekly.data?.comments ?? [])
      if (comment.comment.trim()) map.set(comment.classGroupId, true);
    return map;
  }, [weekly.data?.comments]);
  const saveAttendance = trpc.academy.attendance.save.useMutation({
    onSuccess: (result, variables) => {
      if ("reason" in result && result.reason === "current_journal_conflict") {
        if (window.confirm("현재 날짜에 이미 작성된 수업일지가 있습니다. 기존 내용을 지우고 이후 수업일지를 현재 날짜로 당길까요?\n\n확인을 누르면 현재 날짜의 기존 내용은 삭제되고, 취소하면 출석 상태를 바꾸지 않습니다.")) {
          saveAttendance.mutate({ ...variables, overwriteCurrentJournal: true });
        } else toast.info("출석 상태 변경을 취소했습니다.");
        return;
      }
      void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); void utils.academy.mathProgress.invalidate();
      toast.success(result.pulledFrom?.length ? `출석 상태를 저장하고 이후 수업일지 ${result.pulledFrom.length}건을 현재 날짜로 당겼습니다.` : "출석 상태를 저장했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const handleAttendanceChange = (row: EditorRow, journalDate: string, status: AttendanceStatus) => {
    const attends = status === "present" || status === "makeup" || status === "makeup_double";
    const arrivalTime = status === "present" && !row.attendance?.arrivalTime ? currentTimeInKorea() : row.attendance?.arrivalTime ?? "";
    saveAttendance.mutate({ studentId: row.student.id, journalDate: journalDate, status, arrivalTime: attends ? arrivalTime : "", departureTime: attends ? row.attendance?.departureTime ?? "" : "" });
  };
  const visibleRecords = groups.reduce((count, group) => count + group.students.length, 0);
  const hasOpenedRequestedJournal = useRef(false);
  const hasFocusedRequestedStudent = useRef(false);
  useEffect(() => {
    if (!requestedTarget.studentId || !requestedTarget.classGroupId || hasOpenedRequestedJournal.current || weekly.isLoading) return;
    const targetDay = weekly.data?.days.find(day => day.journalDate === requestedTarget.journalDate);
    const targetRow = targetDay?.rows.find(raw => raw.student.id === requestedTarget.studentId && raw.classGroup.id === requestedTarget.classGroupId) as EditorRow | undefined;
    if (!targetRow) return;
    hasOpenedRequestedJournal.current = true;
    document.getElementById(`journal-group-${requestedTarget.classGroupId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setEditing({ row: targetRow, journalDate: requestedTarget.journalDate });
  }, [requestedTarget.classGroupId, requestedTarget.journalDate, requestedTarget.studentId, weekly.data, weekly.isLoading]);
  useEffect(() => {
    if (!requestedTarget.studentId || requestedTarget.classGroupId || hasFocusedRequestedStudent.current || weekly.isLoading) return;
    const targetDay = weekly.data?.days.find(day => day.journalDate === requestedTarget.journalDate);
    const targetRow = targetDay?.rows.find(raw => raw.student.id === requestedTarget.studentId) as EditorRow | undefined;
    if (!targetRow) return;
    hasFocusedRequestedStudent.current = true;
    document.getElementById(`journal-student-${targetRow.classGroup.id}-${targetRow.student.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [requestedTarget.classGroupId, requestedTarget.journalDate, requestedTarget.studentId, weekly.data, weekly.isLoading]);
  const selectClass = (classGroupId: number) => { setSelectedClasses(current => { const next = new Set(current); if (next.has(classGroupId) && next.size > 1) next.delete(classGroupId); else next.add(classGroupId); window.localStorage.setItem(journalSubjectFilterKey, Array.from(next).join(",")); return next; }); };
  return <div className="journal-page-shell"><section className="journal-page-heading"><div><p className="eyebrow">WEEKLY LESSON JOURNAL</p><h1>수업 일지</h1><p>한 주의 수업 내용, 과제, 특이사항을 날짜별로 기록합니다. 노란색 항목은 필수 기록을 확인해야 합니다.</p></div><div className="journal-date-nav"><Button variant="outline" size="icon" onClick={() => setWeekAnchor(shiftDate(weekStart, -7))} aria-label="이전 주"><ChevronLeft className="h-4 w-4" /></Button><Input type="date" value={weekStart} onChange={event => setWeekAnchor(event.target.value)} /><Button variant="outline" size="icon" onClick={() => setWeekAnchor(shiftDate(weekStart, 7))} aria-label="다음 주"><ChevronRight className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="dashboard-today-button" onClick={() => setWeekAnchor(todayInKorea())}>오늘</Button></div></section>
    <section className="journal-filter-bar"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="과목 복수 선택"><span className="mr-1 text-xs font-semibold text-[#556C68]">과목</span>{classGroups.data?.map(group => { const selected = selectedClasses.has(group.id); return <Button type="button" key={group.id} variant={selected ? "default" : "outline"} size="sm" className={selected ? "journal-primary-button h-9" : "h-9 bg-[#FFFEFA]"} onClick={() => selectClass(group.id)} aria-pressed={selected}>{group.subject}</Button>; })}</div><button className={`journal-attention-filter ${attentionOnly ? "is-active" : ""}`} onClick={() => setAttentionOnly(value => !value)}><AlertCircle className="h-4 w-4" />입력 전 항목만 보기</button><div className="flex items-center gap-2 rounded-xl border border-[#E5DFD3] bg-[#FCFBF7] px-3 py-2"><Switch checked={includeWeekend} onCheckedChange={setIncludeWeekend} id="weekend-journal" /><label htmlFor="weekend-journal" className="cursor-pointer text-xs font-semibold text-[#556C68]">주말 입력 포함</label></div></section>
    <div className="journal-guidance mt-4"><CalendarDays className="h-4 w-4" /><span><b>{weekStart} 주간 입력</b> · {attentionOnly ? `${today}까지 실제 입력이 필요한 입력 전 항목만 표시합니다.` : "이름을 누르면 최근 4주 달력이 새 창에서 열립니다. 날짜별 셀에서는 수업일지를 작성할 수 있습니다."}</span><Badge className="ml-auto bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">총 {visibleRecords}명</Badge></div>
    <section className="mt-6 space-y-6">{weekly.isLoading || !classFilterInitialized ? Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-56 w-full" key={index} />) : groups.length ? groups.map(group => <JournalWeekGroup key={group.classGroup.id} group={group} dates={visibleDates} today={today} now={refreshedAt} includeWeekend={includeWeekend} hasAnnouncement={groupAnnouncementStatus.get(group.classGroup.id) ?? false} onEdit={(row, journalDate) => setEditing({ row, journalDate })} onComment={classGroup => setCommenting({ classGroup })} onAttendanceChange={handleAttendanceChange} />) : <Card className="journal-surface"><CardContent className="journal-empty-state"><ClipboardPenLine className="h-7 w-7" /><h3>{attentionOnly ? "확인할 입력 전 항목이 없습니다." : "수업일지를 작성할 반 또는 학생이 없습니다."}</h3><p>{attentionOnly ? `${today}까지 필요한 수업 기록이 모두 입력되었습니다.` : "관리자가 반과 학생을 등록한 뒤 다시 확인해 주세요."}</p></CardContent></Card>}</section>
    <JournalEditor editing={editing} includeWeekend={includeWeekend} onClose={() => setEditing(null)} />
    <WeeklyAnnouncementEditor commenting={commenting} weekStart={weekStart} onClose={() => setCommenting(null)} />
  </div>;
}

function JournalWeekGroup({ group, dates, today, now, includeWeekend, hasAnnouncement, onEdit, onComment, onAttendanceChange }: { group: { classGroup: EditorRow["classGroup"]; students: WeekStudent[] }; dates: string[]; today: string; now: Date; includeWeekend: boolean; hasAnnouncement: boolean; onEdit: (row: EditorRow, date: string) => void; onComment: (classGroup: EditorRow["classGroup"]) => void; onAttendanceChange: (row: EditorRow, journalDate: string, status: AttendanceStatus) => void }) {
  return <Card id={`journal-group-${group.classGroup.id}`} className="journal-surface scroll-mt-20 overflow-hidden"><div className="journal-group-header" style={{ borderLeftColor: group.classGroup.accentColor }}><div><p className="eyebrow">WEEKLY SUBJECT</p><h2>{group.classGroup.subject}</h2></div><div className="ml-auto flex items-center gap-2"><Badge className={hasAnnouncement ? "bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]" : "bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]"}>{hasAnnouncement ? "과목 공지사항 등록됨" : "과목 공지사항 미등록"}</Badge><Button type="button" variant="outline" size="sm" className="h-8 bg-white/80" onClick={() => onComment(group.classGroup)}><MessageSquareText className="mr-1.5 h-3.5 w-3.5" />{hasAnnouncement ? "공지사항 수정" : "공지사항 작성"}</Button><Badge className="bg-white/80 text-[#46625E] hover:bg-white">{group.students.length}명</Badge></div></div><CardContent className="overflow-x-auto p-0"><div className="min-w-[760px]"><div className="grid border-b border-[#E3DFD5] bg-[#FAF8F2] text-[10px] font-bold tracking-[0.08em] text-[#7A8985]" style={{ gridTemplateColumns: `minmax(150px, 0.9fr) repeat(${dates.length}, minmax(132px, 1fr))` }}><div className="px-4 py-3">학생</div>{dates.map(date => <div className="border-l border-[#E8E3D8] px-3 py-3" key={date}>{dayLabel(date)}</div>)}</div>{group.students.map(student => <div id={`journal-student-${group.classGroup.id}-${student.student.id}`} className="grid border-b border-[#EEE9DE] last:border-b-0 scroll-mt-24" style={{ gridTemplateColumns: `minmax(150px, 0.9fr) repeat(${dates.length}, minmax(132px, 1fr))` }} key={student.student.id}><JournalStudentIdentity student={student} classGroup={group.classGroup} today={today} now={now} includeWeekend={includeWeekend} />{dates.map(date => <JournalCell key={date} row={student.cells.get(date)} onClick={() => { const row = student.cells.get(date); if (row) onEdit(row, date); }} journalDate={date} onAttendanceChange={onAttendanceChange} />)}</div>)}</div></CardContent></Card>;
}

function JournalStudentIdentity({ student, classGroup, today, now, includeWeekend }: { student: WeekStudent; classGroup: EditorRow["classGroup"]; today: string; now: Date; includeWeekend: boolean }) {
  const todayRow = student.cells.get(today);
  const progress = todayRow
    ? formatAttendanceProgressLabel(todayRow.attendance?.status, todayRow.attendance?.arrivalTime, today, now, today, todayRow.attendance?.departureTime)
    : "—";
  return <div className="px-4 py-4"><JournalHistoryButton student={student.student} classGroup={classGroup} includeWeekend={includeWeekend} /><p className="mt-0.5 text-xs text-[#71817D]">{student.student.grade}</p>{progress !== "—" && <p className={`mt-1 text-[11px] font-semibold ${progress === "결석" || progress === "미등록" ? "text-[#A16A3B]" : "text-[#52706A]"}`}>{progress}</p>}</div>;
}

function JournalCell({ row, journalDate, onClick, onAttendanceChange }: { row: EditorRow | undefined; journalDate: string; onClick: () => void; onAttendanceChange: (row: EditorRow, journalDate: string, status: AttendanceStatus) => void }) { if (!row) return <div className="border-l border-[#EEE9DE] p-3" />; const isAttention = row.completeness.state === "attention"; const status = row.attendance?.status ?? "not_entered"; const displayedContent = row.journal?.content && row.classGroup.subject === "수학" ? normalizeMathJournalDisplayContent(row.journal.content) : row.journal?.content; return <div className={`min-h-[112px] border-l border-[#EEE9DE] p-3 text-left transition-colors hover:bg-[#FAF7EF] ${isAttention ? "bg-[#FFFDF4]" : ""}`}><div className="flex items-center justify-between gap-1"><select aria-label={`${row.student.name} ${journalDate} 출석 상태`} value={status} onChange={event => onAttendanceChange(row, journalDate, event.target.value as AttendanceStatus)} onClick={event => event.stopPropagation()} className={`rounded-full border-0 px-2 py-1 text-xs font-semibold outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-[#B8891B] ${attendanceStatusBadgeClass(status)}`}>{(status === "holiday" || status === "closed") && <option value={status}>{attendanceStatusLabels[status]}</option>}<option value="not_entered">{attendanceStatusLabels.not_entered}</option><option value="present">{attendanceStatusLabels.present}</option><option value="absent">{attendanceStatusLabels.absent}</option><option value="not_registered">{attendanceStatusLabels.not_registered}</option><option value="makeup">{attendanceStatusLabels.makeup}</option><option value="makeup_double">{attendanceStatusLabels.makeup_double}</option></select><button type="button" aria-label={`${row.student.name} ${journalDate} 수업일지 열기`} onClick={onClick} className="rounded p-1 text-[#81918D] hover:bg-[#EFEADE]"><Edit3 className="h-3.5 w-3.5" /></button></div><button type="button" onClick={onClick} className="mt-2 block w-full text-left"><p className="whitespace-pre-line text-xs leading-5 text-[#3E5651]">{displayedContent || (isAttention ? "필수 기록 입력" : "작성 제외")}</p>{row.journal?.homework && <p className="mt-2 whitespace-pre-line text-[11px] leading-4 text-[#84713E]"><b>과제</b> {row.journal.homework}</p>}{row.journal?.notes && <p className="mt-1 whitespace-pre-line text-[11px] leading-4 text-[#7C6A5C]"><b>비고</b> {row.journal.notes}</p>}{isAttention && <p className="mt-2 text-[10px] font-semibold text-[#A37C14]">{row.completeness.isDraft ? "임시 저장 · 최종 저장 필요" : `${row.completeness.missingFields.map(value => ({ attendance: "출석", content: "내용", homework: "과제" }[value])).join(" · ")} 입력 전`}</p>}</button></div>; }

function WeeklyAnnouncementEditor({ commenting, weekStart, onClose }: { commenting: { classGroup: EditorRow["classGroup"] } | null; weekStart: string; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const utils = trpc.useUtils();
  const input = useMemo(() => commenting ? { classGroupId: commenting.classGroup.id, weekStart } : { classGroupId: 1, weekStart }, [commenting, weekStart]);
  const announcement = trpc.academy.weeklyComments.getAnnouncement.useQuery(input, { enabled: Boolean(commenting) });
  useEffect(() => { setComment(announcement.data?.comment ?? ""); }, [commenting, announcement.data]);
  const save = trpc.academy.weeklyComments.saveAnnouncement.useMutation({ onSuccess: () => { void utils.academy.weeklyComments.invalidate(); void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.publicStudent.invalidate(); toast.success("보호자 과목 공지사항을 저장했습니다."); onClose(); }, onError: error => toast.error(error.message) });
  return <Dialog open={Boolean(commenting)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="journal-dialog sm:max-w-[560px]"><DialogHeader><p className="eyebrow">PARENT WEEKLY NOTE</p><DialogTitle>{commenting?.classGroup.name} 과목 공지사항</DialogTitle><DialogDescription>{weekStart} 주간 · 이 반에 등록된 모든 학생의 보호자 화면에 동일하게 표시됩니다.</DialogDescription></DialogHeader><div className="grid gap-2 py-3"><Label htmlFor="weekly-public-comment">주간 안내</Label><Textarea id="weekly-public-comment" value={comment} onChange={event => setComment(event.target.value)} placeholder="이번 주 학습 태도, 다음 주 안내, 보호자에게 전할 내용을 입력해 주세요." className="min-h-32" /></div><DialogFooter><Button variant="outline" onClick={onClose}>취소</Button><Button className="journal-primary-button" disabled={save.isPending || !commenting} onClick={() => commenting && save.mutate({ classGroupId: commenting.classGroup.id, weekStart, comment })}><Save className="mr-1.5 h-4 w-4" />공지사항 저장</Button></DialogFooter></DialogContent></Dialog>;
}

function JournalEditor({ editing, includeWeekend, onClose }: { editing: { row: EditorRow; journalDate: string } | null; includeWeekend: boolean; onClose: () => void }) {
  const row = editing?.row ?? null;
  const [journalDate, setJournalDate] = useState(() => editing?.journalDate ?? todayInKorea());
  const [content, setContent] = useState(""); const [homework, setHomework] = useState(""); const [notes, setNotes] = useState("");
  const [mathEntries, setMathEntries] = useState<MathJournalEntry[]>([]);
  const [mathSessionKind, setMathSessionKind] = useState<MathJournalPayload["sessionKind"]>("math");
  const initializedEditorRef = useRef<{ identity: string; row: EditorRow; values: EditorValues } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const closeAfterSaveRef = useRef(true);
  const utils = trpc.useUtils();
  const workspaceInput = useMemo(() => row ? { journalDate, classGroupId: row.classGroup.id } : { journalDate, classGroupId: 1 }, [journalDate, row?.classGroup.id]);
  const dailyWorkspace = trpc.academy.workspace.useQuery(workspaceInput, { enabled: Boolean(row) });
  const editorIdentity = row ? `${row.student.id}:${row.classGroup.id}:${journalDate}` : null;
  const needsInitialHydration = Boolean(editorIdentity && initializedEditorRef.current?.identity !== editorIdentity);
  const fetchedRow = useMemo(() => {
    if (!row) return null;
    return (dailyWorkspace.data?.find(item => item.student.id === row.student.id && item.classGroup.id === row.classGroup.id) as EditorRow | undefined) ?? null;
  }, [dailyWorkspace.data, row]);
  // A cached row is safe to show immediately even while React Query refreshes it.
  const { loadError, isLoadingDate } = journalEditorLoadState(needsInitialHydration, Boolean(fetchedRow), dailyWorkspace);
  const activeRow = isLoadingDate || loadError ? null : fetchedRow;
  const isLegacyMathJournal = Boolean(activeRow?.classGroup.subject === "수학" && activeRow.journal && !activeRow.journal.mathProgress &&
    activeRow.journal.content.trim());
  const referenceInput = useMemo(() => row ? { studentId: row.student.id, classGroupId: row.classGroup.id, journalDate } : { studentId: 1, classGroupId: 1, journalDate }, [journalDate, row?.classGroup.id, row?.student.id]);
  const recentLesson = trpc.academy.journals.recent.useQuery(referenceInput, { enabled: Boolean(row) });
  const previousMathEntries = useMemo(() => {
    const previous = recentLesson.data;
    if (!previous) return [];
    if (previous.mathProgress?.sessionKind === "math") return previous.mathProgress.entries;
    return suggestMathJournalCopy(previous.content ?? "", journalDate)?.entries ?? [];
  }, [recentLesson.data, journalDate]);
  useEffect(() => { if (editing) setJournalDate(editing.journalDate); }, [editing?.journalDate, editing?.row.classGroup.id, editing?.row.student.id]);
  useLayoutEffect(() => {
    if (!editing) { initializedEditorRef.current = null; return; }
    if (!fetchedRow || loadError || !editorIdentity) return;
    const previous = initializedEditorRef.current;
    if (previous?.identity === editorIdentity) {
      if (previous.row === fetchedRow) return;
      // A background refresh may update a pristine form, but must not erase typing.
      if (!editorValuesEqual({ content, homework, notes, mathEntries, mathSessionKind }, previous.values)) return;
    }
    const values = editorValuesFromRow(fetchedRow);
    initializedEditorRef.current = { identity: editorIdentity, row: fetchedRow, values };
    setContent(values.content);
    setHomework(values.homework);
    setNotes(values.notes);
    setMathEntries(values.mathEntries);
    setMathSessionKind(values.mathSessionKind);
  }, [editing, fetchedRow, loadError, editorIdentity, content, homework, notes, mathEntries, mathSessionKind]);
  const patchJournalCaches = (values: { studentId: number; classGroupId: number; journalDate: string; content: string; homework: string; notes: string; isDraft?: boolean; mathProgress?: MathJournalPayload | null }) => {
    const patchRow = <T extends { student: EditorRow["student"]; classGroup: EditorRow["classGroup"]; attendance: EditorRow["attendance"] }>(raw: T): T => {
      if (raw.student.id !== values.studentId || raw.classGroup.id !== values.classGroupId) return raw;
      return {
        ...raw,
        journal: { content: values.content, homework: values.homework, notes: values.notes, isDraft: values.isDraft, mathProgress: values.mathProgress },
        completeness: getJournalCompleteness(raw.attendance?.status, values.content, values.homework, Boolean(values.isDraft)),
      } as T;
    };
    utils.academy.workspace.setData(workspaceInput, current => current?.map(raw => patchRow(raw)));
    utils.academy.weeklyWorkspace.setData({ weekAnchor: getMonday(values.journalDate), includeWeekend }, current => {
      if (!current) return current;
      return { ...current, days: current.days.map(day => day.journalDate === values.journalDate ? { ...day, rows: day.rows.map(raw => patchRow(raw)) } : day) };
    });
    void utils.academy.dashboard.invalidate();
  };
  const save = trpc.academy.journals.save.useMutation({ onSuccess: (result, values) => { initializedEditorRef.current = null; patchJournalCaches({ ...values, content: result.content, mathProgress: result.mathProgress }); void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.mathProgress.invalidate(); if (!closeAfterSaveRef.current && result.mathProgress && !result.content) { setContent(result.mathProgress.freeText); setMathEntries(result.mathProgress.entries); setHomework(values.homework); } toast.success(values.isDraft ? "임시 저장했습니다. 최종 저장 전까지 입력 전으로 표시됩니다." : "수업일지를 저장했습니다."); if (closeAfterSaveRef.current) onClose(); }, onError: error => toast.error(error.message) });
  const insert = trpc.academy.journals.insert.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.mathProgress.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); setContent(""); setHomework(initialJournalHomework(activeRow?.classGroup.subject ?? "", null, activeRow?.attendance?.status)); setNotes(""); setMathEntries([]); setMathSessionKind("math"); toast.success(result.movedCount ? `새 수업일지 자리를 추가했습니다. 저장된 일지 ${result.movedCount}건을 다음 날짜로 이동했습니다.` : "현재 날짜에 새 수업일지 입력 자리를 준비했습니다."); }, onError: error => toast.error(error.message) });
  const deleteAndPull = trpc.academy.journals.deleteAndPull.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.mathProgress.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); setContent(""); setHomework(""); setNotes(""); setMathEntries([]); setMathSessionKind("math"); toast.success(result.movedCount ? `현재 일지를 삭제하고 미래 수업일지 ${result.movedCount}건을 앞당겼습니다.` : "현재 일지를 삭제했습니다."); onClose(); }, onError: error => toast.error(error.message) });
  const attendanceStatus = activeRow?.attendance?.status;
  const canWriteLesson = attendanceStatus !== "absent" && attendanceStatus !== "not_registered" && attendanceStatus !== "holiday" && attendanceStatus !== "closed";
  const canWriteNotes = attendanceStatus !== "holiday" && attendanceStatus !== "closed";
  const originalContent = activeRow?.journal?.mathProgress?.freeText ?? activeRow?.journal?.content ?? "";
  const originalHomework = initialJournalHomework(activeRow?.classGroup.subject ?? "", activeRow?.journal ?? null, activeRow?.attendance?.status);
  const hasUnsavedChanges = content !== originalContent || homework !== originalHomework || notes !== (activeRow?.journal?.notes ?? "") ||
    JSON.stringify(mathEntries) !== JSON.stringify(activeRow?.journal?.mathProgress?.entries ?? []) ||
    mathSessionKind !== (activeRow?.journal?.mathProgress?.sessionKind ?? "math");
  // 과제와 비고는 날짜별 기록이다. 수학 과정은 진행 중인 항목만 다음 일지로 이어받는다.
  const copyReference = () => {
    const reference = recentLesson.data;
    if (!reference || !activeRow) return;
    if (activeRow.classGroup.subject === "수학" && (content.trim() || mathEntries.length) &&
        !window.confirm("현재 입력 중인 수업 내용과 과정 선택을 이전 일지로 바꿀까요?")) return;
    if (activeRow.classGroup.subject !== "수학" || isLegacyMathJournal) {
      setContent(reference.content ?? "");
      toast.success(`${reference.journalDate} 수업 내용을 불러왔습니다.`);
      return;
    }
    const previous = reference.mathProgress;
    if (previous?.sessionKind === "math" && previous.entries.length) {
      const validEntries = carryForwardMathJournalEntries(previous.entries, journalDate);
      setContent(previous.freeText);
      setMathEntries(validEntries);
      setMathSessionKind("math");
      if (!validEntries.length)
        toast.info("완료·건너뜀 항목은 다시 복사하지 않았습니다. 오늘 진행할 과정을 선택해 주세요.");
      else
        toast.success(`${reference.journalDate} 수업 내용과 진행 중인 과정 ${validEntries.length}개를 가져왔습니다.`);
      return;
    }
    const suggestion = suggestMathJournalCopy(reference.content ?? "", journalDate);
    if (suggestion) {
      const carriedEntries = carryForwardMathJournalEntries(suggestion.entries, journalDate);
      if (!carriedEntries.length) {
        setContent(suggestion.freeText);
        setMathEntries([]);
        setMathSessionKind("math");
        toast.info("이전 일지의 완료·건너뜀 항목은 다시 복사하지 않았습니다. 오늘 진행할 과정을 선택해 주세요.");
        return;
      }
      const proposedItems = carriedEntries.map(entry => `${mathItemLabel(entry.key, journalDate)} · 진행 중`).join("\n");
      if (window.confirm(`이전 일지에서 아래 수학 과정을 찾았습니다. 이번 일지의 선택 항목으로 가져올까요?\n\n${proposedItems}\n\n확인 후 이번 수업에 맞게 수정할 수 있습니다.`)) {
        setContent(suggestion.freeText);
        setMathEntries(carriedEntries);
        setMathSessionKind("math");
        toast.success("이전 수업 내용과 확인한 수학 과정을 가져왔습니다.");
        return;
      }
      setContent(suggestion.freeText);
      setMathEntries([]);
      setMathSessionKind("math");
      toast.info("과정 항목은 가져오지 않고 설명만 복사했습니다.");
      return;
    }
    setContent(reference.content ?? "");
    setMathEntries([]);
    setMathSessionKind("math");
    toast.warning("글만 복사했습니다. 수학 진도에 반영하려면 과정 항목을 선택해 주세요.");
  };
  const isProcessing = save.isPending || insert.isPending || deleteAndPull.isPending;
  const moveDate = (direction: -1 | 1) => {
    if (isProcessing || isLoadingDate) return;
    if (hasUnsavedChanges && !window.confirm("저장하지 않은 수업 내용이나 과정 선택이 있습니다. 날짜를 이동하면 입력 내용이 사라집니다. 이동할까요?")) return;
    setJournalDate(current => getAdjacentJournalDate(current, direction, includeWeekend));
  };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => { if (event.touches.length !== 1 || event.target instanceof Element && event.target.closest("button, input, textarea, select, [contenteditable=true]")) { swipeStartRef.current = null; return; } const touch = event.touches[0]; swipeStartRef.current = { x: touch.clientX, y: touch.clientY }; };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => { const start = swipeStartRef.current; swipeStartRef.current = null; if (!start || event.changedTouches.length !== 1) return; const touch = event.changedTouches[0]; const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; if (Math.abs(deltaX) < 56 || Math.abs(deltaY) > 56) return; moveDate(deltaX < 0 ? 1 : -1); };
  const canTempSave = Boolean(content.trim() || homework.trim() || notes.trim() || mathEntries.length);
  const changeMathSessionKind = (value: MathJournalPayload["sessionKind"]) => {
    if (value === mathSessionKind) return;
    if (value === "english") {
      if ((content.trim() && content.trim() !== "영어 집중 수업" || mathEntries.length) &&
          !window.confirm("현재 수학 수업 내용과 과정 선택을 영어 집중 수업 기록으로 바꿀까요?")) return;
      setContent("영어 집중 수업");
      setMathEntries([]);
    }
    if (value === "math" && content.trim() === "영어 집중 수업") setContent("");
    setMathSessionKind(value);
  };
  const saveJournal = (isDraft: boolean, closeAfterSave: boolean) => {
    if (!activeRow) return;
    const isMath = activeRow.classGroup.subject === "수학";
    const clearingBlockedMath = isMath && !canWriteLesson;
    if (clearingBlockedMath && (content.trim() || mathEntries.length || activeRow.journal?.content.trim() || activeRow.journal?.mathProgress?.entries.length) &&
        !window.confirm("결석·미등록·공휴일·휴강일로 변경되어 기존 수학 수업 내용과 과정 선택을 지우고 비고만 저장합니다. 계속할까요?")) return;
    closeAfterSaveRef.current = closeAfterSave;
    const savedContent = clearingBlockedMath ? "" : content;
    const mathProgress = isMath && !isLegacyMathJournal ? {
      version: 1 as const,
      sessionKind: clearingBlockedMath ? "math" as const : mathSessionKind,
      freeText: savedContent,
      entries: clearingBlockedMath || mathSessionKind !== "math" ? [] : mathEntries,
    } : undefined;
    save.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate,
      content: savedContent, homework: canWriteLesson ? homework : "", notes, isDraft, mathProgress });
  };
  const deleteJournal = () => {
    if (!activeRow || isProcessing) return;
    if (!window.confirm("현재 날짜의 수업일지 내용을 삭제하고, 미래에 저장된 같은 학생·과목의 수업일지를 현재 날짜부터 순서대로 당길까요?\n\n확인을 누르면 현재 칸의 내용은 삭제되며 되돌릴 수 없습니다.")) return;
    deleteAndPull.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate, includeWeekend });
  };
  const insertJournal = () => {
    if (!activeRow || isProcessing) return;
    const dateRule = includeWeekend ? "토·일을 포함해 다음 날짜" : "토·일을 건너뛰어 다음 평일";
    const blockedRule = "공휴일·휴강일·해당 학생의 결석·미등록일은 건너뜁니다.";
    const unsavedWarning = hasUnsavedChanges ? "\n\n현재 입력 중인 저장 전 내용은 이동되지 않고 사라질 수 있습니다." : "";
    if (!window.confirm(`현재 날짜에 새 수업일지 자리를 추가할까요?\n현재와 이후에 저장된 같은 학생·과목의 일지는 ${dateRule}로 한 칸씩 이동합니다. ${blockedRule}${unsavedWarning}`)) return;
    insert.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate, includeWeekend });
  };
  const requestClose = () => {
    if (isProcessing) return;
    if (!isLoadingDate && !loadError && hasUnsavedChanges && !window.confirm("저장하지 않은 수업 내용이나 과정 선택이 있습니다. 입력을 버리고 닫을까요?")) return;
    onClose();
  };
  return <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) requestClose(); }}><DialogContent className="journal-dialog journal-editor-dialog sm:max-w-[620px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}><DialogHeader className="journal-editor-header"><p className="eyebrow">{row?.classGroup.subject} · {journalDate} · {weekdayLabel(journalDate)}</p><DialogTitle>{row?.student.name} 학생 수업일지</DialogTitle><DialogDescription>{row?.student.grade} · {row?.classGroup.name} · {isLoadingDate ? "기록을 불러오는 중" : loadError ? "일지 불러오기 실패" : `출석 ${attendanceStatusLabels[activeRow?.attendance?.status ?? "not_entered"]}`}<span className="mt-1 block text-[11px] sm:hidden">좌우로 쓸어 전날·다음날 일지로 이동할 수 있습니다.</span></DialogDescription><div className="mt-3 flex items-center gap-1" aria-label="수업일지 날짜 이동"><Button type="button" variant="outline" size="sm" className="h-8 px-2.5" disabled={isProcessing || isLoadingDate} onClick={() => moveDate(-1)} aria-label="전날 수업일지"><ChevronLeft className="mr-0.5 h-4 w-4" />전날</Button><Button type="button" variant="outline" size="sm" className="h-8 px-2.5" disabled={isProcessing || isLoadingDate} onClick={() => moveDate(1)} aria-label="다음날 수업일지">다음날<ChevronRight className="ml-0.5 h-4 w-4" /></Button></div></DialogHeader><div className="journal-editor-body">{isLoadingDate ? <div className="space-y-4 py-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-20 w-full" /></div> : loadError ? <div className="rounded-lg border border-[#EDC7BE] bg-[#FFF3EF] p-4 text-sm text-[#934B3D]">일지를 불러오지 못했습니다. 다시 시도해 주세요.<Button type="button" variant="outline" size="sm" className="mt-3 block" onClick={() => void dailyWorkspace.refetch()}>다시 시도</Button></div> : <>{!canWriteLesson && <div className="journal-write-block"><AlertCircle className="h-4 w-4" />결석·미등록일에는 수업 내용과 과제 대신 비고에 보강 계획을 입력할 수 있습니다.</div>}<div className="grid gap-5 py-3">{recentLesson.data && <div className="journal-reference"><div><b>{row?.classGroup.subject === "수학" ? "이전 수학 과정 참고" : "최근 입력 수업 참고"}</b><p>{recentLesson.data.journalDate} · {recentLesson.data.content || recentLesson.data.homework || "작성된 기록"}</p></div><Button type="button" variant="outline" size="sm" disabled={!canWriteLesson} onClick={copyReference}>{row?.classGroup.subject === "수학" ? "이전 수학 일지 가져오기" : "복사·붙여넣기"}</Button></div>}<div className="grid gap-2"><Label htmlFor="lesson-content">{"수업 내용"} <b className="text-[#B8891B]">{row?.classGroup.subject === "수학" ? "선택" : "필수"}</b></Label><Textarea autoFocus={row?.classGroup.subject !== "수학"} id="lesson-content" disabled={!canWriteLesson} value={content} onChange={event => setContent(event.target.value)} placeholder="오늘 진행한 단원과 학습 활동을 기록해 주세요." className="journal-lesson-content-input" /></div>{row?.classGroup.subject === "수학" && <MathJournalSelection key={`${row.student.id}-${journalDate}`} date={journalDate} grade={row.student.grade} sessionKind={mathSessionKind} entries={mathEntries} legacy={isLegacyMathJournal} disabled={!canWriteLesson || isLegacyMathJournal} previousEntries={previousMathEntries} onSessionKindChange={changeMathSessionKind} onEntriesChange={setMathEntries} onReviewSuggestion={suggestion => setContent(value => appendMathReviewText(value, mathEntries, suggestion))} />}<div className="grid gap-2"><Label htmlFor="lesson-homework">과제 <span className="text-[#71817D]">선택</span></Label><select id="lesson-homework" aria-label="과제 수행도" disabled={!canWriteLesson} value={(HOMEWORK_STATUS_OPTIONS as readonly string[]).includes(homework) ? homework : ""} onChange={event => setHomework(event.target.value)} className="journal-select">{homework !== "" && !(HOMEWORK_STATUS_OPTIONS as readonly string[]).includes(homework) && <option value={homework}>{homework}</option>}<option value="">선택 안 함</option>{HOMEWORK_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select>{homework && (HOMEWORK_STATUS_OPTIONS as readonly string[]).includes(homework) && <p className="text-[11px] text-[#8A7A58]">{homeworkStatusDescriptions[homework as HomeworkStatusOption]}</p>}</div><div className="grid gap-2"><Label htmlFor="lesson-notes">비고 <span className="text-[#71817D]">선택</span></Label><Textarea id="lesson-notes" disabled={!canWriteNotes} value={notes} onChange={event => setNotes(event.target.value)} placeholder={attendanceStatus === "absent" || attendanceStatus === "not_registered" ? "보강 예정일과 계획을 입력해 주세요." : "학습 태도, 상담 내용, 개별 안내 사항 등을 기록해 주세요."} className="min-h-20" /></div></div></>}</div><DialogFooter className="journal-editor-footer"><Button variant="outline" onClick={requestClose} disabled={isProcessing}>취소</Button><Button type="button" variant="outline" className="border-[#D6A7A0] bg-[#FFF4F1] text-[#9B4B3F] hover:bg-[#FDE8E3]" disabled={isProcessing || !activeRow || !canWriteLesson || isLoadingDate} onClick={deleteJournal}><Trash2 className="mr-1.5 h-4 w-4" />삭제</Button><Button type="button" variant="outline" className="border-[#D9C28A] bg-[#FFF8DE] text-[#765E10] hover:bg-[#FFF2C9]" disabled={isProcessing || !activeRow || !canWriteLesson || isLoadingDate} onClick={insertJournal}><Plus className="mr-1.5 h-4 w-4" />추가하기</Button><Button variant="outline" disabled={isProcessing || !activeRow || !canWriteNotes || isLoadingDate || !canTempSave} onClick={() => saveJournal(true, true)}><Save className="mr-1.5 h-4 w-4" />임시 저장</Button><Button variant="outline" disabled={isProcessing || !activeRow || !canWriteNotes || isLoadingDate} onClick={() => saveJournal(false, false)}><Save className="mr-1.5 h-4 w-4" />저장</Button><Button className="journal-primary-button" disabled={isProcessing || !activeRow || !canWriteNotes || isLoadingDate} onClick={() => saveJournal(false, true)}><Save className="mr-1.5 h-4 w-4" />저장 후 닫기</Button></DialogFooter></DialogContent></Dialog>;
}
