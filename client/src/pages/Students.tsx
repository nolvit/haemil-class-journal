import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getRegistrationCountPreview } from "@shared/studentCountRules";
import {
  getDaysUntilValidUntil,
  getValidUntilAfterTotalCountChange,
  isValidUntilDueSoon,
} from "@shared/studentExpiryRules";
import {
  getAutomaticTuitionMatch,
  type TuitionStandardValue,
} from "@shared/tuitionRules";
import {
  ArchiveRestore,
  Banknote,
  GraduationCap,
  History,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type CountInfo = {
  afterCount: number;
  remainingCount: number;
  weeklySessions: number;
  alert: string;
};
type Student = {
  id: number;
  name: string;
  grade: string;
  studentNumber: string | null;
  studentPhone: string | null;
  parentPhone: string | null;
  attendanceCode: string;
  memo: string | null;
  tuition: number;
  tuitionMode: "automatic" | "manual";
  registrationCount: number;
  lastWeekCount: number;
  totalCount: number;
  validUntil: string | null;
  paymentMethod: string | null;
  publicToken: string;
  portalEnabled: boolean;
  active: boolean;
  classGroups: Array<{ id: number; name: string; subject: string }>;
  countInfo: CountInfo;
};
type ClassGroup = { id: number; name: string; subject: string };
type StudentDraft = {
  name: string;
  grade: string;
  studentNumber: string;
  studentPhone: string;
  parentPhone: string;
  memo: string;
  tuition: number;
  tuitionMode?: "automatic" | "manual";
  registrationCount: number;
  lastWeekCount: number;
  totalCount: number;
  validUntil: string;
  paymentMethod: string;
  classGroupIds: number[];
  portalEnabled: boolean;
};
type SchoolLevel = "all" | "high" | "middle" | "elementary";
const emptyDraft: StudentDraft = {
  name: "",
  grade: "",
  studentNumber: "",
  studentPhone: "",
  parentPhone: "",
  memo: "",
  tuition: 0,
  tuitionMode: "automatic",
  registrationCount: 0,
  lastWeekCount: 0,
  totalCount: 0,
  validUntil: "",
  paymentMethod: "",
  classGroupIds: [],
  portalEnabled: false,
};
const formatNumber = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
const formatWon = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const todayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
function schoolLevel(grade: string): Exclude<SchoolLevel, "all"> {
  const normalized = grade.trim();
  return normalized.startsWith("고")
    ? "high"
    : normalized.startsWith("중")
      ? "middle"
      : "elementary";
}
const schoolLabel: Record<Exclude<SchoolLevel, "all">, string> = {
  high: "고등학생",
  middle: "중학생",
  elementary: "초등학생",
};
const schoolLevelOrder: Record<Exclude<SchoolLevel, "all">, number> = {
  high: 0,
  middle: 1,
  elementary: 2,
};
function gradeOrder(value: string) {
  const level = schoolLevel(value);
  const number = Number(value.replace(/[^0-9]/g, "")) || 99;
  return schoolLevelOrder[level] * 100 + number;
}

export default function Students() {
  const { user } = useAuth();
  const students = trpc.academy.students.list.useQuery({ active: true });
  const inactiveStudents = trpc.academy.students.list.useQuery({
    active: false,
  });
  const classGroups = trpc.academy.classGroups.list.useQuery();
  const tuitionStandards = trpc.academy.tuitionStandards.list.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Student | null | undefined>(
    undefined
  );
  const [registrationTarget, setRegistrationTarget] = useState<Student | null>(
    null
  );
  const [adjustmentTarget, setAdjustmentTarget] = useState<Student | null>(
    null
  );
  const [historyTarget, setHistoryTarget] = useState<Student | null>(null);
  const [level, setLevel] = useState<SchoolLevel>("all");
  const [showInactive, setShowInactive] = useState(false);
  const refresh = () => {
    void utils.academy.students.invalidate();
  };
  const create = trpc.academy.students.create.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("학생을 등록했습니다.");
      setSelected(undefined);
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.academy.students.update.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("학생 정보를 수정했습니다.");
      setSelected(undefined);
    },
    onError: error => toast.error(error.message),
  });
  const archive = trpc.academy.students.archive.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("학생을 비활성 처리했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const restore = trpc.academy.students.restore.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("학생을 다시 활성화했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const purge = trpc.academy.students.purge.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("비활성 학생과 연결된 기록을 완전히 삭제했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const addRegistration =
    trpc.academy.students.addRegistrationCount.useMutation({
      onSuccess: result => {
        refresh();
        setRegistrationTarget(null);
        toast.success(
          `총 수업 횟수에 ${formatNumber(result.added)}회를 추가했습니다.`
        );
      },
      onError: error => toast.error(error.message),
    });
  const adjustTotalCount = trpc.academy.students.adjustTotalCount.useMutation({
    onSuccess: result => {
      refresh();
      setAdjustmentTarget(null);
      toast.success(
        `총 수업 횟수를 ${result.added > 0 ? "+" : ""}${formatNumber(result.added)}회 조정했습니다.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const registrationHistory =
    trpc.academy.students.registrationHistory.useQuery(
      { studentId: historyTarget?.id ?? 1 },
      { enabled: Boolean(historyTarget) }
    );
  const activeRows = (students.data ?? []) as Student[];
  const visibleRows =
    level === "all"
      ? activeRows
      : activeRows.filter(student => schoolLevel(student.grade) === level);
  const summary = useMemo(
    () => ({
      tuition: activeRows.reduce((sum, student) => sum + student.tuition, 0),
      alerts: activeRows.filter(student => student.countInfo.alert).length,
    }),
    [activeRows]
  );
  const expiringStudents = useMemo(() => {
    const today = todayInKorea();
    return activeRows
      .filter(student => isValidUntilDueSoon(student.validUntil, today))
      .map(student => ({
        ...student,
        remainingDays: getDaysUntilValidUntil(student.validUntil!, today),
      }))
      .sort(
        (a, b) =>
          a.remainingDays - b.remainingDays ||
          a.name.localeCompare(b.name, "ko")
      );
  }, [activeRows]);
  const schoolCounts = useMemo(
    () => ({
      high: activeRows.filter(student => schoolLevel(student.grade) === "high")
        .length,
      middle: activeRows.filter(
        student => schoolLevel(student.grade) === "middle"
      ).length,
      elementary: activeRows.filter(
        student => schoolLevel(student.grade) === "elementary"
      ).length,
    }),
    [activeRows]
  );
  const gradeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const student of activeRows)
      counts.set(student.grade, (counts.get(student.grade) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([gradeA], [gradeB]) => gradeOrder(gradeA) - gradeOrder(gradeB))
      .map(([grade, count]) => ({ grade, count }));
  }, [activeRows]);
  const schoolSummaryGroups = useMemo(
    () => [
      {
        key: "high" as const,
        label: "고등부",
        count: schoolCounts.high,
        grades: gradeCounts.filter(item => schoolLevel(item.grade) === "high"),
      },
      {
        key: "middle" as const,
        label: "중등부",
        count: schoolCounts.middle,
        grades: gradeCounts.filter(
          item => schoolLevel(item.grade) === "middle"
        ),
      },
      {
        key: "elementary" as const,
        label: "초등부",
        count: schoolCounts.elementary,
        grades: gradeCounts.filter(
          item => schoolLevel(item.grade) === "elementary"
        ),
      },
    ],
    [gradeCounts, schoolCounts]
  );
  const attentionStudents = useMemo(
    () =>
      activeRows
        .filter(student => student.countInfo.alert)
        .sort(
          (a, b) => a.countInfo.remainingCount - b.countInfo.remainingCount
        ),
    [activeRows]
  );
  if (user?.role !== "admin") return <RestrictedPage title="학생 관리" />;
  return (
    <div className="journal-page-shell">
      <section className="journal-page-heading">
        <div>
          <p className="eyebrow">STUDENT DIRECTORY</p>
          <h1>학생 관리</h1>
          <p>학생 정보, 수강 과목, 원비와 수업 횟수를 함께 관리합니다.</p>
        </div>
        <Button
          className="journal-primary-button"
          onClick={() => setSelected(null)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          학생 등록
        </Button>
      </section>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric
          label="등록 학생"
          value={`${activeRows.length}명`}
          icon={<UsersRound className="h-4 w-4" />}
          detail={<SchoolSummary groups={schoolSummaryGroups} />}
        />
        <Metric
          label="월 원비 합계"
          value={formatWon(summary.tuition)}
          icon={<Banknote className="h-4 w-4" />}
          attention={expiringStudents.length > 0}
          detail={
            <div className="mt-3 space-y-1.5">
              {expiringStudents.length ? (
                <>
                  <p className="text-[11px] font-semibold text-[#8A6C10]">
                    만료확인일 30일 이내
                  </p>
                  {expiringStudents.map(student => (
                    <div
                      className="flex items-center justify-between rounded-lg bg-white/70 px-2.5 py-1.5 text-xs"
                      key={student.id}
                    >
                      <span className="font-medium text-[#294A47]">
                        {student.name}
                      </span>
                      <span className="text-[#A66A19]">
                        {student.remainingDays === 0
                          ? "오늘"
                          : `${student.remainingDays}일 남음`}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-xs text-[#71817D]">
                  30일 이내 만료확인 대상이 없습니다.
                </p>
              )}
            </div>
          }
        />
        <Metric
          label="횟수·원비 확인"
          value={`${summary.alerts}명`}
          icon={<ReceiptText className="h-4 w-4" />}
          attention={summary.alerts > 0}
          detail={
            <div className="mt-3 space-y-1.5">
              {attentionStudents.length ? (
                attentionStudents.map(student => (
                  <div
                    className="flex items-center justify-between rounded-lg bg-white/70 px-2.5 py-1.5 text-xs"
                    key={student.id}
                  >
                    <span className="font-medium text-[#294A47]">
                      {student.name}
                    </span>
                    <span className="text-[#A66A19]">
                      남은 {formatNumber(student.countInfo.remainingCount)}회
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#71817D]">확인 대상이 없습니다.</p>
              )}
            </div>
          }
        />
      </section>
      <section className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[#E7E1D5] bg-[#FFFEFA] p-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "all", label: "전체" },
              { key: "high", label: "고등" },
              { key: "middle", label: "중등" },
              { key: "elementary", label: "초등" },
            ] as Array<{ key: SchoolLevel; label: string }>
          ).map(item => (
            <Button
              key={item.key}
              variant={level === item.key ? "default" : "outline"}
              size="sm"
              className={
                level === item.key ? "journal-primary-button" : "bg-white"
              }
              onClick={() => setLevel(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto bg-white"
          onClick={() => setShowInactive(value => !value)}
        >
          <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
          비활성 학생 {inactiveStudents.data?.length ?? 0}명
        </Button>
      </section>
      {showInactive && (
        <section className="mt-5 rounded-2xl border border-[#E8D9D0] bg-[#FFFCF9] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">INACTIVE STUDENTS</p>
              <h2 className="mt-1 font-serif text-2xl text-[#193D3C]">
                비활성 학생
              </h2>
              <p className="mt-2 text-xs leading-5 text-[#71817D]">
                다시 활성화하면 기존 출석·수업일지와 수강 과목을 이어서 관리할
                수 있습니다. 완전 삭제는 연결 기록까지 되돌릴 수 없이
                제거합니다.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInactive(false)}
            >
              닫기
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {inactiveStudents.data?.length ? (
              (inactiveStudents.data as Student[]).map(student => (
                <Card className="border-[#E8DED8] bg-white" key={student.id}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <b className="text-[#294A47]">{student.name}</b>
                      <p className="mt-1 text-xs text-[#71817D]">
                        {student.grade} · 비활성
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restore.mutate({ id: student.id })}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        활성화
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="완전 삭제"
                        className="text-[#A05242] hover:text-[#A05242]"
                        onClick={() => {
                          if (
                            window.confirm(
                              `${student.name} 학생과 연결된 출석·수업일지·보호자 비고를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
                            )
                          )
                            purge.mutate({ id: student.id });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-[#71817D]">
                비활성 학생이 없습니다.
              </p>
            )}
          </div>
        </section>
      )}
      <section className="journal-student-grid mt-6">
        {students.isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Card className="h-72 animate-pulse bg-[#FCFBF7]" key={index} />
          ))
        ) : visibleRows.length ? (
          visibleRows.map(student => (
            <StudentCard
              key={student.id}
              student={student}
              onEdit={() => setSelected(student)}
              onArchive={() => {
                if (
                  window.confirm(
                    `${student.name} 학생을 비활성 처리할까요? 과거 일지와 출석 기록은 보존됩니다.`
                  )
                )
                  archive.mutate({ id: student.id });
              }}
              onAddRegistration={() => setRegistrationTarget(student)}
              onAdjustTotal={() => setAdjustmentTarget(student)}
              onViewHistory={() => setHistoryTarget(student)}
            />
          ))
        ) : (
          <Card className="journal-surface col-span-full">
            <CardContent className="journal-empty-state">
              <UsersRound className="h-7 w-7" />
              <h3>
                {level === "all"
                  ? "등록된 학생이 없습니다."
                  : `${schoolLabel[level]}이 없습니다.`}
              </h3>
              <p>학생을 등록하거나 다른 학교급 필터를 선택해 주세요.</p>
            </CardContent>
          </Card>
        )}
      </section>
      <StudentDialog
        open={selected !== undefined}
        student={selected ?? null}
        classGroups={(classGroups.data ?? []) as ClassGroup[]}
        tuitionStandards={
          (tuitionStandards.data ?? []) as TuitionStandardValue[]
        }
        onClose={() => setSelected(undefined)}
        pending={create.isPending || update.isPending}
        onSave={values =>
          selected
            ? update.mutate({ id: selected.id, values })
            : create.mutate(values)
        }
      />
      <RegistrationCountDialog
        student={registrationTarget}
        pending={addRegistration.isPending}
        onClose={() => setRegistrationTarget(null)}
        onConfirm={() =>
          registrationTarget &&
          addRegistration.mutate({ id: registrationTarget.id })
        }
      />
      <TotalCountAdjustmentDialog
        student={adjustmentTarget}
        pending={adjustTotalCount.isPending}
        onClose={() => setAdjustmentTarget(null)}
        onConfirm={delta =>
          adjustmentTarget &&
          adjustTotalCount.mutate({ id: adjustmentTarget.id, delta })
        }
      />
      <RegistrationHistoryDialog
        student={historyTarget}
        histories={registrationHistory.data ?? []}
        loading={registrationHistory.isLoading}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  attention,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  attention?: boolean;
  detail?: React.ReactNode;
}) {
  return (
    <Card
      className={`journal-surface ${attention ? "border-[#E2C676] bg-[#FFFAE8]" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#71817D]">{label}</p>
            <strong className="mt-2 block font-serif text-2xl text-[#193D3C]">
              {value}
            </strong>
          </div>
          <span
            className={`rounded-xl p-2.5 ${attention ? "bg-[#FFF1B7] text-[#8A6C10]" : "bg-[#E8EFED] text-[#315B57]"}`}
          >
            {icon}
          </span>
        </div>
        {detail}
      </CardContent>
    </Card>
  );
}
function SchoolSummary({
  groups,
}: {
  groups: Array<{
    key: Exclude<SchoolLevel, "all">;
    label: string;
    count: number;
    grades: Array<{ grade: string; count: number }>;
  }>;
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {groups.map(group => (
        <div
          className="min-w-0 rounded-lg border border-[#ECE5D9] bg-[#FCFBF7] px-2 py-2"
          key={group.key}
        >
          <p
            className={`text-[11px] font-semibold ${group.key === "high" ? "text-[#315B57]" : group.key === "middle" ? "text-[#53627A]" : "text-[#8A6C10]"}`}
          >
            {group.label} {group.count}명
          </p>
          <div className="mt-1.5 space-y-1">
            {group.grades.length ? (
              group.grades.map(item => (
                <p
                  className="flex justify-between text-[10px] text-[#657570]"
                  key={item.grade}
                >
                  <span>{item.grade}</span>
                  <b>{item.count}명</b>
                </p>
              ))
            ) : (
              <p className="text-[10px] text-[#A08D78]">등록 없음</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function StudentCard({
  student,
  onEdit,
  onArchive,
  onAddRegistration,
  onAdjustTotal,
  onViewHistory,
}: {
  student: Student;
  onEdit: () => void;
  onArchive: () => void;
  onAddRegistration: () => void;
  onAdjustTotal: () => void;
  onViewHistory: () => void;
}) {
  const metrics = [
    ["등록", student.registrationCount],
    ["이전 주", student.lastWeekCount],
    ["수업 후", student.countInfo.afterCount],
    ["총", student.totalCount],
    ["남은", student.countInfo.remainingCount],
  ];
  return (
    <Card
      className={`journal-student-card ${student.countInfo.alert ? "border-[#E6C96D]" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="journal-avatar">{student.name.slice(0, 1)}</div>
          <div className="flex items-center gap-1">
            <Badge className="mr-1 bg-[#F5ECD0] font-mono text-[#765E10] hover:bg-[#F5ECD0]">
              출결 {student.attendanceCode}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="학생 정보 수정"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onArchive}
              aria-label="학생 비활성 처리"
              className="text-[#A05242] hover:text-[#A05242]"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <h2 className="font-serif text-[23px] text-[#193D3C]">
            {student.name}
          </h2>
          <p className="mt-1 text-sm text-[#71817D]">
            {student.grade}
            {student.studentNumber ? ` · ${student.studentNumber}` : ""}
          </p>
          {student.studentPhone && (
            <p className="mt-1 text-xs text-[#71817D]">
              학생 {student.studentPhone}
            </p>
          )}
          <p className="mt-2 text-xs text-[#71817D]">
            원비 <b className="text-[#315B57]">{formatWon(student.tuition)}</b>
            {student.paymentMethod ? ` · ${student.paymentMethod}` : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {student.classGroups.length ? (
            student.classGroups.map(group => (
              <Badge
                className="bg-[#E8EFED] text-[#315B57] hover:bg-[#E8EFED]"
                key={group.id}
              >
                {group.subject}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-[#A08D78]">수강 과목 미지정</span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1 border-y border-[#E8E3D8] py-3">
          {metrics.map(([label, value]) => (
            <div className="text-center" key={String(label)}>
              <p className="text-[9px] text-[#8A9794]">{label}</p>
              <b
                className={`mt-1 block text-xs ${label === "남은" && Number(value) <= student.registrationCount ? "text-[#A66A19]" : "text-[#294A47]"}`}
              >
                {formatNumber(Number(value))}
              </b>
            </div>
          ))}
        </div>
        {student.countInfo.alert && (
          <p className="mt-3 rounded-lg bg-[#FFF1B7] px-2.5 py-2 text-xs font-semibold text-[#765E10]">
            {student.countInfo.alert}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={onViewHistory}>
              <History className="mr-1 h-3.5 w-3.5" />
              내역 보기
            </Button>
            <Button size="sm" variant="outline" onClick={onAdjustTotal}>
              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />총 횟수 조정
            </Button>
            <Button size="sm" variant="outline" onClick={onAddRegistration}>
              + 등록 횟수
            </Button>
          </div>
          <GraduationCap className="h-4 w-4 text-[#C5B28A]" />
        </div>
      </CardContent>
    </Card>
  );
}
function RegistrationCountDialog({
  student,
  pending,
  onClose,
  onConfirm,
}: {
  student: Student | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const preview = student
    ? getRegistrationCountPreview(student.totalCount, student.registrationCount)
    : null;
  return (
    <Dialog
      open={Boolean(student)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="journal-dialog sm:max-w-[430px]">
        <DialogHeader>
          <p className="eyebrow">ADD REGISTRATION COUNT</p>
          <DialogTitle>등록 횟수를 추가할까요?</DialogTitle>
          <DialogDescription>
            {student?.name} 학생의 등록 횟수{" "}
            {formatNumber(student?.registrationCount ?? 0)}회 × 4를 총 횟수에
            적용합니다.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[#E5DFD3] bg-[#FBF9F3] p-4">
            <div>
              <p className="text-xs text-[#71817D]">적용 전 총 횟수</p>
              <b className="mt-1 block font-serif text-2xl text-[#294A47]">
                {formatNumber(preview.beforeTotalCount)}회
              </b>
            </div>
            <span className="text-lg text-[#B8891B]">→</span>
            <div className="text-right">
              <p className="text-xs text-[#71817D]">적용 후 총 횟수</p>
              <b className="mt-1 block font-serif text-2xl text-[#315B57]">
                {formatNumber(preview.afterTotalCount)}회
              </b>
              <small className="mt-1 block text-xs text-[#8A6C10]">
                +{formatNumber(preview.addedCount)}회
              </small>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button
            className="journal-primary-button"
            disabled={pending || !student}
            onClick={onConfirm}
          >
            적용하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function TotalCountAdjustmentDialog({
  student,
  pending,
  onClose,
  onConfirm,
}: {
  student: Student | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (delta: number) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue("");
  }, [student]);
  const delta = Number(value) || 0;
  const afterTotal = (student?.totalCount ?? 0) + delta;
  const valid = Boolean(student) && delta !== 0 && afterTotal >= 0;
  return (
    <Dialog
      open={Boolean(student)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="journal-dialog sm:max-w-[430px]">
        <DialogHeader>
          <p className="eyebrow">MANUAL TOTAL ADJUSTMENT</p>
          <DialogTitle>총 횟수를 수동 조정할까요?</DialogTitle>
          <DialogDescription>
            양수는 횟수를 늘리고, 음수는 횟수를 차감합니다. 모든 조정은 내역에
            기록됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="증감 횟수">
            <Input
              autoFocus
              type="number"
              step="0.5"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="예: 2 또는 -1"
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[#E5DFD3] bg-[#FBF9F3] p-4">
            <div>
              <p className="text-xs text-[#71817D]">적용 전 총 횟수</p>
              <b className="mt-1 block font-serif text-2xl text-[#294A47]">
                {formatNumber(student?.totalCount ?? 0)}회
              </b>
            </div>
            <span className="text-lg text-[#B8891B]">→</span>
            <div className="text-right">
              <p className="text-xs text-[#71817D]">적용 후 총 횟수</p>
              <b
                className={`mt-1 block font-serif text-2xl ${afterTotal < 0 ? "text-[#A05242]" : "text-[#315B57]"}`}
              >
                {formatNumber(afterTotal)}회
              </b>
              <small
                className={`mt-1 block text-xs ${delta < 0 ? "text-[#A05242]" : "text-[#8A6C10]"}`}
              >
                {delta
                  ? `${delta > 0 ? "+" : ""}${formatNumber(delta)}회`
                  : "증감 횟수를 입력해 주세요."}
              </small>
            </div>
          </div>
          {afterTotal < 0 && (
            <p className="text-xs font-medium text-[#A05242]">
              총 횟수는 0회보다 작게 조정할 수 없습니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button
            className="journal-primary-button"
            disabled={pending || !valid}
            onClick={() => onConfirm(delta)}
          >
            적용하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function RegistrationHistoryDialog({
  student,
  histories,
  loading,
  onClose,
}: {
  student: Student | null;
  histories: Array<{
    id: number;
    changeType: string;
    registrationCount: number;
    addedCount: number;
    beforeTotalCount: number;
    afterTotalCount: number;
    createdAt: Date | string;
    recordedBy: string | null;
  }>;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(student)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="journal-dialog max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <p className="eyebrow">TOTAL COUNT HISTORY</p>
          <DialogTitle>{student?.name} 학생 총 횟수 변경 내역</DialogTitle>
          <DialogDescription>
            등록 횟수 추가와 관리자의 수동 총 횟수 조정 기록을 함께 표시합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#71817D]">
              내역을 불러오는 중입니다.
            </p>
          ) : histories.length ? (
            histories.map(item => {
              const manual = item.changeType === "manual_adjustment";
              const decreased = item.addedCount < 0;
              return (
                <div
                  className="rounded-xl border border-[#E5DFD3] bg-[#FBF9F3] p-4"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#294A47]">
                        총 {formatNumber(item.beforeTotalCount)}회 →{" "}
                        {formatNumber(item.afterTotalCount)}회
                      </p>
                      <p className="mt-1 text-xs text-[#71817D]">
                        {manual
                          ? "관리자 수동 조정"
                          : `등록 ${formatNumber(item.registrationCount)}회 × 4`}{" "}
                        · {item.addedCount > 0 ? "+" : ""}
                        {formatNumber(item.addedCount)}회
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${decreased ? "bg-[#FCE9E5] text-[#A05242]" : "bg-[#E8EFED] text-[#315B57]"}`}
                    >
                      {item.addedCount > 0 ? "+" : ""}
                      {formatNumber(item.addedCount)}회
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[#8A9794]">
                    {new Date(item.createdAt).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · {item.recordedBy || "관리자"}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-[#71817D]">
              총 횟수 변경 내역이 없습니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function StudentDialog({
  open,
  student,
  classGroups,
  tuitionStandards,
  onClose,
  onSave,
  pending,
}: {
  open: boolean;
  student: Student | null;
  classGroups: ClassGroup[];
  tuitionStandards: TuitionStandardValue[];
  onClose: () => void;
  onSave: (values: StudentDraft) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft);
  useEffect(() => {
    setDraft(
      student
        ? {
            name: student.name,
            grade: student.grade,
            studentNumber: student.studentNumber ?? "",
            studentPhone: student.studentPhone ?? "",
            parentPhone: student.parentPhone ?? "",
            memo: student.memo ?? "",
            tuition: student.tuition,
            tuitionMode: student.tuitionMode,
            registrationCount: student.registrationCount,
            lastWeekCount: student.lastWeekCount,
            totalCount: student.totalCount,
            validUntil: student.validUntil?.slice(0, 10) ?? "",
            paymentMethod: student.paymentMethod ?? "",
            classGroupIds: student.classGroups.map(group => group.id),
            portalEnabled: student.portalEnabled,
          }
        : emptyDraft
    );
  }, [student, open]);
  const automaticTuition = useMemo(
    () =>
      getAutomaticTuitionMatch(
        draft.grade,
        draft.registrationCount,
        draft.classGroupIds.length,
        tuitionStandards
      ),
    [
      draft.classGroupIds.length,
      draft.grade,
      draft.registrationCount,
      tuitionStandards,
    ]
  );
  useEffect(() => {
    if (
      draft.tuitionMode !== "automatic" ||
      !automaticTuition ||
      draft.tuition === automaticTuition.tuition
    )
      return;
    setDraft(current =>
      current.tuitionMode === "automatic" &&
      current.tuition !== automaticTuition.tuition
        ? { ...current, tuition: automaticTuition.tuition }
        : current
    );
  }, [automaticTuition?.tuition, draft.tuition, draft.tuitionMode]);
  const toggleGroup = (id: number, checked: boolean) =>
    setDraft(current => ({
      ...current,
      classGroupIds: checked
        ? [...current.classGroupIds, id]
        : current.classGroupIds.filter(value => value !== id),
    }));
  const updateNumber = (
    key: "registrationCount" | "lastWeekCount" | "totalCount",
    value: string
  ) =>
    setDraft(current => {
      const nextValue = Math.max(0, Number(value) || 0);
      const totalCountChanged =
        key === "totalCount" &&
        student !== null &&
        nextValue !== student.totalCount;
      return {
        ...current,
        [key]: nextValue,
        ...(key === "totalCount" && student
          ? {
              validUntil: totalCountChanged
                ? getValidUntilAfterTotalCountChange(todayInKorea())
                : (student.validUntil?.slice(0, 10) ?? ""),
            }
          : {}),
      };
    });
  const applyAutomaticTuition = () => {
    if (!automaticTuition)
      return toast.error(
        "현재 선택한 학년·수강 과목·등록 횟수에는 원비 기준이 없습니다."
      );
    setDraft(current => ({
      ...current,
      tuition: automaticTuition.tuition,
      tuitionMode: "automatic",
    }));
  };
  const automaticUnavailable =
    draft.tuitionMode === "automatic" && !automaticTuition;
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="journal-dialog max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <p className="eyebrow">{student ? "EDIT STUDENT" : "NEW STUDENT"}</p>
          <DialogTitle>{student ? "학생 정보 수정" : "학생 등록"}</DialogTitle>
          <DialogDescription>
            기본 정보와 수강 과목, 원비 및 수업 횟수를 함께 설정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="학생 이름" required>
              <Input
                value={draft.name}
                onChange={event =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="예: 김해밀"
              />
            </Field>
            <Field label="학년" required>
              <Input
                value={draft.grade}
                onChange={event =>
                  setDraft({ ...draft, grade: event.target.value })
                }
                placeholder="예: 중등 2"
              />
            </Field>
            <Field label="학교명">
              <Input
                value={draft.studentNumber}
                onChange={event =>
                  setDraft({ ...draft, studentNumber: event.target.value })
                }
                placeholder="선택 입력"
              />
            </Field>
            <Field label="학생 전화번호">
              <Input
                inputMode="tel"
                value={draft.studentPhone}
                onChange={event =>
                  setDraft({ ...draft, studentPhone: event.target.value })
                }
                placeholder="학생 휴대전화"
              />
            </Field>
            <Field label="보호자 연락처">
              <Input
                inputMode="tel"
                value={draft.parentPhone}
                onChange={event =>
                  setDraft({ ...draft, parentPhone: event.target.value })
                }
                placeholder="선택 입력"
              />
            </Field>
          </div>
          <div className="grid gap-4 rounded-xl border border-[#E5DFD3] bg-[#FBF9F3] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-xl border border-[#E6D6A9] bg-[#FFFDF6] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#294A47]">
                    원비 설정
                  </p>
                  <p className="mt-1 text-xs text-[#71817D]">
                    {automaticTuition
                      ? automaticTuition.label
                      : "수강 과목과 등록 횟수를 선택하면 자동 산정 기준을 확인할 수 있습니다."}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[#D9C491] bg-white text-[#6E5918]"
                  disabled={!automaticTuition}
                  onClick={applyAutomaticTuition}
                >
                  자동 산정 적용
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draft.tuitionMode === "automatic" ? "bg-[#E8EFED] text-[#315B57]" : "bg-[#F5ECD0] text-[#846914]"}`}
                >
                  {draft.tuitionMode === "automatic"
                    ? "자동 산정"
                    : "개별 원비"}
                </span>
                <b className="font-serif text-lg text-[#294A47]">
                  {formatWon(draft.tuition)}
                </b>
              </div>
            </div>
            <Field label="월 원비">
              <Input
                type="number"
                min="0"
                step="1000"
                value={draft.tuition}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    tuition: Math.max(0, Number(event.target.value) || 0),
                    tuitionMode: "manual",
                  }))
                }
              />
              <p className="text-[11px] leading-4 text-[#71817D]">
                직접 수정하면 개별 원비로 저장됩니다.
              </p>
            </Field>
            <Field label="등록 횟수">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={draft.registrationCount}
                onChange={event =>
                  updateNumber("registrationCount", event.target.value)
                }
              />
              <p className="text-[11px] leading-4 text-[#71817D]">
                주당 횟수 × 4주로 월 수업 횟수를 계산합니다.
              </p>
            </Field>
            {automaticUnavailable && (
              <p className="sm:col-span-2 rounded-lg bg-[#FFF1B7] px-3 py-2 text-xs leading-5 text-[#765E10]">
                원비 기준이 없는 조합입니다. 월 원비를 직접 입력하면 개별 원비로
                저장할 수 있습니다.
              </p>
            )}
            <Field label="이전 주 수업 횟수">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={draft.lastWeekCount}
                onChange={event =>
                  updateNumber("lastWeekCount", event.target.value)
                }
              />
            </Field>
            <Field label="총 수업 횟수">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={draft.totalCount}
                onChange={event =>
                  updateNumber("totalCount", event.target.value)
                }
              />
            </Field>
            <Field label="만료·확인일">
              <Input
                type="date"
                value={draft.validUntil}
                onChange={event =>
                  setDraft({ ...draft, validUntil: event.target.value })
                }
              />
              <p className="text-[11px] leading-4 text-[#71817D]">
                총 수업 횟수를 변경하면 오늘 기준 60일 뒤로 자동 설정됩니다.
              </p>
            </Field>
            <Field label="결제 방식">
              <Input
                value={draft.paymentMethod}
                onChange={event =>
                  setDraft({ ...draft, paymentMethod: event.target.value })
                }
                placeholder="예: 카드, 이체"
              />
            </Field>
          </div>
          <Field label="수강 과목">
            <div className="journal-checkbox-list">
              {classGroups.length ? (
                classGroups.map(group => (
                  <label key={group.id}>
                    <Checkbox
                      checked={draft.classGroupIds.includes(group.id)}
                      onCheckedChange={checked =>
                        toggleGroup(group.id, checked === true)
                      }
                    />
                    <span>
                      <b>{group.subject}</b>
                      <small>반 관리 과목과 연동됨</small>
                    </span>
                  </label>
                ))
              ) : (
                <p>
                  등록된 과목이 없습니다. 먼저 반 관리에서 과목을 등록해 주세요.
                </p>
              )}
            </div>
          </Field>
          <Field label="관리 메모">
            <Textarea
              value={draft.memo}
              onChange={event =>
                setDraft({ ...draft, memo: event.target.value })
              }
              placeholder="강사 참고 사항 등 내부 관리 메모를 입력합니다."
            />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-[#E5DFD3] bg-[#FBF9F3] p-4">
            <div>
              <b className="text-sm text-[#284A47]">보호자 공개 열람</b>
              <p className="mt-1 text-xs leading-5 text-[#71817D]">
                개별 비공개 링크에서 주간 수업일지를 열람할 수 있습니다.
              </p>
            </div>
            <Switch
              checked={draft.portalEnabled}
              onCheckedChange={checked =>
                setDraft({ ...draft, portalEnabled: checked })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            className="journal-primary-button"
            disabled={
              pending ||
              !draft.name.trim() ||
              !draft.grade.trim() ||
              automaticUnavailable
            }
            onClick={() =>
              onSave({
                ...draft,
                name: draft.name.trim(),
                grade: draft.grade.trim(),
              })
            }
          >
            저장하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label} {required && <b className="text-[#B8891B]">필수</b>}
      </Label>
      {children}
    </div>
  );
}
export function RestrictedPage({ title }: { title: string }) {
  return (
    <div className="journal-page-shell">
      <section className="journal-page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>{title}</h1>
        </div>
      </section>
      <Card className="journal-surface mt-8">
        <CardContent className="journal-empty-state">
          <ShieldAlert className="h-8 w-8" />
          <h3>관리자 권한이 필요한 메뉴입니다.</h3>
          <p>학생 및 반 관리 기능은 관리자 계정에서만 이용할 수 있습니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}
