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
import { trpc } from "@/lib/trpc";
import {
  BellRing,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RestrictedPage } from "./Students";

type Student = {
  id: number;
  name: string;
  grade: string;
  familyKey: string | null;
  publicToken: string;
  portalEnabled: boolean;
  monthlyViewCount: number;
  pushDevices: Array<{ id: number; label: string; updatedAt: string | Date }>;
  classGroups: Array<{ id: number; name: string }>;
};

const parentPortalOrigin = "https://journal.haemiledu.kr";

export default function ParentLinks() {
  const { user } = useAuth();
  const students = trpc.academy.students.list.useQuery();
  const utils = trpc.useUtils();
  const [familyDialogStudent, setFamilyDialogStudent] = useState<Student | null>(null);
  const rotate = trpc.academy.students.rotatePortalLink.useMutation({
    onSuccess: () => {
      void utils.academy.students.invalidate();
      toast.success("새 보호자 링크를 발급했습니다. 이전 링크는 더 이상 열리지 않습니다.");
    },
    onError: error => toast.error(error.message),
  });
  if (user?.role !== "admin") return <RestrictedPage title="보호자 공유 링크" />;
  const copy = async (token: string) => {
    const link = `${parentPortalOrigin}/p/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("보호자 공유 링크를 복사했습니다.");
    } catch {
      toast.message(link);
    }
  };
  const allStudents = (students.data ?? []) as Student[];
  return (
    <div className="journal-page-shell">
      <section className="journal-page-heading">
        <div>
          <p className="eyebrow">PARENT ACCESS</p>
          <h1>보호자 공유 링크</h1>
          <p>
            학생별 고정 링크를 복사하거나, 필요 시 이전 링크를 무효화하고 새
            링크를 발급합니다.
          </p>
        </div>
        <Badge className="bg-[#E8EFED] px-3 py-2 text-[#315B57] hover:bg-[#E8EFED]">
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          개별 링크 관리
        </Badge>
      </section>
      <Card className="journal-surface mt-6 border-[#E2D4A6] bg-[#FFFBEF]">
        <CardContent className="flex gap-3 p-4 text-sm leading-6 text-[#6E5B2B]">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <b>공유 전 확인:</b> 공개 열람을 켠 학생만 링크를 사용할 수
            있습니다. 링크를 재발급하면 기존 링크는 즉시 사용할 수 없으므로,
            새 주소를 보호자에게 다시 안내해 주세요. 형제·자매를 한 그룹으로
            묶으면 그중 한 명의 링크로 앱을 설치해도 형제·자매 전원의
            수업일지와 알림을 함께 받아볼 수 있습니다.
          </p>
        </CardContent>
      </Card>
      <section className="mt-5 grid gap-3">
        {students.isLoading
          ? Array.from({ length: 5 }).map((_, index) => (
              <Card className="h-28 animate-pulse" key={index} />
            ))
          : allStudents.map(student => (
              <LinkCard
                key={student.id}
                student={student}
                onCopy={() => copy(student.publicToken)}
                onRotate={() => {
                  if (
                    window.confirm(
                      `${student.name} 학생의 기존 보호자 링크를 무효화하고 새 링크를 발급할까요?`
                    )
                  )
                    rotate.mutate({ id: student.id });
                }}
                rotating={rotate.isPending}
                onManageFamily={() => setFamilyDialogStudent(student)}
              />
            ))}
      </section>
      <FamilyDialog
        student={familyDialogStudent}
        allStudents={allStudents}
        onClose={() => setFamilyDialogStudent(null)}
      />
    </div>
  );
}

function LinkCard({
  student,
  onCopy,
  onRotate,
  rotating,
  onManageFamily,
}: {
  student: Student;
  onCopy: () => void;
  onRotate: () => void;
  rotating: boolean;
  onManageFamily: () => void;
}) {
  const link = `${parentPortalOrigin}/p/${student.publicToken}`;
  return (
    <Card className={`journal-surface ${student.portalEnabled ? "" : "opacity-75"}`}>
      <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)_auto]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl text-[#193D3C]">{student.name}</h2>
            <Badge className="shrink-0 bg-[#F5ECD0] text-[#765E10] hover:bg-[#F5ECD0]">
              이번 달 {student.monthlyViewCount ?? 0}회
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#71817D]">
            {student.grade} ·{" "}
            {student.classGroups.map(group => group.name).join(" · ") ||
              "수강 반 미지정"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              className={`${student.portalEnabled ? "bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]" : "bg-[#F1EEE7] text-[#796554] hover:bg-[#F1EEE7]"}`}
            >
              {student.portalEnabled ? "공개 중" : "비공개"}
            </Badge>
            {student.familyKey && (
              <Badge className="bg-[#E7EDF7] text-[#45627A] hover:bg-[#E7EDF7]">
                형제·자매 공동 PWA
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-[#45627A] hover:bg-[#E7EDF7]"
              onClick={onManageFamily}
            >
              <Users className="h-3 w-3" />
              {student.familyKey ? "형제·자매 관리" : "형제·자매 연결"}
            </Button>
          </div>
          <div className="mt-3 rounded-lg border border-[#E4DED2] bg-[#FAF8F2] px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#526A66]">
              <BellRing className="h-3.5 w-3.5" />
              알림 수신 기기 {student.pushDevices.length}대
            </p>
            {student.pushDevices.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {student.pushDevices.map((device, index) => (
                  <Badge
                    key={device.id}
                    variant="outline"
                    className="border-[#C8D8D3] bg-white text-[#315B57]"
                  >
                    {index + 1}. {device.label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-[#9A6B4A]">
                알림 수신 설정한 기기 없음
              </p>
            )}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Input readOnly value={link} className="h-10 bg-[#FCFBF7] text-xs" />
          <Button variant="outline" size="icon" onClick={onCopy} aria-label="링크 복사">
            <Copy className="h-4 w-4" />
          </Button>
          <a href={link} target="_blank" rel="noreferrer">
            <Button variant="outline" size="icon" aria-label="보호자 화면 열기">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>
        <Button
          variant="outline"
          disabled={rotating}
          onClick={onRotate}
          className="h-10 border-[#D9C792] text-[#765E10] hover:bg-[#FFF7D9]"
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          링크 재발급
        </Button>
      </CardContent>
    </Card>
  );
}

function FamilyDialog({
  student,
  allStudents,
  onClose,
}: {
  student: Student | null;
  allStudents: Student[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [initializedFor, setInitializedFor] = useState<number | null>(null);

  const currentSiblingIds = useMemo(() => {
    if (!student?.familyKey) return new Set<number>();
    return new Set(
      allStudents
        .filter(other => other.id !== student.id && other.familyKey === student.familyKey)
        .map(other => other.id)
    );
  }, [student, allStudents]);

  if (student && initializedFor !== student.id) {
    setInitializedFor(student.id);
    setSelected(currentSiblingIds);
    setSearch("");
  }

  const setFamily = trpc.academy.students.setFamily.useMutation({
    onSuccess: () => {
      void utils.academy.students.invalidate();
      toast.success("형제·자매 그룹을 저장했습니다.");
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const removeFromFamily = trpc.academy.students.removeFromFamily.useMutation({
    onSuccess: () => {
      void utils.academy.students.invalidate();
      toast.success("형제·자매 그룹에서 제외했습니다.");
      onClose();
    },
    onError: error => toast.error(error.message),
  });

  if (!student) return null;
  const candidates = allStudents
    .filter(other => other.id !== student.id)
    .filter(other => (search.trim() ? other.name.includes(search.trim()) : true));
  const isPending = setFamily.isPending || removeFromFamily.isPending;
  const toggle = (id: number) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const save = () => {
    if (selected.size === 0) {
      if (student.familyKey) removeFromFamily.mutate({ id: student.id });
      else onClose();
      return;
    }
    setFamily.mutate({ id: student.id, siblingIds: Array.from(selected) });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="journal-dialog sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-[#193D3C]">
            {student.name} 학생의 형제·자매 연결
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#657570]">
            함께 묶을 형제·자매 학생을 선택해 주세요. 그룹으로 묶인 학생은
            보호자가 한 기기에 앱을 설치해도 서로의 수업일지와 알림을 함께
            받아볼 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="학생 이름으로 검색"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="mt-1"
        />
        <div className="mt-2 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
          {candidates.length === 0 && (
            <p className="py-6 text-center text-sm text-[#9A958A]">
              연결할 수 있는 다른 학생이 없습니다.
            </p>
          )}
          {candidates.map(other => (
            <label
              key={other.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#E7E1D5] bg-[#FCFBF7] px-3 py-2 hover:border-[#CBB98A]"
            >
              <Checkbox
                checked={selected.has(other.id)}
                onCheckedChange={() => toggle(other.id)}
              />
              <span className="flex-1 text-sm text-[#294B48]">
                {other.name}
                <span className="ml-1.5 text-xs text-[#9A958A]">{other.grade}</span>
              </span>
              {other.familyKey && other.familyKey !== student.familyKey && (
                <Badge
                  variant="outline"
                  className="border-[#E4D3A3] bg-[#FFFBEA] text-[10px] text-[#816319]"
                >
                  다른 그룹 소속
                </Badge>
              )}
            </label>
          ))}
        </div>
        {candidates.some(
          other =>
            selected.has(other.id) &&
            other.familyKey &&
            other.familyKey !== student.familyKey
        ) && (
          <p className="text-xs leading-5 text-[#A05242]">
            선택한 학생 중 이미 다른 형제·자매 그룹에 속한 학생이 있습니다.
            저장하면 두 그룹이 하나로 합쳐집니다.
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-[#765E10]" onClick={onClose}>
            취소
          </Button>
          <Button className="journal-primary-button" disabled={isPending} onClick={save}>
            {selected.size === 0 ? "그룹에서 제외" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
