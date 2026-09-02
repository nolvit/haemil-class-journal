import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowRight, BookOpenCheck, CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, UserCheck, UserRoundX, Users } from "lucide-react";
import { dashboardAttendanceHref, dashboardJournalHref, dashboardStudentJournalHref, shouldShowDashboardPendingList } from "@shared/dashboardNavigation";
import { attendanceStatusBadgeClass, attendanceStatusLabels, attendanceStatusValues, formatAttendanceProgressLabel, formatArrivalTimeForDisplay, type AttendanceStatus } from "../../../shared/journalRules";
import { isAttendanceDay, isAttendancePending } from "@shared/attendanceSummaryRules";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
function currentTimeInKorea() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function gradeOrder(value: string) { const normalized = value.trim(); const level = normalized.startsWith("고") ? 0 : normalized.startsWith("중") ? 1 : 2; return level * 100 + (Number(normalized.replace(/[^0-9]/g, "")) || 99); }
const dashboardScrollKey = "haemil.dashboard.scroll-position";
function isReloadNavigation() {
  return performance.getEntriesByType("navigation").some(entry => (entry as PerformanceNavigationTiming).type === "reload");
}

export default function Home() {
  const [journalDate, setJournalDate] = useState(todayInKorea);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [selectedGrade, setSelectedGrade] = useState<string | undefined>();
  const [arrivalFilter, setArrivalFilter] = useState<"arrived" | "pending" | undefined>();
  const [subjectPicker, setSubjectPicker] = useState<{ student: { id: number; name: string }; classGroups: Array<{ id: number; subject: string; journalState: "complete" | "attention" | "not_required" }> } | null>(null);
  const [, setLocation] = useLocation();
  const queryInput = useMemo(() => ({ journalDate }), [journalDate]);
  const { data, isLoading, refetch } = trpc.academy.dashboard.useQuery(queryInput);
  const quickAttendanceUpdate = trpc.academy.attendance.save.useMutation({
    onSuccess: (result, variables) => {
      if ("reason" in result && result.reason === "current_journal_conflict") {
        if (window.confirm("현재 날짜에 이미 작성된 수업일지가 있습니다. 기존 내용을 지우고 이후 수업일지를 현재 날짜로 당길까요?\n\n확인을 누르면 기존 내용은 삭제되고, 취소하면 출석 상태를 바꾸지 않습니다.")) quickAttendanceUpdate.mutate({ ...variables, overwriteCurrentJournal: true });
        else toast.info("출석 상태 변경을 취소했습니다.");
        return;
      }
      setRefreshedAt(new Date());
      void refetch();
    },
    onError: error => toast.error(error.message),
  });
  const stats = data?.stats;
  const attendancePendingStudents = data?.attendancePendingStudents ?? [];
  const journalAttentionItems = data?.journalAttentionItems ?? [];
  const showAttendancePendingList = shouldShowDashboardPendingList(attendancePendingStudents.length);
  const showJournalPendingList = shouldShowDashboardPendingList(journalAttentionItems.length);
  const students = data?.students ?? [];
  const grades = useMemo(() => Array.from(new Set(students.map(student => student.grade))).sort((a, b) => gradeOrder(a) - gradeOrder(b) || a.localeCompare(b, "ko")), [students]);
  const visibleStudents = useMemo(() => students.filter(student => {
    if (selectedGrade && student.grade !== selectedGrade) return false;
    if (arrivalFilter === "arrived") return isAttendanceDay(student.attendanceStatus as AttendanceStatus | null);
    if (arrivalFilter === "pending") return isAttendancePending(student.attendanceStatus as AttendanceStatus | null);
    return true;
  }), [arrivalFilter, selectedGrade, students]);
  const arrivalCounts = useMemo(() => ({
    arrived: students.filter(student => isAttendanceDay(student.attendanceStatus as AttendanceStatus | null)).length,
    pending: students.filter(student => isAttendancePending(student.attendanceStatus as AttendanceStatus | null)).length,
  }), [students]);
  const filterLabel = arrivalFilter === "arrived" ? "등원 완료" : arrivalFilter === "pending" ? "등원 미완료" : undefined;
  const toggleArrivalFilter = (nextFilter: "arrived" | "pending") => {
    setArrivalFilter(current => current === nextFilter ? undefined : nextFilter);
    setRefreshedAt(new Date());
    void refetch();
  };
  const markArrivedNow = (studentId: number) => {
    quickAttendanceUpdate.mutate({ studentId, journalDate, status: "present", arrivalTime: currentTimeInKorea() });
  };
  const markAttendanceStatus = (studentId: number, status: "absent" | "not_registered") => {
    quickAttendanceUpdate.mutate({ studentId, journalDate, status });
  };
  const shouldRestoreScroll = useRef(isReloadNavigation());

  useEffect(() => {
    const saveScrollPosition = () => sessionStorage.setItem(dashboardScrollKey, String(window.scrollY));
    window.addEventListener("scroll", saveScrollPosition, { passive: true });
    window.addEventListener("beforeunload", saveScrollPosition);
    return () => {
      window.removeEventListener("scroll", saveScrollPosition);
      window.removeEventListener("beforeunload", saveScrollPosition);
    };
  }, []);

  useEffect(() => {
    const refreshElapsedTime = () => setRefreshedAt(new Date());
    const timer = window.setInterval(refreshElapsedTime, 30_000);
    document.addEventListener("visibilitychange", refreshElapsedTime);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshElapsedTime);
    };
  }, []);

  useEffect(() => {
    if (!shouldRestoreScroll.current || isLoading) return;
    const savedPosition = Number(sessionStorage.getItem(dashboardScrollKey));
    if (Number.isFinite(savedPosition) && savedPosition > 0) {
      requestAnimationFrame(() => window.scrollTo(0, savedPosition));
    }
    shouldRestoreScroll.current = false;
  }, [isLoading]);

  return <div className="journal-page-shell">
    <section className="journal-page-heading">
      <div><p className="eyebrow">DAILY OVERVIEW</p><h1>오늘의 운영 업무판</h1><p>출석부터 수업일지 확인까지, 오늘의 기록을 한눈에 정리합니다.</p></div>
      <div className="journal-date-control dashboard-date-control"><div className="dashboard-date-label"><CalendarDays className="h-3.5 w-3.5" /><label htmlFor="dashboard-date">업무 날짜</label></div><div className="journal-date-nav"><Button variant="outline" size="icon" onClick={() => setJournalDate(shiftDate(journalDate, -1))} aria-label="전날"><ChevronLeft className="h-4 w-4" /></Button><Input id="dashboard-date" type="date" value={journalDate} onChange={event => setJournalDate(event.target.value)} /><Button variant="outline" size="icon" onClick={() => setJournalDate(shiftDate(journalDate, 1))} aria-label="다음 날"><ChevronRight className="h-4 w-4" /></Button></div><Button variant="ghost" size="sm" className="dashboard-today-button" onClick={() => setJournalDate(todayInKorea())}>오늘</Button></div>
    </section>

    <section className={`dashboard-workboard ${showAttendancePendingList || showJournalPendingList ? "has-pending" : ""}`} aria-label="오늘의 운영 업무판">
      <div className="dashboard-workboard-main">
        <section className="dashboard-action-grid" aria-label="오늘의 입력 업무">
          <button className="dashboard-action-card" onClick={() => setLocation(`/attendance?date=${journalDate}`)}><span className="journal-step-index">01</span><span><b>출석 입력</b><small>등원 시간과 상태를 입력합니다.</small></span><Badge className="ml-auto bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">등원 전 {stats?.attendancePending ?? 0}명</Badge><ArrowRight className="h-4 w-4" /></button>
          <button className="dashboard-action-card" onClick={() => setLocation(`/journal?date=${journalDate}`)}><span className="journal-step-index">02</span><span><b>수업일지 작성</b><small>수업 내용과 과제를 기록합니다.</small></span><Badge className="ml-auto bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">등원 전 {stats?.needsAttention ?? 0}건</Badge><ArrowRight className="h-4 w-4" /></button>
        </section>
        <section className="dashboard-summary-grid" aria-label="오늘의 운영 요약">
          <StatCard compact icon={Users} label="등록 학생" value={selectedGrade || arrivalFilter ? visibleStudents.length : stats?.enrolledStudents} suffix="명" loading={isLoading} tone="teal"><div className="space-y-3"><div className="flex flex-wrap gap-1.5" aria-label="학생 진행 현황 학년 선택"><Button type="button" variant={selectedGrade === undefined ? "default" : "outline"} size="sm" className={selectedGrade === undefined ? "h-7 rounded-md px-2 text-[10px] journal-primary-button" : "h-7 rounded-md bg-[#FFFEFA] px-2 text-[10px]"} onClick={() => setSelectedGrade(undefined)}>전체</Button>{grades.map(grade => <Button type="button" key={grade} variant={selectedGrade === grade ? "default" : "outline"} size="sm" className={selectedGrade === grade ? "h-7 rounded-md px-2 text-[10px] journal-primary-button" : "h-7 rounded-md bg-[#FFFEFA] px-2 text-[10px]"} onClick={() => setSelectedGrade(grade)}>{grade}</Button>)}</div><div className="dashboard-count-alert-list" aria-label="횟수·원비 확인 학생 명단">{data?.countAlertStudents?.length ? <>{data.countAlertStudents.map(student => <span className="dashboard-count-alert-item" key={student.id}>{student.name}<small>남은 {Number(student.remainingCount.toFixed(1))}회</small></span>)}</> : <span className="dashboard-count-alert-empty">확인 대상 없음</span>}</div><div className="flex flex-wrap justify-end gap-2" aria-label="등원 상태 선택"><Button type="button" variant={arrivalFilter === "arrived" ? "default" : "outline"} size="sm" className={arrivalFilter === "arrived" ? "h-9 rounded-lg px-3 text-xs journal-primary-button" : "h-9 rounded-lg bg-[#FFFEFA] px-3 text-xs text-[#2F7154]"} onClick={() => toggleArrivalFilter("arrived")} aria-pressed={arrivalFilter === "arrived"}><UserCheck className="mr-1.5 h-4 w-4" />등원 완료 {arrivalCounts.arrived}명</Button><Button type="button" variant={arrivalFilter === "pending" ? "default" : "outline"} size="sm" className={arrivalFilter === "pending" ? "h-9 rounded-lg px-3 text-xs journal-primary-button" : "h-9 rounded-lg bg-[#FFFEFA] px-3 text-xs text-[#9A7316]"} onClick={() => toggleArrivalFilter("pending")} aria-pressed={arrivalFilter === "pending"}><UserRoundX className="mr-1.5 h-4 w-4" />등원 미완료 {arrivalCounts.pending}명</Button></div></div></StatCard>
          <StatCard compact icon={BookOpenCheck} label="일지 작성" value={stats ? `${stats.journalsComplete} / ${stats.journalsTotal}` : undefined} loading={isLoading} tone="ink" />
        </section>
      </div>
      {(showAttendancePendingList || showJournalPendingList) && <aside className="dashboard-pending-stack" aria-label="등원 전 대상 목록"><Card className="journal-surface dashboard-pending-card"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">PENDING TASKS</p><h2 className="mt-1 font-serif text-xl text-[#173D3C]">등원 전 대상</h2></div><div className="flex shrink-0 gap-1.5">{showAttendancePendingList && <Badge className="bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">출석 {attendancePendingStudents.length}명</Badge>}{showJournalPendingList && <Badge className="bg-[#F2EEE3] text-[#69746F] hover:bg-[#F2EEE3]">일지 {journalAttentionItems.length}건</Badge>}</div></div>{showAttendancePendingList && <section className="dashboard-pending-section"><p>출석 입력</p><div className="mt-2 flex flex-wrap gap-2">{attendancePendingStudents.map(student => <button type="button" className="rounded-lg bg-[#FFF9E8] px-2.5 py-1.5 text-sm font-medium text-[#765E10] transition-colors hover:bg-[#FFF1C7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8891B]" onClick={() => setLocation(dashboardAttendanceHref(journalDate, student.id))} key={student.id} aria-label={`${student.name} 학생의 ${journalDate} 출석 입력으로 이동`}>{student.name}<small className="ml-1 text-xs font-normal text-[#907A40]">{student.grade}</small></button>)}</div></section>}{showAttendancePendingList && showJournalPendingList && <div className="dashboard-pending-divider" />}{showJournalPendingList && <section className="dashboard-pending-section"><p>수업일지 작성</p><div className="mt-2 flex flex-wrap gap-2">{journalAttentionItems.map(item => <button type="button" className="rounded-lg bg-[#FFF9E8] px-2.5 py-1.5 text-left text-sm font-medium text-[#765E10] transition-colors hover:bg-[#FFF1C7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8891B]" onClick={() => setLocation(dashboardJournalHref(journalDate, item.studentId, item.classGroupId))} key={`${item.studentId}-${item.classGroupId}`} aria-label={`${item.studentName} 학생 ${item.subject}의 ${journalDate} 수업일지 입력으로 이동`}>{item.studentName}<small className="ml-1 text-xs font-normal text-[#907A40]">{item.subject}</small></button>)}</div></section>}</CardContent></Card></aside>}
    </section>

    <section className="mt-9"><div className="journal-section-title"><div><p className="eyebrow">STUDENT STATUS</p><h2>학생별 진행 현황</h2>{(selectedGrade || filterLabel) && <p className="mt-1 text-xs font-medium text-[#657673]">{[selectedGrade, filterLabel].filter(Boolean).join(" · ")} {visibleStudents.length}명</p>}</div><Button variant="outline" onClick={() => setLocation(`/journal?date=${journalDate}`)}>일지 화면 열기 <ArrowRight className="ml-1.5 h-4 w-4" /></Button></div>
      <Card className="journal-surface overflow-hidden"><CardContent className="p-0"><div className="journal-list-head dashboard-student-status-grid hidden md:grid"><span>학생</span><span>등원 경과</span><span>학년</span><span>출석</span><span>일지</span><span>상태</span><span>바로가기</span></div><div className="journal-list-head-mobile md:hidden"><span>학생·학년</span><span>출석</span><span>상태</span></div>{isLoading ? <div className="space-y-1 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div> : visibleStudents.length ? visibleStudents.map(student => { const elapsed = formatAttendanceProgressLabel(student.attendanceStatus as AttendanceStatus | null, student.arrivalTime, journalDate, refreshedAt, todayInKorea()); const isArrived = isAttendanceDay(student.attendanceStatus as AttendanceStatus | null); const arrivalTime = isArrived && student.arrivalTime ? formatArrivalTimeForDisplay(student.arrivalTime) : null; const departureTime = isArrived && student.departureTime ? formatArrivalTimeForDisplay(student.departureTime) : null; const missingSubjects = student.classGroups.filter(classGroup => classGroup.journalState === "attention").map(classGroup => classGroup.subject).join(", "); return <div className="journal-student-row dashboard-student-status-grid" key={student.id}><div><b>{student.name}</b><small className="md:hidden">{student.grade}{elapsed !== "—" ? ` · ${elapsed}` : ""}</small></div><span className={`hidden text-xs md:block ${elapsed === "결석" || elapsed === "미등록" ? "text-[#A16A3B]" : "text-[#52706A]"}`}>{elapsed}</span><span className="hidden text-sm text-[#71817D] md:block">{student.grade}</span><span className="dashboard-student-attendance"><AttendanceBadge status={student.attendanceStatus} />{isArrived && <small>등원 {arrivalTime ?? "전"}{departureTime ? ` · 하원 ${departureTime}` : ""}</small>}{isAttendancePending(student.attendanceStatus as AttendanceStatus | null) && <Button type="button" variant="outline" size="icon" className="dashboard-quick-arrival-button" onClick={() => markArrivedNow(student.id)} disabled={quickAttendanceUpdate.isPending} aria-label={`${student.name} 현재 시각으로 등원 처리`} title="현재 시각으로 등원 처리"><CalendarCheck2 className="h-3.5 w-3.5" /></Button>}{isAttendancePending(student.attendanceStatus as AttendanceStatus | null) && <><Button type="button" variant="outline" size="sm" className="dashboard-quick-status-button dashboard-quick-status-absent" onClick={() => markAttendanceStatus(student.id, "absent")} disabled={quickAttendanceUpdate.isPending} aria-label={`${student.name} 결석 처리`}>결석</Button><Button type="button" variant="outline" size="sm" className="dashboard-quick-status-button dashboard-quick-status-unregistered" onClick={() => markAttendanceStatus(student.id, "not_registered")} disabled={quickAttendanceUpdate.isPending} aria-label={`${student.name} 미등록 처리`}>미등록</Button></>}</span><span className="text-sm text-[#526460]">{student.complete} / {student.total}</span><span className="dashboard-student-journal-state">{student.attention ? <><Badge className="bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">등원 전 {student.attention}건</Badge>{missingSubjects && <small title={missingSubjects}>{missingSubjects}</small>}</> : <Badge className="bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]">정상</Badge>}</span><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setLocation(dashboardAttendanceHref(journalDate, student.id))}>출석 일지</Button><Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setSubjectPicker({ student: { id: student.id, name: student.name }, classGroups: student.classGroups })}>수업 일지</Button></div></div>; }) : <EmptyState onCreate={() => setLocation("/classes")} />}</CardContent></Card>
    </section>
    <Dialog open={Boolean(subjectPicker)} onOpenChange={open => { if (!open) setSubjectPicker(null); }}><DialogContent className="sm:max-w-[420px]"><DialogHeader><p className="eyebrow">SELECT SUBJECT</p><DialogTitle>{subjectPicker?.student.name} 학생 수업 일지</DialogTitle><DialogDescription>과목별 수업일지 입력 상태를 확인한 뒤 이동할 과목을 선택해 주세요.</DialogDescription></DialogHeader><div className="grid gap-2 py-2">{subjectPicker?.classGroups.map(classGroup => { const isMissing = classGroup.journalState === "attention"; const isExcluded = classGroup.journalState === "not_required"; const statusLabel = isMissing ? "일지 등원 전" : isExcluded ? "작성 제외" : "입력 완료"; const colorClass = isMissing ? "border-[#D8AA25] bg-[#FFF9E8] hover:bg-[#FFF4CC]" : isExcluded ? "border-[#DED8CF] bg-[#F8F6F1] hover:bg-[#F1EEE8]" : "border-[#B8D7C6] bg-[#F2F8F4] hover:bg-[#E6F2EA]"; const textClass = isMissing ? "text-[#765E10]" : isExcluded ? "text-[#796554]" : "text-[#2F7154]"; return <Button key={classGroup.id} variant="outline" className={`h-auto justify-between px-4 py-3 text-left ${colorClass}`} onClick={() => { setLocation(dashboardJournalHref(journalDate, subjectPicker.student.id, classGroup.id)); setSubjectPicker(null); }}><span><span className="block font-semibold text-[#234E52]">{classGroup.subject}</span><small className={`mt-1 block text-xs font-medium ${textClass}`}>{statusLabel}</small></span><ArrowRight className={`h-4 w-4 ${textClass}`} /></Button>; })}</div></DialogContent></Dialog>
  </div>;
}

function StatCard({ icon: Icon, label, value, suffix = "", loading, tone, children, compact = false }: { icon: typeof Users; label: string; value?: string | number; suffix?: string; loading: boolean; tone: "teal" | "ink" | "yellow" | "soft"; children?: React.ReactNode; compact?: boolean }) {
  const contentPadding = compact ? "px-5 py-3" : "p-5";
  const valueMargin = compact ? "mt-3" : "mt-6";
  return <Card className={`journal-stat-card journal-stat-${tone}${compact ? " is-compact" : ""}`}><CardContent className={contentPadding}><div className="flex items-start justify-between"><span className="journal-stat-icon"><Icon className="h-[18px] w-[18px]" /></span><span className="text-[11px] font-bold tracking-[0.12em] text-[#71817D]">{label}</span></div>{loading ? <Skeleton className={`${valueMargin} h-9 w-24`} /> : <p className={`${valueMargin} font-serif text-[32px] leading-none tracking-[-0.04em] text-[#173D3C]`}>{value ?? 0}<small className="ml-1 font-sans text-sm font-medium tracking-normal text-[#71817D]">{suffix}</small></p>}{children}</CardContent></Card>;
}

function AttendanceBadge({ status }: { status: string | null }) {
  const normalized = attendanceStatusValues.includes(status as AttendanceStatus) ? status as AttendanceStatus : "not_entered";
  return <Badge className={attendanceStatusBadgeClass(normalized)}>{attendanceStatusLabels[normalized]}</Badge>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="journal-empty-state"><ClipboardList className="h-7 w-7" /><h3>아직 등록된 학생이 없습니다.</h3><p>먼저 반과 학생을 등록하면 출석 및 수업일지를 바로 작성할 수 있습니다.</p><Button onClick={onCreate}>반 관리로 이동</Button></div>;
}
