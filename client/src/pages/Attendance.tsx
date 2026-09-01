import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { attendanceStatusLabels, formatArrivalTimeForDisplay, getMonday, selectableAttendanceStatusValues, type AttendanceStatus } from "@shared/journalRules";
import { isAttendancePending } from "@shared/attendanceSummaryRules";
import { AlertCircle, CalendarDays, CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function todayInKorea() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function dayLabel(value: string) { const date = new Date(`${value}T00:00:00Z`); return `${["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]} ${date.getUTCDate()}`; }
function gradeOrder(value: string) { const normalized = value.trim(); const level = normalized.startsWith("고") ? 0 : normalized.startsWith("중") ? 1 : 2; return level * 100 + (Number(normalized.replace(/[^0-9]/g, "")) || 99); }
const attendanceGradeFilterKey = "haemil.attendance.grade-filter";

type CalendarEvent = { type: "official_holiday" | "closure"; status: "holiday" | "closed"; name: string; description: string | null; imageUrl: string | null; closureId: number | null; startDate: string; endDate: string };
type Attendance = { status: AttendanceStatus; arrivalTime: string | null; departureTime: string | null; calendarEvent: CalendarEvent | null } | null;
type StudentWeek = { id: number; name: string; grade: string; entries: Map<string, Attendance> };

export default function Attendance() {
  const [, setLocation] = useLocation();
  const requestedTarget = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const studentId = Number(query.get("studentId"));
    return { studentId: Number.isInteger(studentId) && studentId > 0 ? studentId : undefined, journalDate: query.get("date") || todayInKorea() };
  }, []);
  const [weekAnchor, setWeekAnchor] = useState(() => requestedTarget.journalDate);
  const [includeWeekend, setIncludeWeekend] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(() => new Set((window.localStorage.getItem(attendanceGradeFilterKey) ?? "").split("|").filter(Boolean)));
  const [attentionOnly, setAttentionOnly] = useState(false);
  const weekStart = getMonday(weekAnchor);
  const input = useMemo(() => ({ weekAnchor: weekStart, includeWeekend }), [weekStart, includeWeekend]);
  const { data, isLoading } = trpc.academy.weeklyWorkspace.useQuery(input, {
    refetchInterval: 10_000,
  });
  const utils = trpc.useUtils();
  const save = trpc.academy.attendance.save.useMutation({
    onSuccess: (result, variables) => {
      if ("reason" in result && result.reason === "current_journal_conflict") {
        if (window.confirm("현재 날짜에 이미 작성된 수업일지가 있습니다. 기존 내용을 지우고 이후 수업일지를 현재 날짜로 당길까요?\n\n확인을 누르면 기존 내용은 삭제되고, 취소하면 출석 상태를 바꾸지 않습니다.")) save.mutate({ ...variables, overwriteCurrentJournal: true });
        else toast.info("출석 상태 변경을 취소했습니다.");
        return;
      }
      void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); void utils.academy.students.invalidate();
      const pulledFrom = result.pulledFrom ?? [];
      toast.success(pulledFrom.length ? `출석 상태를 저장하고 이후 수업일지 ${pulledFrom.length}건을 현재 날짜로 당겼습니다.` : "출석 상태를 저장했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const fillWeekdays = trpc.academy.attendance.fillWeekdays.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); void utils.academy.students.invalidate(); toast.success(result.saved ? `등원 전 ${result.saved}일을 출석으로 저장했습니다.` : "이미 입력된 평일 출석입니다."); }, onError: error => toast.error(error.message) });
  const resetCodeEvents = trpc.academy.attendance.resetCodeEvents.useMutation({ onSuccess: result => { void utils.academy.weeklyWorkspace.invalidate(); void utils.academy.workspace.invalidate(); void utils.academy.dashboard.invalidate(); toast[result.reset ? "success" : "info"](result.reset ? "등하원 입력을 초기화했습니다. 학생 번호를 다시 입력할 수 있습니다." : "초기화할 등하원 번호 입력 기록이 없습니다."); }, onError: error => toast.error(error.message) });
  const students = useMemo(() => {
    const found = new Map<number, StudentWeek>();
    data?.days.forEach(day => day.rows.forEach(row => { if (!found.has(row.student.id)) found.set(row.student.id, { id: row.student.id, name: row.student.name, grade: row.student.grade, entries: new Map() }); const target = found.get(row.student.id); if (target && !target.entries.has(day.journalDate)) target.entries.set(day.journalDate, row.attendance ? { ...row.attendance, calendarEvent: row.calendarEvent as CalendarEvent | null } : null); }));
    return Array.from(found.values()).sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade) || a.name.localeCompare(b.name, "ko"));
  }, [data]);
  const grades = useMemo(() => Array.from(new Set(students.map(student => student.grade))).sort((a, b) => gradeOrder(a) - gradeOrder(b) || a.localeCompare(b, "ko")), [students]);
  useEffect(() => {
    if (!grades.length) return;
    setSelectedGrades(current => {
      const valid = Array.from(current).filter(grade => grades.includes(grade));
      return new Set(valid.length ? valid : [grades[0]!]);
    });
  }, [grades]);
  const today = todayInKorea();
  const visibleDates = useMemo(() => attentionOnly ? (data?.dates ?? []).filter(date => date <= today) : (data?.dates ?? []), [attentionOnly, data?.dates, today]);
  const visibleStudents = useMemo(() => students.filter(student => {
    if (selectedGrades.size && !selectedGrades.has(student.grade)) return false;
    return !attentionOnly || visibleDates.some(date => isAttendancePending(student.entries.get(date)?.status ?? null));
  }), [attentionOnly, selectedGrades, students, visibleDates]);
  const hasFocusedRequestedStudent = useRef(false);
  useEffect(() => {
    if (!requestedTarget.studentId || hasFocusedRequestedStudent.current || isLoading) return;
    const target = document.getElementById(`attendance-student-${requestedTarget.studentId}`);
    if (!target) return;
    hasFocusedRequestedStudent.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [isLoading, requestedTarget.studentId, students]);
  const selectGrade = (grade: string) => { setSelectedGrades(current => { const next = new Set(current); if (next.has(grade) && next.size > 1) next.delete(grade); else next.add(grade); window.localStorage.setItem(attendanceGradeFilterKey, Array.from(next).join("|")); return next; }); };
  return <div className="journal-page-shell"><section className="journal-page-heading"><div><p className="eyebrow">WEEKLY ATTENDANCE</p><h1>출석 관리</h1><p>한 주의 출석을 한 화면에서 입력합니다. 필요한 경우 주말 수업도 함께 기록할 수 있습니다.</p></div><div className="flex flex-wrap items-center justify-end gap-2"><Button variant="outline" className="bg-white" onClick={() => setLocation("/closures")}><CalendarPlus className="mr-1.5 h-4 w-4" />휴강 관리</Button><div className="journal-date-nav"><Button variant="outline" size="icon" onClick={() => setWeekAnchor(shiftDate(weekStart, -7))} aria-label="이전 주"><ChevronLeft className="h-4 w-4" /></Button><Input type="date" value={weekStart} onChange={event => setWeekAnchor(event.target.value)} /><Button variant="outline" size="icon" onClick={() => setWeekAnchor(shiftDate(weekStart, 7))} aria-label="다음 주"><ChevronRight className="h-4 w-4" /></Button></div></div></section>
    <section className="journal-filter-bar"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="학년 복수 선택"><span className="mr-1 text-xs font-semibold text-[#556C68]">학년</span>{grades.map(grade => { const selected = selectedGrades.has(grade); return <Button type="button" key={grade} variant={selected ? "default" : "outline"} size="sm" className={selected ? "journal-primary-button h-9" : "h-9 bg-[#FFFEFA]"} onClick={() => selectGrade(grade)} aria-pressed={selected}>{grade}</Button>; })}</div><button type="button" className={`journal-attention-filter ${attentionOnly ? "is-active" : ""}`} onClick={() => setAttentionOnly(value => !value)}><AlertCircle className="h-4 w-4" />등원 전 항목만 보기</button><div className="flex items-center gap-2 rounded-xl border border-[#E5DFD3] bg-[#FCFBF7] px-3 py-2"><Switch checked={includeWeekend} onCheckedChange={setIncludeWeekend} id="weekend-attendance" /><label htmlFor="weekend-attendance" className="cursor-pointer text-xs font-semibold text-[#556C68]">주말 입력 포함</label></div></section>
    <div className="journal-guidance mt-4"><Clock3 className="h-4 w-4" /><span><b>주간 입력 방식입니다.</b> {attentionOnly ? `${today}까지 실제 출석 입력이 필요한 학생만 표시합니다.` : <>요일별 상태를 선택하고, 등원 시간은 오후 기준으로 입력하세요. 예: 3:15 → 15:15<br className="hidden md:block" /><span className="text-[#55716C]">법정공휴일은 이름과 함께 평일에 자동 적용되며 선택 목록에는 보이지 않습니다. 실제 수업한 경우 출석 상태로 재정의할 수 있고, 학원 자체 휴강은 ‘휴강’으로 입력하거나 휴강 관리에서 기간 등록할 수 있습니다.</span></>}</span><Badge className="ml-auto bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">{attentionOnly ? `등원 전 ${visibleStudents.length}명` : `${Array.from(selectedGrades).join(" · ")} ${visibleStudents.length}명`}</Badge></div>
    <section className="mt-6 space-y-3">{isLoading ? Array.from({ length: 5 }).map((_, index) => <Skeleton className="h-44 w-full" key={index} />) : visibleStudents.length ? visibleStudents.map(student => <AttendanceWeekCard key={student.id} student={student} dates={visibleDates} pending={save.isPending || fillWeekdays.isPending || resetCodeEvents.isPending} onSave={(journalDate, status, arrivalTime, departureTime) => save.mutate({ studentId: student.id, journalDate, status, arrivalTime, departureTime })} onReset={journalDate => { if (window.confirm(`${student.name} 학생의 ${journalDate} 등하원 번호 입력 기록과 시간을 초기화할까요?\n\n초기화 후 학생 고유번호를 다시 입력할 수 있습니다.`)) resetCodeEvents.mutate({ studentId: student.id, eventDate: journalDate }); }} onFillWeekdays={journalDates => fillWeekdays.mutate({ studentId: student.id, journalDates })} />) : <NoStudentMessage grade={Array.from(selectedGrades).join(" · ") || undefined} attentionOnly={attentionOnly} />}</section>
  </div>;
}

function AttendanceWeekCard({ student, dates, pending, onSave, onReset, onFillWeekdays }: { student: StudentWeek; dates: string[]; pending: boolean; onSave: (date: string, status: AttendanceStatus, arrivalTime: string, departureTime: string) => void; onReset: (date: string) => void; onFillWeekdays: (journalDates: string[]) => void }) {
  const weekdayDates = dates.filter(date => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day >= 1 && day <= 5; });
  const unenteredWeekdays = weekdayDates.filter(date => { const status = student.entries.get(date)?.status; return !status || status === "not_entered"; });
  return <Card id={`attendance-student-${student.id}`} tabIndex={-1} className="journal-surface overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#B8891B]"><CardContent className="p-0"><div className="flex items-center justify-between gap-3 border-b border-[#E8E3D8] bg-[#FCFBF7] px-4 py-3"><div><h2 className="font-serif text-lg text-[#193D3C]">{student.name}</h2><p className="mt-0.5 text-xs text-[#71817D]">{student.grade}</p></div><Button type="button" size="sm" disabled={pending || !unenteredWeekdays.length} onClick={() => onFillWeekdays(unenteredWeekdays)} className="h-8 shrink-0 bg-[#E8EFED] text-xs font-semibold text-[#315B57] hover:bg-[#D8E6E0] disabled:bg-[#EEF1EF] disabled:text-[#8C9B97]"><CheckCheck className="mr-1 h-3.5 w-3.5" />{unenteredWeekdays.length ? `평일 ${unenteredWeekdays.length}일 입력` : "평일 입력 완료"}</Button></div><div className={`grid divide-x divide-[#EEE9DE] ${dates.length === 7 ? "grid-cols-1 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-1 sm:grid-cols-3 lg:grid-cols-5"}`}>{dates.map(date => <AttendanceDayCell key={date} journalDate={date} attendance={student.entries.get(date) ?? null} pending={pending} onSave={(status, arrivalTime, departureTime) => onSave(date, status, arrivalTime, departureTime)} onReset={() => onReset(date)} />)}</div></CardContent></Card>;
}

