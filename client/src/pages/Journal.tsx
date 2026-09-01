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
import { attendanceStatusBadgeClass, attendanceStatusLabels, chooseJournalClassId, getAdjacentJournalDate, getJournalCompleteness, getMonday, isJournalAttentionDue, type AttendanceStatus } from "@shared/journalRules";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardPenLine, Edit3, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import "./journal.css";

function todayInKorea() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); }
function currentTimeInKorea() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function dayLabel(value: string) { const date = new Date(`${value}T00:00:00Z`); return `${["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]} ${date.getUTCDate()}`; }
function weekdayLabel(value: string) { return `${["일", "월", "화", "수", "목", "금", "토"][new Date(`${value}T00:00:00Z`).getUTCDay()]}요일`; }
const journalSubjectFilterKey = "haemil.journal.subject-filter";

type EditorRow = { classGroup: { id: number; name: string; subject: string; accentColor: string }; student: { id: number; name: string; grade: string }; attendance: { status: AttendanceStatus; arrivalTime: string | null; departureTime: string | null } | null; journal: { content: string; homework: string; notes: string; isDraft?: boolean } | null; completeness: { state: "complete" | "attention" | "not_required"; missingFields: Array<"attendance" | "content" | "homework">; isDraft?: boolean } };
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
  const [editing, setEditing] = useState<{ row: EditorRow; journalDate: string } | null>(null);
  const [commenting, setCommenting] = useState<{ student: EditorRow["student"]; classGroup: EditorRow["classGroup"] } | null>(null);
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
  const today = todayInKorea();
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
  const commentStatus = useMemo(() => new Map((weekly.data?.comments ?? []).map(comment => [`${comment.studentId}-${comment.classGroupId}`, Boolean(comment.comment.trim())])), [weekly.data?.comments]);
  const utils = trpc.useUtils();
  const saveAttendance = trpc.academy.attendance.save.useMutation({
    onSuccess: (result, variables) => {
      if ("reason" in result && result.reason === "current_journal_conflict") {
        if (window.confirm("현재 날짜에 이미 작성된 수업일지가 있습니다. 기존 내용을 지우고 이후 수업일지를 현재 날짜로 당길까요?\n\n확인을 누르면 현재 날짜의 기존 내용은 삭제되고, 취소하면 출석 상태를 바꾸지 않습니다.")) {
          saveAttendance.mutate({ ...variables, overwriteCurrentJournal: true });
        } else toast.info("출석 상태 변경을 취소했습니다.");
        return;
      }
      void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate();
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
    <section className="journal-filter-bar"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="과목 복수 선택"><span className="mr-1 text-xs font-semibold text-[#556C68]">과목</span>{classGroups.data?.map(group => { const selected = selectedClasses.has(group.id); return <Button type="button" key={group.id} variant={selected ? "default" : "outline"} size="sm" className={selected ? "journal-primary-button h-9" : "h-9 bg-[#FFFEFA]"} onClick={() => selectClass(group.id)} aria-pressed={selected}>{group.subject}</Button>; })}</div><button className={`journal-attention-filter ${attentionOnly ? "is-active" : ""}`} onClick={() => setAttentionOnly(value => !value)}><AlertCircle className="h-4 w-4" />등원 전 항목만 보기</button><div className="flex items-center gap-2 rounded-xl border border-[#E5DFD3] bg-[#FCFBF7] px-3 py-2"><Switch checked={includeWeekend} onCheckedChange={setIncludeWeekend} id="weekend-journal" /><label htmlFor="weekend-journal" className="cursor-pointer text-xs font-semibold text-[#556C68]">주말 입력 포함</label></div></section>
    <div className="journal-guidance mt-4"><CalendarDays className="h-4 w-4" /><span><b>{weekStart} 주간 입력</b> · {attentionOnly ? `${today}까지 실제 입력이 필요한 등원 전 항목만 표시합니다.` : "날짜별 셀을 누르면 바로 수업일지를 작성할 수 있습니다."}</span><Badge className="ml-auto bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">총 {visibleRecords}명</Badge></div>
    <section className="mt-6 space-y-6">{weekly.isLoading || !classFilterInitialized ? Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-56 w-full" key={index} />) : groups.length ? groups.map(group => <JournalWeekGroup key={group.classGroup.id} group={group} dates={visibleDates} commentStatus={commentStatus} onEdit={(row, journalDate) => setEditing({ row, journalDate })} onComment={(student, classGroup) => setCommenting({ student, classGroup })} onAttendanceChange={handleAttendanceChange} />) : <Card className="journal-surface"><CardContent className="journal-empty-state"><ClipboardPenLine className="h-7 w-7" /><h3>{attentionOnly ? "확인할 등원 전 항목이 없습니다." : "수업일지를 작성할 반 또는 학생이 없습니다."}</h3><p>{attentionOnly ? `${today}까지 필요한 수업 기록이 모두 입력되었습니다.` : "관리자가 반과 학생을 등록한 뒤 다시 확인해 주세요."}</p></CardContent></Card>}</section>
    <JournalEditor editing={editing} includeWeekend={includeWeekend} onClose={() => setEditing(null)} />
    <WeeklyCommentEditor commenting={commenting} weekStart={weekStart} onClose={() => setCommenting(null)} />
  </div>;
}

function JournalWeekGroup({ group, dates, commentStatus, onEdit, onComment, onAttendanceChange }: { group: { classGroup: EditorRow["classGroup"]; students: WeekStudent[] }; dates: string[]; commentStatus: Map<string, boolean>; onEdit: (row: EditorRow, date: string) => void; onComment: (student: EditorRow["student"], classGroup: EditorRow["classGroup"]) => void; onAttendanceChange: (row: EditorRow, journalDate: string, status: AttendanceStatus) => void }) {
  return <Card id={`journal-group-${group.classGroup.id}`} className="journal-surface scroll-mt-20 overflow-hidden"><div className="journal-group-header" style={{ borderLeftColor: group.classGroup.accentColor }}><div><p className="eyebrow">WEEKLY SUBJECT</p><h2>{group.classGroup.subject}</h2></div><Badge className="bg-white/80 text-[#46625E] hover:bg-white">{group.students.length}명</Badge></div><CardContent className="overflow-x-auto p-0"><div className="min-w-[760px]"><div className="grid border-b border-[#E3DFD5] bg-[#FAF8F2] text-[10px] font-bold tracking-[0.08em] text-[#7A8985]" style={{ gridTemplateColumns: `minmax(150px, 0.9fr) repeat(${dates.length}, minmax(132px, 1fr))` }}><div className="px-4 py-3">학생</div>{dates.map(date => <div className="border-l border-[#E8E3D8] px-3 py-3" key={date}>{dayLabel(date)}</div>)}</div>{group.students.map(student => { const hasComment = commentStatus.get(`${student.student.id}-${group.classGroup.id}`) ?? false; return <div id={`journal-student-${group.classGroup.id}-${student.student.id}`} className="grid border-b border-[#EEE9DE] last:border-b-0 scroll-mt-24" style={{ gridTemplateColumns: `minmax(150px, 0.9fr) repeat(${dates.length}, minmax(132px, 1fr))` }} key={student.student.id}><div className="px-4 py-4"><p className="font-serif text-lg text-[#193D3C]">{student.student.name}</p><p className="mt-0.5 text-xs text-[#71817D]">{student.student.grade}</p><div className="mt-2 flex flex-wrap items-center gap-1"><Badge className={hasComment ? "bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]" : "bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]"}>{hasComment ? "공개 비고 작성됨" : "공개 비고 미작성"}</Badge><Button variant="ghost" size="sm" className="h-7 px-1.5 text-[11px] text-[#55716C]" onClick={() => onComment(student.student, group.classGroup)}><MessageSquareText className="mr-1 h-3 w-3" />{hasComment ? "수정" : "작성"}</Button></div></div>{dates.map(date => <JournalCell key={date} row={student.cells.get(date)} onClick={() => { const row = student.cells.get(date); if (row) onEdit(row, date); }} journalDate={date} onAttendanceChange={onAttendanceChange} />)}</div>; })}</div></CardContent></Card>;
}

function JournalCell({ row, journalDate, onClick, onAttendanceChange }: { row: EditorRow | undefined; journalDate: string; onClick: () => void; onAttendanceChange: (row: EditorRow, journalDate: string, status: AttendanceStatus) => void }) { if (!row) return <div className="border-l border-[#EEE9DE] p-3" />; const isAttention = row.completeness.state === "attention"; const status = row.attendance?.status ?? "not_entered"; return <div className={`min-h-[112px] border-l border-[#EEE9DE] p-3 text-left transition-colors hover:bg-[#FAF7EF] ${isAttention ? "bg-[#FFFDF4]" : ""}`}><div className="flex items-center justify-between gap-1"><select aria-label={`${row.student.name} ${journalDate} 출석 상태`} value={status} onChange={event => onAttendanceChange(row, journalDate, event.target.value as AttendanceStatus)} onClick={event => event.stopPropagation()} className={`rounded-full border-0 px-2 py-1 text-xs font-semibold outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-[#B8891B] ${attendanceStatusBadgeClass(status)}`}>{(status === "holiday" || status === "closed") && <option value={status}>{attendanceStatusLabels[status]}</option>}<option value="not_entered">{attendanceStatusLabels.not_entered}</option><option value="present">{attendanceStatusLabels.present}</option><option value="absent">{attendanceStatusLabels.absent}</option><option value="not_registered">{attendanceStatusLabels.not_registered}</option><option value="makeup">{attendanceStatusLabels.makeup}</option><option value="makeup_double">{attendanceStatusLabels.makeup_double}</option></select><button type="button" aria-label={`${row.student.name} ${journalDate} 수업일지 열기`} onClick={onClick} className="rounded p-1 text-[#81918D] hover:bg-[#EFEADE]"><Edit3 className="h-3.5 w-3.5" /></button></div><button type="button" onClick={onClick} className="mt-2 block w-full text-left"><p className="whitespace-pre-line text-xs leading-5 text-[#3E5651]">{row.journal?.content || (isAttention ? "필수 기록 입력" : "작성 제외")}</p>{row.journal?.homework && <p className="mt-2 whitespace-pre-line text-[11px] leading-4 text-[#84713E]"><b>과제</b> {row.journal.homework}</p>}{row.journal?.notes && <p className="mt-1 whitespace-pre-line text-[11px] leading-4 text-[#7C6A5C]"><b>비고</b> {row.journal.notes}</p>}{isAttention && <p className="mt-2 text-[10px] font-semibold text-[#A37C14]">{row.completeness.isDraft ? "임시 저장 · 최종 저장 필요" : `${row.completeness.missingFields.map(value => ({ attendance: "출석", content: "내용", homework: "과제" }[value])).join(" · ")} 등원 전`}</p>}</button></div>; }

function WeeklyCommentEditor({ commenting, weekStart, onClose }: { commenting: { student: EditorRow["student"]; classGroup: EditorRow["classGroup"] } | null; weekStart: string; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const utils = trpc.useUtils();
  const input = useMemo(() => commenting ? { studentId: commenting.student.id, weekStart } : { studentId: 1, weekStart }, [commenting, weekStart]);
  const comments = trpc.academy.weeklyComments.list.useQuery(input, { enabled: Boolean(commenting) });
  useEffect(() => { setComment(comments.data?.find(item => item.classGroupId === commenting?.classGroup.id)?.comment ?? ""); }, [commenting, comments.data]);
  const save = trpc.academy.weeklyComments.save.useMutation({ onSuccess: () => { void utils.academy.weeklyComments.invalidate(); void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.publicStudent.invalidate(); toast.success("보호자 공개 비고를 저장했습니다."); onClose(); }, onError: error => toast.error(error.message) });
  return <Dialog open={Boolean(commenting)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="journal-dialog sm:max-w-[560px]"><DialogHeader><p className="eyebrow">PARENT WEEKLY NOTE</p><DialogTitle>{commenting?.student.name} 학생 공개 비고</DialogTitle><DialogDescription>{weekStart} 주간 · {commenting?.classGroup.name} · 보호자 수업일지의 마지막 비고 열에 표시됩니다.</DialogDescription></DialogHeader><div className="grid gap-2 py-3"><Label htmlFor="weekly-public-comment">주간 안내</Label><Textarea id="weekly-public-comment" value={comment} onChange={event => setComment(event.target.value)} placeholder="이번 주 학습 태도, 다음 주 안내, 보호자에게 전할 내용을 입력해 주세요." className="min-h-32" /></div><DialogFooter><Button variant="outline" onClick={onClose}>취소</Button><Button className="journal-primary-button" disabled={save.isPending || !commenting} onClick={() => commenting && save.mutate({ studentId: commenting.student.id, classGroupId: commenting.classGroup.id, weekStart, comment })}><Save className="mr-1.5 h-4 w-4" />비고 저장</Button></DialogFooter></DialogContent></Dialog>;
}

function JournalEditor({ editing, includeWeekend, onClose }: { editing: { row: EditorRow; journalDate: string } | null; includeWeekend: boolean; onClose: () => void }) {
  const row = editing?.row ?? null;
  const [journalDate, setJournalDate] = useState(() => editing?.journalDate ?? todayInKorea());
  const [content, setContent] = useState(""); const [homework, setHomework] = useState(""); const [notes, setNotes] = useState("");
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const closeAfterSaveRef = useRef(true);
  const utils = trpc.useUtils();
  const workspaceInput = useMemo(() => row ? { journalDate, classGroupId: row.classGroup.id } : { journalDate, classGroupId: 1 }, [journalDate, row?.classGroup.id]);
  const dailyWorkspace = trpc.academy.workspace.useQuery(workspaceInput, { enabled: Boolean(row) });
  const activeRow = useMemo(() => {
    if (!row) return null;
    const workspaceRow = dailyWorkspace.data?.find(item => item.student.id === row.student.id && item.classGroup.id === row.classGroup.id) as EditorRow | undefined;
    return workspaceRow ?? (journalDate === editing?.journalDate ? row : null);
  }, [dailyWorkspace.data, editing?.journalDate, journalDate, row]);
  const referenceInput = useMemo(() => row ? { studentId: row.student.id, classGroupId: row.classGroup.id, journalDate } : { studentId: 1, classGroupId: 1, journalDate }, [journalDate, row?.classGroup.id, row?.student.id]);
  const recentLesson = trpc.academy.journals.recent.useQuery(referenceInput, { enabled: Boolean(row) });
  useEffect(() => { if (editing) setJournalDate(editing.journalDate); }, [editing?.journalDate, editing?.row.classGroup.id, editing?.row.student.id]);
  useEffect(() => { setContent(activeRow?.journal?.content ?? ""); setHomework(activeRow?.journal?.homework ?? ""); setNotes(activeRow?.journal?.notes ?? ""); }, [activeRow?.journal?.content, activeRow?.journal?.homework, activeRow?.journal?.notes, journalDate]);
  const patchJournalCaches = (values: { studentId: number; classGroupId: number; journalDate: string; content: string; homework: string; notes: string; isDraft?: boolean }) => {
    const patchRow = <T extends { student: EditorRow["student"]; classGroup: EditorRow["classGroup"]; attendance: EditorRow["attendance"] }>(raw: T): T => {
      if (raw.student.id !== values.studentId || raw.classGroup.id !== values.classGroupId) return raw;
      return {
        ...raw,
        journal: { content: values.content, homework: values.homework, notes: values.notes, isDraft: values.isDraft },
        completeness: getJournalCompleteness(raw.attendance?.status, values.content, values.homework, Boolean(values.isDraft)),
      } as T;
    };
    utils.academy.workspace.setData(workspaceInput, current => current?.map(raw => patchRow(raw)));
    utils.academy.weeklyWorkspace.setData({ weekAnchor: getMonday(values.journalDate), includeWeekend, ...(values.classGroupId ? { classGroupId: values.classGroupId } : {}) }, current => {
      if (!current) return current;
      return { ...current, days: current.days.map(day => day.journalDate === values.journalDate ? { ...day, rows: day.rows.map(raw => patchRow(raw)) } : day) };
    });
    void utils.academy.dashboard.invalidate();
  };
  const save = trpc.academy.journals.save.useMutation({ onSuccess: (_result, values) => { patchJournalCaches(values); toast.success(values.isDraft ? "임시 저장했습니다. 최종 저장 전까지 등원 전으로 표시됩니다." : "수업일지를 저장했습니다."); if (closeAfterSaveRef.current) onClose(); }, onError: error => toast.error(error.message) });
  const insert = trpc.academy.journals.insert.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); setContent(""); setHomework(""); setNotes(""); toast.success(result.movedCount ? `새 수업일지 자리를 추가했습니다. 저장된 일지 ${result.movedCount}건을 다음 날짜로 이동했습니다.` : "현재 날짜에 새 수업일지 입력 자리를 준비했습니다."); }, onError: error => toast.error(error.message) });
  const deleteAndPull = trpc.academy.journals.deleteAndPull.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); setContent(""); setHomework(""); setNotes(""); toast.success(result.movedCount ? `현재 일지를 삭제하고 미래 수업일지 ${result.movedCount}건을 앞당겼습니다.` : "현재 일지를 삭제했습니다."); onClose(); }, onError: error => toast.error(error.message) });
  const canWrite = activeRow?.attendance?.status !== "absent" && activeRow?.attendance?.status !== "not_registered" && activeRow?.attendance?.status !== "holiday" && activeRow?.attendance?.status !== "closed";
  const copyReference = () => { if (!recentLesson.data) return; setContent(recentLesson.data.content ?? ""); setHomework(recentLesson.data.homework ?? ""); setNotes(recentLesson.data.notes ?? ""); toast.success(`${recentLesson.data.journalDate} 수업 내용을 불러왔습니다.`); };
  const isProcessing = save.isPending || insert.isPending || deleteAndPull.isPending;
  const moveDate = (direction: -1 | 1) => { if (!isProcessing) setJournalDate(current => getAdjacentJournalDate(current, direction, includeWeekend)); };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => { if (event.touches.length !== 1 || event.target instanceof Element && event.target.closest("button, input, textarea, select, [contenteditable=true]")) { swipeStartRef.current = null; return; } const touch = event.touches[0]; swipeStartRef.current = { x: touch.clientX, y: touch.clientY }; };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => { const start = swipeStartRef.current; swipeStartRef.current = null; if (!start || event.changedTouches.length !== 1) return; const touch = event.changedTouches[0]; const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; if (Math.abs(deltaX) < 56 || Math.abs(deltaY) > 56) return; moveDate(deltaX < 0 ? 1 : -1); };
  const isLoadingDate = Boolean(row && journalDate !== editing?.journalDate && dailyWorkspace.isLoading);
  const canTempSave = Boolean(content.trim() || homework.trim() || notes.trim());
  const saveJournal = (isDraft: boolean, closeAfterSave: boolean) => { if (activeRow) { closeAfterSaveRef.current = closeAfterSave; save.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate, content, homework, notes, isDraft }); } };
  const deleteJournal = () => {
    if (!activeRow || isProcessing) return;
    if (!window.confirm("현재 날짜의 수업일지 내용을 삭제하고, 미래에 저장된 같은 학생·과목의 수업일지를 현재 날짜부터 순서대로 당길까요?\n\n확인을 누르면 현재 칸의 내용은 삭제되며 되돌릴 수 없습니다.")) return;
    deleteAndPull.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate, includeWeekend });
  };
  const insertJournal = () => {
    if (!activeRow || isProcessing) return;
    const hasUnsavedChanges = content !== (activeRow.journal?.content ?? "") || homework !== (activeRow.journal?.homework ?? "") || notes !== (activeRow.journal?.notes ?? "");
    const dateRule = includeWeekend ? "토·일을 포함해 다음 날짜" : "토·일을 건너뛰어 다음 평일";
    const unsavedWarning = hasUnsavedChanges ? "\n\n현재 입력 중인 저장 전 내용은 이동되지 않고 사라질 수 있습니다." : "";
    if (!window.confirm(`현재 날짜에 새 수업일지 자리를 추가할까요?\n현재와 이후에 저장된 같은 학생·과목의 일지는 ${dateRule}로 한 칸씩 이동합니다.${unsavedWarning}`)) return;
    insert.mutate({ studentId: activeRow.student.id, classGroupId: activeRow.classGroup.id, journalDate, includeWeekend });
  };
  return <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="journal-dialog journal-editor-dialog sm:max-w-[620px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}><DialogHeader className="journal-editor-header"><p className="eyebrow">{row?.classGroup.subject} · {journalDate} · {weekdayLabel(journalDate)}</p><DialogTitle>{row?.student.name} 학생 수업일지</DialogTitle><DialogDescription>{row?.student.grade} · {row?.classGroup.name} · {isLoadingDate ? "기록을 불러오는 중" : `출석 ${attendanceStatusLabels[activeRow?.attendance?.status ?? "not_entered"]}`}<span className="mt-1 block text-[11px] sm:hidden">좌우로 쓸어 전날·다음날 일지로 이동할 수 있습니다.</span></DialogDescription><div className="mt-3 flex items-center gap-1" aria-label="수업일지 날짜 이동"><Button type="button" variant="outline" size="sm" className="h-8 px-2.5" disabled={isProcessing} onClick={() => moveDate(-1)} aria-label="전날 수업일지"><ChevronLeft className="mr-0.5 h-4 w-4" />전날</Button><Button type="button" variant="outline" size="sm" className="h-8 px-2.5" disabled={isProcessing} onClick={() => moveDate(1)} aria-label="다음날 수업일지">다음날<ChevronRight className="ml-0.5 h-4 w-4" /></Button></div></DialogHeader><div className="journal-editor-body">{isLoadingDate ? <div className="space-y-4 py-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-20 w-full" /></div> : <>{!canWrite && <div className="journal-write-block"><AlertCircle className="h-4 w-4" />결석·미등록·공휴일·휴강 상태입니다. 수업일지를 작성하려면 출석 상태를 먼저 확인해 주세요.</div>}<div className="grid gap-5 py-3">{recentLesson.data && <div className="journal-reference"><div><b>최근 입력 수업 참고</b><p>{recentLesson.data.journalDate} · {recentLesson.data.content || recentLesson.data.homework || "작성된 기록"}</p></div><Button type="button" variant="outline" size="sm" onClick={copyReference}>복사·붙여넣기</Button></div>}<div className="grid gap-2"><Label htmlFor="lesson-content">수업 내용 <b className="text-[#B8891B]">필수</b></Label><Textarea autoFocus id="lesson-content" disabled={!canWrite} value={content} onChange={event => setContent(event.target.value)} placeholder="오늘 진행한 단원과 학습 활동을 기록해 주세요." className="journal-lesson-content-input" /></div><div className="grid gap-2"><Label htmlFor="lesson-homework">과제 <span className="text-[#71817D]">선택</span></Label><Textarea id="lesson-homework" disabled={!canWrite} value={homework} onChange={event => setHomework(event.target.value)} placeholder="숙제, 준비물, 다음 수업 전 확인할 내용을 기록해 주세요." className="min-h-24" /></div><div className="grid gap-2"><Label htmlFor="lesson-notes">비고 <span className="text-[#71817D]">선택</span></Label><Textarea id="lesson-notes" disabled={!canWrite} value={notes} onChange={event => setNotes(event.target.value)} placeholder="학습 태도, 상담 내용, 개별 안내 사항 등을 기록해 주세요." className="min-h-20" /></div></div></>}</div><DialogFooter className="journal-editor-footer"><Button variant="outline" onClick={onClose} disabled={isProcessing}>취소</Button><Button type="button" variant="outline" className="border-[#D6A7A0] bg-[#FFF4F1] text-[#9B4B3F] hover:bg-[#FDE8E3]" disabled={isProcessing || !activeRow || !canWrite || isLoadingDate} onClick={deleteJournal}><Trash2 className="mr-1.5 h-4 w-4" />삭제</Button><Button type="button" variant="outline" className="border-[#D9C28A] bg-[#FFF8DE] text-[#765E10] hover:bg-[#FFF2C9]" disabled={isProcessing || !activeRow || !canWrite || isLoadingDate} onClick={insertJournal}><Plus className="mr-1.5 h-4 w-4" />추가하기</Button><Button variant="outline" disabled={isProcessing || !activeRow || !canWrite || isLoadingDate || !canTempSave} onClick={() => saveJournal(true, true)}><Save className="mr-1.5 h-4 w-4" />임시 저장</Button><Button variant="outline" disabled={isProcessing || !activeRow || !canWrite || isLoadingDate} onClick={() => saveJournal(false, false)}><Save className="mr-1.5 h-4 w-4" />저장</Button><Button className="journal-primary-button" disabled={isProcessing || !activeRow || !canWrite || isLoadingDate} onClick={() => saveJournal(false, true)}><Save className="mr-1.5 h-4 w-4" />저장 후 닫기</Button></DialogFooter></DialogContent></Dialog>;
}
