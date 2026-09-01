import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Banknote, Save, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RestrictedPage } from "./Students";

type SchoolLevel = "elementary" | "middle" | "high";
type Standard = { id: number; schoolLevel: SchoolLevel; monthlySessionCount: number; subjectCountTier: 0 | 1 | 2; tuition: number };
const sessionCounts = [20, 16, 12] as const;
const columns: Array<{ schoolLevel: SchoolLevel; subjectCountTier: 0 | 1 | 2; label: string; helper: string }> = [
  { schoolLevel: "elementary", subjectCountTier: 0, label: "초등학생", helper: "5과목 패키지" },
  { schoolLevel: "middle", subjectCountTier: 1, label: "중학생", helper: "1과목" },
  { schoolLevel: "middle", subjectCountTier: 2, label: "중학생", helper: "2과목 이상" },
  { schoolLevel: "high", subjectCountTier: 1, label: "고등학생", helper: "1과목" },
  { schoolLevel: "high", subjectCountTier: 2, label: "고등학생", helper: "2과목 이상" },
];
const standardKey = (schoolLevel: SchoolLevel, monthlySessionCount: number, subjectCountTier: number) => `${schoolLevel}-${monthlySessionCount}-${subjectCountTier}`;
const formatWon = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

export default function TuitionStandards() {
  const { user } = useAuth();
  const standards = trpc.academy.tuitionStandards.list.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!standards.data) return;
    setDraft(Object.fromEntries((standards.data as Standard[]).map(item => [standardKey(item.schoolLevel, Number(item.monthlySessionCount), Number(item.subjectCountTier)), Number(item.tuition)])));
  }, [standards.data]);
  const expectedStandards = useMemo(() => sessionCounts.flatMap(monthlySessionCount => columns.map(column => ({
    schoolLevel: column.schoolLevel,
    monthlySessionCount,
    subjectCountTier: column.subjectCountTier,
    tuition: draft[standardKey(column.schoolLevel, monthlySessionCount, column.subjectCountTier)] ?? 0,
  }))), [draft]);
  const update = trpc.academy.tuitionStandards.update.useMutation({
    onSuccess: () => { void utils.academy.tuitionStandards.invalidate(); toast.success("원비 기준표를 저장했습니다. 기존 학생 원비는 변경되지 않습니다."); },
    onError: error => toast.error(error.message),
  });
  if (user?.role !== "admin") return <RestrictedPage title="원비 관리" />;
  const hasAllStandards = expectedStandards.every(item => Number.isFinite(item.tuition) && item.tuition >= 0);
  return <div className="journal-page-shell">
    <section className="journal-page-heading"><div><p className="eyebrow">TUITION MANAGEMENT</p><h1>원비 관리</h1><p>학년·수강 과목·월 수업 횟수에 따라 자동 제안할 원비를 관리합니다.</p></div><Button className="journal-primary-button" disabled={update.isPending || !hasAllStandards} onClick={() => update.mutate({ standards: expectedStandards })}><Save className="mr-1.5 h-4 w-4" />기준표 저장</Button></section>
    <Card className="journal-surface mt-6 border-[#E8DFC9] bg-[#FFFDF7]"><CardContent className="flex gap-3 p-5"><span className="rounded-xl bg-[#F5ECD0] p-2.5 text-[#846914]"><Settings2 className="h-5 w-5" /></span><div><b className="text-sm text-[#294A47]">기준표 변경은 새 자동 산정에만 적용됩니다.</b><p className="mt-1 text-sm leading-6 text-[#71817D]">이미 등록된 학생의 실제 월 원비는 유지됩니다. 인상·할인 등 개별 조건이 있는 학생은 학생 정보 수정에서 직접 원비를 조정하거나 자동 산정을 다시 적용하세요.</p></div></CardContent></Card>
    <Card className="journal-surface mt-5"><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-[820px] w-full border-collapse text-left"><thead><tr className="border-b border-[#E8E3D8] bg-[#FBF9F3]"><th className="px-5 py-4 text-xs font-semibold text-[#657570]">월 수업 횟수</th>{columns.map(column => <th className="px-4 py-4 text-center" key={`${column.schoolLevel}-${column.subjectCountTier}`}><p className="text-sm font-semibold text-[#294A47]">{column.label}</p><p className="mt-0.5 text-[11px] font-normal text-[#71817D]">{column.helper}</p></th>)}</tr></thead><tbody>{sessionCounts.map(monthlySessionCount => <tr className="border-b border-[#EEE9DF] last:border-b-0" key={monthlySessionCount}><th className="bg-[#FFFEFA] px-5 py-4"><p className="font-serif text-xl text-[#193D3C]">{monthlySessionCount}회</p><p className="mt-1 text-[11px] text-[#71817D]">주 {monthlySessionCount / 4}회 기준</p></th>{columns.map(column => { const key = standardKey(column.schoolLevel, monthlySessionCount, column.subjectCountTier); const amount = draft[key] ?? 0; return <td className="px-4 py-3" key={key}><label className="relative block"><Input aria-label={`${monthlySessionCount}회 ${column.label} ${column.helper} 원비`} type="number" min="0" step="1000" value={amount} onChange={event => setDraft(current => ({ ...current, [key]: Math.max(0, Number(event.target.value) || 0) }))} className="h-11 border-[#E2D9CA] bg-white pr-8 text-right font-semibold text-[#294A47]" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#71817D]">원</span></label><p className="mt-1.5 text-center text-[11px] text-[#8A6C10]">{formatWon(amount)}</p></td>; })}</tr>)}</tbody></table></div></CardContent></Card>
    <section className="mt-5 grid gap-3 md:grid-cols-2"><Card className="journal-surface"><CardContent className="flex items-start gap-3 p-5"><span className="rounded-xl bg-[#E8EFED] p-2.5 text-[#315B57]"><Banknote className="h-5 w-5" /></span><div><b className="text-sm text-[#294A47]">자동 산정 방식</b><p className="mt-1 text-sm leading-6 text-[#71817D]">주 3·4·5회는 각각 월 12·16·20회로 계산합니다. 중·고등부는 선택 과목 1개 또는 2개 이상으로 구분하고, 초등부는 5과목 패키지 기준을 적용합니다.</p></div></CardContent></Card><Card className="journal-surface"><CardContent className="p-5"><b className="text-sm text-[#294A47]">기준이 없는 경우</b><p className="mt-1 text-sm leading-6 text-[#71817D]">월 8회처럼 표에 없는 횟수나 수강 과목이 없는 학생은 자동 금액을 제안하지 않습니다. 학생 정보에서 개별 원비를 입력해 주세요.</p></CardContent></Card></section>
  </div>;
}
