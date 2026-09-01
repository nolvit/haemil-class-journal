import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ParentNotificationPrompt,
  PwaInstallPrompt,
} from "@/components/PwaInstallPrompt";
import { trpc } from "@/lib/trpc";
import {
  attendanceStatusBadgeClass,
  attendanceStatusLabels,
  formatArrivalTimeForDisplay,
  mobileAttendanceStatusLabel,
} from "@shared/journalRules";
import {
  BookOpenCheck,
  CalendarRange,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function initialPortalDate() {
  const requested = new URLSearchParams(window.location.search).get("date");
  return isIsoDate(requested) ? requested! : todayInKorea();
}
function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]} ${value.slice(5, 10).replace("-", ".")}`;
}
function mobileAttendanceDayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  const dateText = value.slice(5, 10).replace("-", ".");
  return day === 6
    ? `토요일 ${dateText}`
    : day === 0
      ? `일요일 ${dateText}`
      : dayLabel(value);
}
function count(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
function cleanNotice(value: string) {
  return value.replace(/^\s*(?:\[?\s*안내\s*\]?\s*[:：]?\s*)/, "");
}
type CalendarEvent = {
  type: "official_holiday" | "closure";
  status: "holiday" | "closed";
  name: string;
  description: string | null;
  imageUrl: string | null;
  closureId: number | null;
  legalHolidayNoticeId: number | null;
  startDate: string;
  endDate: string;
};
type PortalAttendance = {
  journalDate: string;
  status: keyof typeof attendanceStatusLabels;
  arrivalTime: string | null;
  departureTime: string | null;
  calendarEvent?: CalendarEvent | null;
};
type CalendarSegment = { key: string; event: CalendarEvent; dates: string[] };

function getCalendarSegments(
  dates: string[],
  attendanceMap: Map<string, PortalAttendance>
) {
  const segments: CalendarSegment[] = [];
  for (const date of dates) {
    const attendance = attendanceMap.get(date);
    const event = attendance?.calendarEvent;
    const enabled = event && attendance?.status === event.status;
    if (!enabled || !event) continue;
    const key =
      event.type === "closure"
        ? `closure-${event.closureId}`
        : `official-${event.name}`;
    const previous = segments.at(-1);
    if (previous?.key === key && previous.dates.at(-1) === shiftDate(date, -1))
      previous.dates.push(date);
    else segments.push({ key, event, dates: [date] });
  }
  return segments;
}

function CalendarEventPanel({
  event,
  dates,
  mobile = false,
}: {
  event: CalendarEvent;
  dates: string[];
  mobile?: boolean;
}) {
  const period =
    dates.length === 1
      ? dayLabel(dates[0]!)
      : `${dayLabel(dates[0]!)} ~ ${dayLabel(dates[dates.length - 1]!)}`;
  const eventLabel =
    event.type === "official_holiday" ? "법정공휴일" : "학원 휴강";
  if (event.imageUrl)
    return (
      <div
        className={`portal-calendar-panel portal-calendar-image ${mobile ? "is-mobile" : ""}`}
      >
        <img
          className="portal-calendar-image-backdrop"
          src={event.imageUrl}
          alt=""
          aria-hidden="true"
        />
        <img
          className="portal-calendar-image-original"
          src={event.imageUrl}
          alt={`${event.name} 안내 이미지`}
        />
        <div className="portal-calendar-image-caption">
          <span>{eventLabel}</span>
          <b>{event.name}</b>
          <small>{period}</small>
        </div>
      </div>
    );
  return (
    <div
      className={`portal-calendar-panel portal-calendar-text ${mobile ? "is-mobile" : ""}`}
    >
      <CalendarX2 className="h-5 w-5" />
      <div>
        <span>{eventLabel}</span>
        <b>{event.name}</b>
        <small>
          {event.description ||
            `${period}에는 정규 수업과 수업일지 작성이 없습니다.`}
        </small>
      </div>
    </div>
  );
}

function eventDisplayName(attendance: PortalAttendance | undefined) {
  const event =
    attendance?.calendarEvent &&
    attendance.status === attendance.calendarEvent.status
      ? attendance.calendarEvent
      : null;
  return (
    event?.name ?? attendanceStatusLabels[attendance?.status ?? "not_entered"]
  );
}

export default function StudentPortal() {
  const [, params] = useRoute("/p/:token");
  const token = params?.token ?? "";
  const [journalDate, setJournalDate] = useState(initialPortalDate);
  const [includeWeekend, setIncludeWeekend] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const input = useMemo(
    () => ({ token, journalDate, includeWeekend }),
    [token, journalDate, includeWeekend]
  );
  const { data, isLoading, error } = trpc.academy.publicStudent.useQuery(
    input,
    { enabled: Boolean(token), refetchInterval: 15_000 }
  );
  if (isLoading)
    return (
      <div className="portal-shell">
        <div className="portal-container space-y-5">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  if (error || !data)
    return (
      <div className="portal-shell">
        <div className="portal-container">
          <Card className="portal-card">
            <CardContent className="journal-empty-state">
              <BookOpenCheck className="h-8 w-8" />
              <h1>열람 링크를 확인해 주세요.</h1>
              <p>
                이 링크는 존재하지 않거나 현재 공개가 중지된 학생
                수업일지입니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );

  const attendanceMap = new Map<string, PortalAttendance>(
    data.attendances.map(item => [item.journalDate, item as PortalAttendance])
  );
  const journals = new Map(
    data.journals.map(item => [
      `${item.classGroupId}-${item.journalDate}`,
      item,
    ])
  );
  const comments = new Map(
    data.comments.map(item => [item.classGroupId, item.comment])
  );
  const hasComments = data.comments.some(item => Boolean(item.comment?.trim()));
  const gridStyle = {
    gridTemplateColumns: `minmax(66px, 0.36fr) repeat(${data.dates.length}, minmax(156px, 1fr))${hasComments ? " minmax(190px, 1fr)" : ""}`,
  };
  const period = `${data.dates[0]?.replaceAll("-", ".")} ~ ${data.dates[data.dates.length - 1]?.replaceAll("-", ".")}`;
  const targetMessage = data.summary.attendanceMessage;
  const weekdayDates = data.dates.filter(date => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });
  const weekendDates = data.dates.filter(date => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  });
  const calendarSegments = getCalendarSegments(data.dates, attendanceMap);
  const moveWeek = (days: number) =>
    setJournalDate(current => shiftDate(current, days));
  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (
      !window.matchMedia("(max-width: 720px)").matches ||
      event.touches.length !== 1 ||
      (event.target instanceof Element &&
        event.target.closest("button, input, label, a, [role=button]"))
    ) {
      swipeStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 64 || Math.abs(deltaY) > 64) return;
    moveWeek(deltaX < 0 ? 7 : -7);
  };
  const renderMobileAttendance = (date: string) => {
    const attendance = attendanceMap.get(date);
    const futureDate = date > todayInKorea();
    const mobileStatus = mobileAttendanceStatusLabel(attendance?.status);
    const [firstLine, secondLine] = mobileStatus.split("\n");
    const event =
      attendance?.calendarEvent &&
      attendance.status === attendance.calendarEvent.status
        ? attendance.calendarEvent
        : null;
    return (
      <div key={date} className="portal-attendance-day">
        <b>{mobileAttendanceDayLabel(date)}</b>
        <div className="mt-2">
          {futureDate ? (
            <span className="text-sm text-[#A08D78]">—</span>
          ) : (
            <Badge
              className={`${attendanceStatusBadgeClass(attendance?.status)} max-w-full text-center leading-[1.25]`}
            >
              <span className="block">
                {firstLine}
                {secondLine && (
                  <>
                    <br />
                    {secondLine}
                  </>
                )}
              </span>
            </Badge>
          )}
        </div>
        {!futureDate && event && (
          <small
            className="mt-1 block truncate text-[10px] font-medium text-[#8A6C35]"
            title={event.name}
          >
            {event.name}
          </small>
        )}
        {!futureDate && attendance?.arrivalTime && (
          <small className="mt-1 block text-xs text-[#71817D]">
            등원 {formatArrivalTimeForDisplay(attendance.arrivalTime)}
          </small>
        )}
        {!futureDate && attendance?.departureTime && (
          <small className="mt-1 block text-xs text-[#71817D]">
            하원 {formatArrivalTimeForDisplay(attendance.departureTime)}
          </small>
        )}
      </div>
    );
  };

  return (
    <div className="portal-shell">
      <main
        className="portal-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className="portal-header">
          <div className="portal-brand">
            <span className="brand-seal">H</span>
            <div>
              <p className="font-serif text-xl text-[#173D3C]">haemil.</p>
              <p className="text-[9px] font-bold tracking-[0.18em] text-[#8B967C]">
                ACADEMY CLASS JOURNAL
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-xs font-medium text-[#71817D]">
              보호자 열람
            </span>
            <span className="mt-1 block text-[10px] text-[#9A958A]">
              {period}
            </span>
          </div>
        </header>
        <section className="mb-4 grid gap-3 md:grid-cols-2">
          <PwaInstallPrompt />
          <ParentNotificationPrompt token={token} />
        </section>
        <section className="portal-hero">
          <div className="portal-hero-content">
            <p className="eyebrow">WEEKLY LEARNING NOTE</p>
            <h1>{data.student.name} 학생의 수업일지</h1>
            <p>
              {data.student.grade} · 학습 과정과 학습 성취도를 안내드립니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white/15 px-2.5 py-1 text-white hover:bg-white/15">
                수업 {count(data.summary.lessons)}회 / 등록{" "}
                {count(data.summary.registered)}회
              </Badge>
              <Badge className="portal-attendance-message bg-[#D8C59A] px-2.5 py-1 text-[#193D3C] hover:bg-[#D8C59A]">
                {targetMessage}
              </Badge>
            </div>
            {(data.resources.vocabularyResultUrl ||
              data.resources.englishSpeakingUrl ||
              data.resources.mathUnitEvaluationUrl) && (
              <div className="portal-resource-actions">
                {data.resources.vocabularyResultUrl && (
                  <a
                    href={data.resources.vocabularyResultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    단어 암기 결과
                  </a>
                )}
                {data.resources.englishSpeakingUrl && (
                  <a
                    href={data.resources.englishSpeakingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-[#D8C59A]/70 bg-[#D8C59A] px-3 py-2 text-xs font-semibold text-[#193D3C] transition hover:bg-[#E8D5A6]"
                  >
                    영어 말하기
                  </a>
                )}
                {data.resources.mathUnitEvaluationUrl && (
                  <a
                    href={data.resources.mathUnitEvaluationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    수학 단원 평가
                  </a>
                )}
              </div>
            )}
          </div>
          <GraduationCap className="portal-hero-icon" />
        </section>
        <section className="portal-week-nav">
          <Button
            variant="outline"
            size="icon"
            onClick={() => moveWeek(-7)}
            aria-label="이전 주"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={journalDate}
            onChange={event => {
              if (isIsoDate(event.target.value))
                setJournalDate(event.target.value);
            }}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => moveWeek(7)}
            aria-label="다음 주"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJournalDate(todayInKorea)}
            className="hidden sm:inline-flex"
          >
            최근 주
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Switch
              checked={includeWeekend || data.weekendActive}
              onCheckedChange={setIncludeWeekend}
              id="portal-weekend"
            />
            <label
              htmlFor="portal-weekend"
              className="text-xs font-medium text-[#596D69]"
            >
              주말 수업 보기
            </label>
          </div>
        </section>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#71817D]">
          <CalendarRange className="h-3.5 w-3.5" />
          <span>강사가 입력한 내용이 저장 즉시 반영됩니다.</span>
        </div>
        <p className="mt-2 text-right text-[11px] text-[#71817D] md:hidden">
          좌우로 쓸어 전 주·다음 주 기록을 확인하세요.
        </p>
        <Card className="portal-card portal-desktop-table mt-5 hidden md:block">
          <CardContent className="p-0">
            <div className="portal-merged-grid" style={gridStyle}>
              <div
                className="portal-merged-head"
                style={{ gridColumn: 1, gridRow: 1 }}
              >
                구분
              </div>
              {data.dates.map((date, index) => (
                <div
                  className="portal-merged-head"
                  style={{ gridColumn: index + 2, gridRow: 1 }}
                  key={date}
                >
                  {dayLabel(date)}
                </div>
              ))}
              {hasComments && (
                <div
                  className="portal-merged-head"
                  style={{ gridColumn: data.dates.length + 2, gridRow: 1 }}
                >
                  비고
                </div>
              )}
              <div
                className="portal-merged-attendance"
                style={{ gridColumn: 1, gridRow: 2 }}
              >
                <b>출석</b>
              </div>
              {data.dates.map((date, index) => {
                const attendance = attendanceMap.get(date);
                const futureDate = date > todayInKorea();
                return (
                  <div
                    className="portal-merged-attendance"
                    style={{ gridColumn: index + 2, gridRow: 2 }}
                    key={date}
                  >
                    {futureDate ? (
                      <span>—</span>
                    ) : (
                      <div className="portal-attendance-inline">
                        <Badge
                          className={attendanceStatusBadgeClass(
                            attendance?.status
                          )}
                        >
                          {eventDisplayName(attendance)}
                        </Badge>
                        {attendance?.arrivalTime && (
                          <small>
                            등원{" "}
                            {formatArrivalTimeForDisplay(
                              attendance.arrivalTime
                            )}
                          </small>
                        )}
                        {attendance?.departureTime && (
                          <small>
                            하원{" "}
                            {formatArrivalTimeForDisplay(
                              attendance.departureTime
                            )}
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {hasComments && (
                <div
                  className="portal-merged-attendance"
                  style={{ gridColumn: data.dates.length + 2, gridRow: 2 }}
                />
              )}
              {data.classGroups.flatMap((group, groupIndex) => {
                const row = groupIndex + 3;
                return [
                  <div
                    className="portal-merged-subject-label"
                    style={{ gridColumn: 1, gridRow: row }}
                    key={`${group.id}-label`}
                  >
                    <b>{group.subject}</b>
                  </div>,
                  ...data.dates.map((date, index) => {
                    const journal = journals.get(`${group.id}-${date}`);
                    const attendance = attendanceMap.get(date);
                    const futureDate = date > todayInKorea();
                    const status = attendance?.status ?? "";
                    const statusMessage = [
                      "absent",
                      "not_registered",
                      "holiday",
                      "closed",
                    ].includes(status)
                      ? eventDisplayName(attendance)
                      : "—";
                    return (
                      <div
                        className="portal-merged-subject-cell"
                        style={{ gridColumn: index + 2, gridRow: row }}
                        key={`${group.id}-${date}`}
                      >
                        {journal && futureDate && (
                          <span className="portal-scheduled-badge">예정</span>
                        )}
                        <p className="whitespace-pre-line">
                          {journal?.content || statusMessage}
                        </p>
                        {journal?.homework && (
                          <span className="portal-homework whitespace-pre-line">
                            과제: {journal.homework}
                          </span>
                        )}
                        {journal?.notes && (
                          <span className="portal-note whitespace-pre-line">
                            {cleanNotice(journal.notes)}
                          </span>
                        )}
                      </div>
                    );
                  }),
                  ...(hasComments
                    ? [
                        <div
                          className="portal-merged-note-cell whitespace-pre-line"
                          style={{
                            gridColumn: data.dates.length + 2,
                            gridRow: row,
                          }}
                          key={`${group.id}-note`}
                        >
                          {comments.get(group.id)
                            ? cleanNotice(comments.get(group.id)!)
                            : "—"}
                        </div>,
                      ]
                    : []),
                ];
              })}
              {calendarSegments.map(segment => (
                <div
                  key={segment.key}
                  className="portal-merged-calendar-overlay"
                  style={{
                    gridColumn: `${data.dates.indexOf(segment.dates[0]!) + 2} / span ${segment.dates.length}`,
                    gridRow: `2 / span ${data.classGroups.length + 1}`,
                  }}
                >
                  <CalendarEventPanel
                    event={segment.event}
                    dates={segment.dates}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <section className="portal-mobile-records mt-[14px] space-y-[14px] md:hidden">
          {calendarSegments.map(segment => (
            <Card
              className="portal-card overflow-hidden gap-0 py-0"
              key={segment.key}
            >
              <CalendarEventPanel
                event={segment.event}
                dates={segment.dates}
                mobile
              />
            </Card>
          ))}
          <Card className="portal-card gap-0 py-0">
            <CardContent className="p-[14px]">
              <h2 className="font-serif text-xl text-[#173D3C]">주간 출석</h2>
              <div className="portal-attendance-weekdays mt-3">
                {weekdayDates.map(renderMobileAttendance)}
              </div>
              {weekendDates.length > 0 && (
                <div className="portal-attendance-weekends">
                  {weekendDates.map(renderMobileAttendance)}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="portal-mobile-attendance-message">
            {targetMessage}
          </div>
          {data.classGroups.map(group => (
            <Card className="portal-card gap-0 py-0" key={group.id}>
              <CardContent className="p-[14px]">
                <div>
                  <p className="eyebrow">SUBJECT</p>
                  <h2 className="mt-1 font-serif text-xl text-[#173D3C]">
                    {group.subject}
                  </h2>
                  {comments.get(group.id) && (
                    <div className="portal-mobile-comment">
                      <p className="whitespace-pre-line">
                        {cleanNotice(comments.get(group.id)!)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {data.dates.map(date => {
                    const journal = journals.get(`${group.id}-${date}`);
                    const attendance = attendanceMap.get(date);
                    const futureDate = date > todayInKorea();
                    const status = attendance?.status ?? "";
                    const statusMessage = [
                      "absent",
                      "not_registered",
                      "holiday",
                      "closed",
                    ].includes(status)
                      ? eventDisplayName(attendance)
                      : "—";
                    return (
                      <div
                        className="border-t border-[#EEE7DB] pt-3 first:border-t-0 first:pt-0"
                        key={date}
                      >
                        <b className="text-xs text-[#46625E]">
                          {dayLabel(date)}
                        </b>
                        {journal && futureDate && (
                          <span className="portal-scheduled-badge ml-2 align-middle">
                            예정
                          </span>
                        )}
                        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#53645F]">
                          {journal?.content || statusMessage}
                        </p>
                        {journal?.homework && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#84713E]">
                            과제: {journal.homework}
                          </p>
                        )}
                        {journal?.notes && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#7C6A5C]">
                            {cleanNotice(journal.notes)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
        <footer className="portal-footer">
          <HeartHandshake className="h-4 w-4" />
          <div>
            <b>소중한 자녀를 믿고 맡겨 주셔서 감사드립니다.</b>
          </div>
        </footer>
      </main>
    </div>
  );
}
