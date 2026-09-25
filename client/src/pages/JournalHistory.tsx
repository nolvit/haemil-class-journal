import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Calculator, CalendarDays, Check, Copy, Mic2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { copyLessonContent } from "@/lib/copyLessonContent";
import { useAttendanceLiveUpdates } from "@/hooks/useAttendanceLiveUpdates";
import { attendanceStatusLabels, isJournalHomeworkVisible, type AttendanceStatus } from "@shared/journalRules";
import { getSubjectLearningLinks } from "@shared/learningLinksRules";
import {
  getJournalHistoryWeeks,
  getKoreanJournalDate,
  parseJournalHistoryTarget,
  selectJournalHistoryDays,
  type JournalHistoryTarget,
  type JournalHistoryWeek,
} from "@shared/journalHistory";
import "./journal-history.css";

type HistoryRow = {
  student: {
    id: number;
    name: string;
    grade: string;
    vocabularyResultUrl?: string | null;
    englishSpeakingUrl?: string | null;
    mathUnitEvaluationUrl?: string | null;
  };
  classGroup: { id: number; subject: string };
  attendance: { status: AttendanceStatus; arrivalTime?: string | null; departureTime?: string | null } | null;
  journal: { content: string; homework: string; notes: string; isDraft?: boolean } | null;
};

/** Standalone route: no dashboard sidebar, no modal, and no journal mutation controls. */
export default function JournalHistory() {
  const target = useMemo(() => parseJournalHistoryTarget(window.location.search), []);
  const auth = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  if (!target) return <HistoryMessage title="학생과 과목을 확인해 주세요." text="수업일지에서 학생 이름을 눌러 달력을 다시 열어 주세요." />;
  if (auth.isLoading) return <HistoryMessage title="로그인 확인 중" text="수업일지 조회 권한을 확인하고 있습니다." loading />;
  if (auth.isError) return <HistoryMessage title="로그인 상태를 확인하지 못했습니다." text="연결을 확인한 뒤 다시 불러와 주세요." onRetry={() => void auth.refetch()} />;
  if (!auth.data || auth.data.role !== "admin") return <HistoryMessage title="관리자 로그인이 필요합니다." text="수업일지 창에서 관리자 로그인 후 이 창을 새로고침해 주세요." onRetry={() => void auth.refetch()} />;
  return <JournalHistoryCalendar key={`${target.studentId}-${target.classGroupId}`} target={target} />;
}

function HistoryMessage({ title, text, loading, onRetry }: { title: string; text: string; loading?: boolean; onRetry?: () => void }) {
  return <main className="history-page"><section className="history-message" role={loading ? "status" : undefined}>
    <CalendarDays size={28} aria-hidden="true" /><h1>{title}</h1><p>{text}</p>
    <div className="history-actions"><a href="/journal" target="_blank" rel="noopener noreferrer" className="history-action">수업일지 열기</a>
      {onRetry && <button type="button" className="history-action" onClick={onRetry}>다시 불러오기</button>}
    </div>
  </section></main>;
}

function useHistoryWeek(weekAnchor: string, classGroupId: number, includeWeekend: boolean) {
  return trpc.academy.weeklyWorkspace.useQuery(
    { weekAnchor, includeWeekend, classGroupId },
    { staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, retry: 1 },
  );
}
type WeekQuery = ReturnType<typeof useHistoryWeek>;

