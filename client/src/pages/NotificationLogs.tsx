import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BellRing, ChevronDown, Smartphone } from "lucide-react";
import { useMemo } from "react";
import { RestrictedPage } from "./Students";

type NotificationType =
  | "attendance_check_in"
  | "attendance_check_out"
  | "remaining_two"
  | "total_count"
  | "test";

type NotificationLog = {
  id: number;
  studentId: number;
  studentName: string;
  notificationType: string;
  title: string;
  body: string;
  eventDate: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  unavailable: boolean;
  createdAt: string | Date;
};

const typeLabels: Record<NotificationType, string> = {
  attendance_check_in: "등원",
  attendance_check_out: "하원",
  remaining_two: "잔여 2회",
  total_count: "총 횟수 변경",
  test: "테스트",
};

function isAttendanceLog(log: NotificationLog) {
  return (
    log.notificationType === "attendance_check_in" ||
    log.notificationType === "attendance_check_out"
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function toTimestamp(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

function DeliveryStatus({ log }: { log: NotificationLog }) {
  if (log.unavailable)
    return <Badge className="bg-[#F4E5DD] text-[#985D45] hover:bg-[#F4E5DD]">서버 알림 설정 없음</Badge>;
  if (log.targetCount === 0)
    return <Badge className="bg-[#F1EEE7] text-[#796554] hover:bg-[#F1EEE7]">수신 기기 없음</Badge>;
  if (log.failedCount > 0)
    return <Badge className="bg-[#FFF1B7] text-[#765E10] hover:bg-[#FFF1B7]">성공 {log.sentCount}대 · 실패 {log.failedCount}대</Badge>;
  return <Badge className="bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]">전송 성공 {log.sentCount}대</Badge>;
}

export default function NotificationLogs() {
  const { user } = useAuth();
  const logs = trpc.academy.notificationLogs.list.useQuery();
  const items = useMemo(() => {
    const rows = (logs.data ?? []) as NotificationLog[];
    const attendanceByDate = new Map<string, NotificationLog[]>();
    const result: Array<
      | { kind: "attendance"; key: string; sortAt: number; logs: NotificationLog[] }
      | { kind: "single"; key: string; sortAt: number; log: NotificationLog }
    > = [];
    for (const log of rows) {
      if (isAttendanceLog(log)) {
        const date = log.eventDate ?? "날짜 미상";
        const dateLogs = attendanceByDate.get(date) ?? [];
        dateLogs.push(log);
        attendanceByDate.set(date, dateLogs);
      } else {
        result.push({
          kind: "single",
          key: `log-${log.id}`,
          sortAt: toTimestamp(log.createdAt),
          log,
        });
      }
    }
    for (const [date, dateLogs] of Array.from(attendanceByDate.entries())) {
      result.push({
        kind: "attendance",
        key: `attendance-${date}`,
        sortAt: Math.max(...dateLogs.map(log => toTimestamp(log.createdAt))),
        logs: dateLogs,
      });
    }
    return result.sort((a, b) => b.sortAt - a.sortAt);
  }, [logs.data]);

  if (user?.role !== "admin") return <RestrictedPage title="알림 로그" />;

  return <div className="journal-page-shell"><section className="journal-page-heading"><div><p className="eyebrow">NOTIFICATION HISTORY</p><h1>알림 로그</h1><p>보호자 기기로 전송을 시도한 알림과 기기별 전송 결과를 확인합니다.</p></div><Badge className="bg-[#E8EFED] px-3 py-2 text-[#315B57] hover:bg-[#E8EFED]"><BellRing className="mr-1.5 h-4 w-4" />최근 500건</Badge></section><Card className="journal-surface mt-6 border-[#E2D4A6] bg-[#FFFBEF]"><CardContent className="flex gap-3 p-4 text-sm leading-6 text-[#6E5B2B]"><Smartphone className="mt-0.5 h-5 w-5 shrink-0" /><p>‘전송 성공’은 보호자 기기의 알림 서비스가 메시지를 정상 접수했다는 뜻입니다. 기기 전원·방해금지 설정에 따라 실제 화면 표시 여부는 달라질 수 있습니다.</p></CardContent></Card><section className="mt-5 space-y-3">{logs.isLoading ? Array.from({ length: 5 }).map((_, index) => <Skeleton className="h-28 w-full rounded-2xl" key={index} />) : items.length ? items.map(item => item.kind === "attendance" ? <AttendanceDayGroup key={item.key} logs={item.logs} /> : <SingleLogCard key={item.key} log={item.log} />) : <Card className="journal-surface"><CardContent className="journal-empty-state"><BellRing className="h-7 w-7" /><h3>아직 저장된 알림이 없습니다.</h3><p>배포 이후 새로 발송되는 알림부터 이곳에 기록됩니다.</p></CardContent></Card>}</section></div>;
}

function AttendanceDayGroup({ logs }: { logs: NotificationLog[] }) {
  const date = logs[0]?.eventDate ?? "날짜 미상";
  const sentCount = logs.reduce((sum, log) => sum + log.sentCount, 0);
  const checkInCount = logs.filter(log => log.notificationType === "attendance_check_in").length;
  const checkOutCount = logs.length - checkInCount;
  return <details className="group overflow-hidden rounded-2xl border border-[#E6E0D4] bg-[#FFFEFA] shadow-[0_8px_24px_rgba(53,64,56,0.045)]"><summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#71817D]">{date === "날짜 미상" ? date : formatDate(date)}</p><h2 className="mt-1 font-serif text-xl text-[#193D3C]">등·하원 알림 {logs.length}건</h2><p className="mt-1 text-xs text-[#71817D]">등원 {checkInCount}건 · 하원 {checkOutCount}건 · 성공 기기 합계 {sentCount}대</p></div><ChevronDown className="h-5 w-5 shrink-0 text-[#71817D] transition-transform group-open:rotate-180" /></summary><div className="divide-y divide-[#EEE9E0] border-t border-[#EEE9E0]">{logs.map(log => <div className="grid gap-2 px-5 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center" key={log.id}><div><b className="text-sm text-[#254946]">{log.studentName}</b><p className="mt-0.5 text-xs text-[#71817D]">{typeLabels[log.notificationType as NotificationType] ?? "알림"} · {formatDateTime(log.createdAt)}</p></div><p className="text-sm leading-6 text-[#53645F]">{log.body}</p><DeliveryStatus log={log} /></div>)}</div></details>;
}

function SingleLogCard({ log }: { log: NotificationLog }) {
  return <Card className="journal-surface"><CardContent className="grid gap-3 p-5 sm:grid-cols-[minmax(160px,0.35fr)_minmax(0,1fr)_auto] sm:items-center"><div><Badge variant="outline" className="border-[#D7CCAE] bg-[#FFFBEF] text-[#765E10]">{typeLabels[log.notificationType as NotificationType] ?? "알림"}</Badge><h2 className="mt-2 font-serif text-xl text-[#193D3C]">{log.studentName}</h2><p className="mt-1 text-xs text-[#71817D]">{formatDateTime(log.createdAt)}</p></div><div><b className="text-sm text-[#315B57]">{log.title}</b><p className="mt-1 text-sm leading-6 text-[#53645F]">{log.body}</p></div><DeliveryStatus log={log} /></CardContent></Card>;
}