function AttendanceDayCell({ journalDate, attendance, pending, onSave, onReset }: { journalDate: string; attendance: Attendance; pending: boolean; onSave: (status: AttendanceStatus, arrivalTime: string, departureTime: string) => void; onReset: () => void }) {
  const [status, setStatus] = useState<AttendanceStatus>(attendance?.status ?? "not_entered");
  const [arrivalTime, setArrivalTime] = useState(attendance?.arrivalTime ? formatArrivalTimeForDisplay(attendance.arrivalTime) : "");
  const [departureTime, setDepartureTime] = useState(attendance?.departureTime ? formatArrivalTimeForDisplay(attendance.departureTime) : "");
  useEffect(() => { setStatus(attendance?.status ?? "not_entered"); setArrivalTime(attendance?.arrivalTime ? formatArrivalTimeForDisplay(attendance.arrivalTime) : ""); setDepartureTime(attendance?.departureTime ? formatArrivalTimeForDisplay(attendance.departureTime) : ""); }, [attendance?.arrivalTime, attendance?.departureTime, attendance?.status, journalDate]);
  const calendarEvent = attendance?.calendarEvent ?? null;
  const automaticEvent = Boolean(calendarEvent && status === calendarEvent.status);
  const disabledTime = automaticEvent || status === "absent" || status === "not_registered" || status === "closed";
  const selectValue = automaticEvent ? "__automatic_calendar_event__" : status;
  const saveCurrentStatus = () => {
    if (automaticEvent && calendarEvent) {
      toast.info(`${calendarEvent.name}은 자동 적용 중입니다. 실제 수업을 진행한 경우에만 상태를 변경해 저장해 주세요.`);
      return;
    }
    onSave(status, arrivalTime, departureTime);
  };
  return <div className={`min-w-0 p-3 ${status === "not_entered" ? "bg-[#FFFDF3]" : ""}`}><div className="mb-2 flex items-center justify-between"><b className="text-xs text-[#48615C]">{dayLabel(journalDate)}</b>{status === "not_entered" && <span className="h-2 w-2 rounded-full bg-[#E1B937]" />}</div>{automaticEvent && calendarEvent && <div className="mb-2 rounded-lg border border-[#E6D9BD] bg-[#FFF9EC] px-2.5 py-2"><p className="text-xs font-semibold text-[#775A1F]">{calendarEvent.name}</p><small className="mt-0.5 block text-[10px] text-[#957842]">{calendarEvent.type === "official_holiday" ? "법정공휴일 자동 적용" : "등록한 휴강 기간 자동 적용"}</small></div>}<select value={selectValue} onChange={event => { const rawValue = event.target.value; if (rawValue === "__automatic_calendar_event__") return; const next = rawValue as AttendanceStatus; setStatus(next); if (next === "absent" || next === "not_registered" || next === "closed") { setArrivalTime(""); setDepartureTime(""); } }} className="journal-select h-9 w-full text-xs">{automaticEvent && calendarEvent && <option value="__automatic_calendar_event__" disabled>{calendarEvent.type === "official_holiday" ? "법정공휴일 (자동)" : "휴강 (자동)"}</option>}{selectableAttendanceStatusValues.map(value => <option value={value} key={value}>{attendanceStatusLabels[value]}</option>)}</select><Input disabled={disabledTime} value={arrivalTime} placeholder="등원 시간 (예: 3:15)" className="mt-2 h-9 text-xs" onChange={event => { setArrivalTime(event.target.value); if (event.target.value.trim() && status === "not_entered") setStatus("present"); }} onKeyDown={event => { if (event.key === "Enter") saveCurrentStatus(); }} /><Input disabled={disabledTime} value={departureTime} placeholder="하원 시간 (예: 7:30)" className="mt-2 h-9 text-xs" onChange={event => { setDepartureTime(event.target.value); if (event.target.value.trim() && status === "not_entered") setStatus("present"); }} onKeyDown={event => { if (event.key === "Enter") saveCurrentStatus(); }} /><div className="mt-2 grid grid-cols-2 gap-1.5"><Button size="sm" disabled={pending} onClick={saveCurrentStatus} className="h-8 journal-primary-button text-xs"><Save className="mr-1 h-3.5 w-3.5" />저장</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={onReset} className="h-8 bg-white px-1 text-[11px] text-[#765E10]"><RotateCcw className="mr-1 h-3.5 w-3.5" />등하원 초기화</Button></div></div>;
}

function NoStudentMessage({ grade, attentionOnly = false }: { grade?: string; attentionOnly?: boolean }) { return <Card className="journal-surface"><CardContent className="journal-empty-state"><Check className="h-7 w-7" /><h3>{attentionOnly ? "확인할 출석 등원 전 학생이 없습니다." : grade ? `${grade} 학생이 없습니다.` : "출석을 입력할 학생이 없습니다."}</h3><p>{attentionOnly ? "선택한 기간에서 오늘까지 필요한 출석 입력이 모두 완료되었습니다." : grade ? "다른 학년을 선택해 주세요." : "관리자가 반과 학생을 등록하면 이 화면에서 바로 관리할 수 있습니다."}</p></CardContent></Card>; }