function JournalHistoryCalendar({ target }: { target: JournalHistoryTarget }) {
  const [referenceDate, setReferenceDate] = useState(getKoreanJournalDate);
  const [now, setNow] = useState(() => new Date());
  const weeks = useMemo(() => getJournalHistoryWeeks(referenceDate), [referenceDate]);
  // Exactly four unconditional hooks: no hook call inside a variable-length loop.
  const currentWeek = useHistoryWeek(weeks[0].weekStart, target.classGroupId, target.includeWeekend);
  const oneWeekAgo = useHistoryWeek(weeks[1].weekStart, target.classGroupId, target.includeWeekend);
  const twoWeeksAgo = useHistoryWeek(weeks[2].weekStart, target.classGroupId, target.includeWeekend);
  const threeWeeksAgo = useHistoryWeek(weeks[3].weekStart, target.classGroupId, target.includeWeekend);
  const queries = [currentWeek, oneWeekAgo, twoWeeksAgo, threeWeeksAgo];
  const utils = trpc.useUtils();
  const targetRow = queries.filter(query => !query.isError).flatMap(query => query.data?.days ?? [])
    .flatMap(day => day.rows).find(row => row.student.id === target.studentId && row.classGroup.id === target.classGroupId);
  const title = targetRow ? `${targetRow.student.name} · ${targetRow.classGroup.subject}` : "수업일지";
  const learningLinks = targetRow
    ? getSubjectLearningLinks(targetRow.classGroup.subject, targetRow.student)
    : [];
  const refresh = () => {
    setReferenceDate(getKoreanJournalDate());
    void utils.auth.me.invalidate();
    for (const week of weeks) void utils.academy.weeklyWorkspace.invalidate({ weekAnchor: week.weekStart, includeWeekend: target.includeWeekend, classGroupId: target.classGroupId });
  };
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · 최근 4주 달력 | 해밀학원`;
    return () => { document.title = previousTitle; };
  }, [title]);
  useEffect(() => {
    // Refocusing the reference window picks up edits saved in the original journal window.
    const onFocus = () => {
      setReferenceDate(getKoreanJournalDate());
      void utils.auth.me.invalidate();
      for (const week of weeks) void utils.academy.weeklyWorkspace.invalidate({ weekAnchor: week.weekStart, includeWeekend: target.includeWeekend, classGroupId: target.classGroupId });
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // The range advances at the Korean date boundary even if the window stays open.
    const timer = window.setInterval(() => {
      setReferenceDate(getKoreanJournalDate());
      setNow(new Date());
    }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [weeks, target.classGroupId, target.includeWeekend, utils]);
  useAttendanceLiveUpdates(event => {
    const week = weeks.find(item => event.eventDate >= item.weekStart && event.eventDate <= item.weekEnd);
    if (week) void utils.academy.weeklyWorkspace.invalidate({ weekAnchor: week.weekStart, includeWeekend: target.includeWeekend, classGroupId: target.classGroupId });
  });
  const dayLabels = target.includeWeekend ? ["월", "화", "수", "목", "금", "토", "일"] : ["월", "화", "수", "목", "금"];
  const rangeEnd = weeks[0].dates[target.includeWeekend ? 6 : 4];
  const calendarRows = weeks
    .map((week, index) => ({ week, query: queries[index] }))
    .reverse();
  return (
    <main className="history-page">
      <header className="history-heading">
        <div><p className="history-eyebrow">HAEMIL · LESSON CALENDAR</p>
          <h1>{title} <span>최근 4주 수업일지</span></h1>
          <p className="history-subtitle">{targetRow?.student.grade && <>{targetRow.student.grade} · </>}{weeks[3].weekStart} ~ {rangeEnd}<span className="history-readonly">조회 전용</span></p>
        </div>
        <div className="history-actions">
          {learningLinks.map(link => <a key={link.kind} href={link.url} target="_blank" rel="noopener noreferrer" className="history-action history-resource-action" data-resource={link.kind}>{link.kind === "math" ? <Calculator size={15} aria-hidden="true" /> : link.kind === "speaking" ? <Mic2 size={15} aria-hidden="true" /> : <BookMarked size={15} aria-hidden="true" />}{link.label}</a>)}
          <button type="button" className="history-action" disabled={queries.some(query => query.isFetching)} onClick={refresh}><RefreshCw size={15} aria-hidden="true" />새로고침</button>
        </div>
      </header>
      <div className="history-guide"><CalendarDays size={16} aria-hidden="true" /><p>이번 주와 지난 3주를 보여줍니다. <strong>날짜별 복사 버튼으로 수업 내용만 복사합니다.</strong> 과제와 비고는 제외됩니다.</p></div>
      <p className="history-mobile-hint">달력을 좌우로 밀어 다른 요일을 확인하세요.</p>
      <div className="history-calendar-scroll" role="region" aria-label="최근 4주 수업일지 달력" tabIndex={0}>
        <table className="history-calendar">
          <caption className="history-sr-only">{title} · 월요일부터 {target.includeWeekend ? "일요일까지 7칸" : "금요일까지 5칸"}씩 4주. 3주 전부터 이번 주까지 날짜순으로 표시합니다.</caption>
          <thead><tr>{dayLabels.map((day, index) => <th key={day} scope="col" data-weekend={index > 4 || undefined}>{day}<span>요일</span></th>)}</tr></thead>
          <tbody>{calendarRows.map(({ week, query }) => <HistoryWeekRow key={week.weekStart} week={week} query={query} target={target} referenceDate={referenceDate} now={now} includeWeekend={target.includeWeekend} />)}</tbody>
        </table>
      </div>
      <footer className="history-footer">{target.includeWeekend ? "주말 보강 포함" : "월요일~금요일 표시"} · 원래 수업일지의 입력 내용은 변경되지 않습니다. 긴 수업 내용도 생략 없이 표시합니다.</footer>
    </main>
  );
}

function HistoryWeekRow({ week, query, target, referenceDate, now, includeWeekend }: { week: JournalHistoryWeek; query: WeekQuery; target: JournalHistoryTarget; referenceDate: string; now: Date; includeWeekend: boolean }) {
  const days = selectJournalHistoryDays(week, query.data?.days ?? [], target.studentId, target.classGroupId).slice(0, includeWeekend ? 7 : 5);
  const weekEnd = week.dates[includeWeekend ? 6 : 4];
  if (query.isError) return <tr><td colSpan={includeWeekend ? 7 : 5} className="history-error"><div role="alert"><b>{week.label} · {week.weekStart} ~ {weekEnd}</b><p>기록을 불러오지 못했습니다. 빈 기록이 아닙니다.</p><button type="button" className="history-action" disabled={query.isFetching} onClick={() => void query.refetch()}>다시 불러오기</button></div></td></tr>;
  return <tr data-week={week.label}>{days.map(({ journalDate, row }, index) => <HistoryDay key={journalDate} row={row} journalDate={journalDate} referenceDate={referenceDate} now={now} weekLabel={index === 0 ? week.label : undefined} loading={query.isLoading} />)}</tr>;
}

function HistoryDay({ row, journalDate, referenceDate, now, weekLabel, loading }: { row?: HistoryRow; journalDate: string; referenceDate: string; now: Date; weekLabel?: string; loading: boolean }) {
  const status = row?.attendance?.status ?? "not_entered";
  const journal = loading ? null : row?.journal;
  const content = journal?.content ?? "";
  const isFuture = journalDate > referenceDate;
  const visibleHomework = isJournalHomeworkVisible({
    subject: row?.classGroup.subject ?? "",
    content: journal?.content,
    homework: journal?.homework,
    journalDate,
    attendanceStatus: status,
    departureTime: row?.attendance?.departureTime,
    isDraft: journal?.isDraft,
    now,
  });
  const contentId = `history-content-${journalDate}`;
  return <td className="history-day" data-today={journalDate === referenceDate || undefined} data-future={isFuture || undefined}>
    <article aria-label={`${journalDate} 수업일지`}>
      <div className="history-day-heading"><time dateTime={journalDate}>{Number(journalDate.slice(5, 7))}/{Number(journalDate.slice(8))}{journalDate === referenceDate && <em>오늘</em>}</time><CopyLessonButton content={content} journalDate={journalDate} contentId={contentId} disabled={loading} /></div>
      {weekLabel && <p className="history-week-label">{weekLabel}</p>}
      {loading ? <div className="history-loading" role="status"><span>기록 불러오는 중…</span></div> : <>
        <div className="history-badges"><span className="history-status" data-status={status}>{status === "not_entered" ? (isFuture ? "예정" : "미입력") : attendanceStatusLabels[status]}</span>
          {isFuture && status !== "not_entered" && <span className="history-status">예정</span>}
          {journal?.isDraft && <span className="history-status history-draft">임시 저장</span>}
        </div>
        <dl className="history-details"><div className="history-lesson"><dt>수업 내용</dt><dd id={contentId} className={content.trim() ? "" : "history-empty"}>{content.trim() ? content : "작성된 수업 내용이 없습니다."}</dd></div>
          {visibleHomework && <div className="history-homework"><dt>과제</dt><dd>{journal?.homework}</dd></div>}
          {journal?.notes?.trim() && <div className="history-notes"><dt>비고</dt><dd>{journal.notes}</dd></div>}
        </dl>
      </>}
    </article>
  </td>;
}

function CopyLessonButton({ content, journalDate, contentId, disabled }: { content: string; journalDate: string; contentId: string; disabled: boolean }) {
  const [state, setState] = useState<"idle" | "copying" | "copied">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (resetTimer.current) clearTimeout(resetTimer.current); }; }, []);
  useEffect(() => { setState("idle"); if (resetTimer.current) clearTimeout(resetTimer.current); }, [content]);
  const copy = async () => {
    if (!content.trim() || state === "copying") return;
    setState("copying");
    const copied = await copyLessonContent(content);
    if (!mounted.current) return;
    if (copied) {
      setState("copied");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setState("idle"), 1600);
      toast.success(`${journalDate} 수업 내용을 복사했습니다.`);
    } else {
      setState("idle");
      const element = document.getElementById(contentId);
      const selection = window.getSelection();
      if (element && selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      toast.error("자동 복사가 차단되었습니다. 선택된 수업 내용을 Ctrl+C 또는 복사 메뉴로 복사해 주세요.");
    }
  };
  return <button type="button" className="history-copy" disabled={disabled || !content.trim()} aria-disabled={disabled || !content.trim() || state === "copying"} aria-busy={state === "copying"} data-copied={state === "copied" || undefined} title={content.trim() ? "수업 내용만 복사" : "복사할 수업 내용이 없습니다."} aria-label={`${journalDate} 수업 내용 복사`} onClick={() => void copy()}>
    {state === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}<span aria-live="polite">{state === "copied" ? "완료" : "복사"}</span>
  </button>;
}
