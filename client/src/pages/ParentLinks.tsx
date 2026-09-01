import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Copy, ExternalLink, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { RestrictedPage } from "./Students";

type Student = { id: number; name: string; grade: string; publicToken: string; portalEnabled: boolean; classGroups: Array<{ id: number; name: string }> };

export default function ParentLinks() {
  const { user } = useAuth();
  const students = trpc.academy.students.list.useQuery();
  const utils = trpc.useUtils();
  const rotate = trpc.academy.students.rotatePortalLink.useMutation({ onSuccess: () => { void utils.academy.students.invalidate(); toast.success("새 보호자 링크를 발급했습니다. 이전 링크는 더 이상 열리지 않습니다."); }, onError: error => toast.error(error.message) });
  if (user?.role !== "admin") return <RestrictedPage title="보호자 공유 링크" />;
  const copy = async (token: string) => { const link = `${window.location.origin}/p/${token}`; try { await navigator.clipboard.writeText(link); toast.success("보호자 공유 링크를 복사했습니다."); } catch { toast.message(link); } };
  return <div className="journal-page-shell"><section className="journal-page-heading"><div><p className="eyebrow">PARENT ACCESS</p><h1>보호자 공유 링크</h1><p>학생별 고정 링크를 복사하거나, 필요 시 이전 링크를 무효화하고 새 링크를 발급합니다.</p></div><Badge className="bg-[#E8EFED] px-3 py-2 text-[#315B57] hover:bg-[#E8EFED]"><ShieldCheck className="mr-1.5 h-4 w-4" />개별 링크 관리</Badge></section>
    <Card className="journal-surface mt-6 border-[#E2D4A6] bg-[#FFFBEF]"><CardContent className="flex gap-3 p-4 text-sm leading-6 text-[#6E5B2B]"><Link2 className="mt-0.5 h-5 w-5 shrink-0" /><p><b>공유 전 확인:</b> 공개 열람을 켠 학생만 링크를 사용할 수 있습니다. 링크를 재발급하면 기존 링크는 즉시 사용할 수 없으므로, 새 주소를 보호자에게 다시 안내해 주세요.</p></CardContent></Card>
    <section className="mt-5 grid gap-3">{students.isLoading ? Array.from({ length: 5 }).map((_, index) => <Card className="h-28 animate-pulse" key={index} />) : students.data?.map(student => <LinkCard key={student.id} student={student as Student} onCopy={() => copy(student.publicToken)} onRotate={() => { if (window.confirm(`${student.name} 학생의 기존 보호자 링크를 무효화하고 새 링크를 발급할까요?`)) rotate.mutate({ id: student.id }); }} rotating={rotate.isPending} />)}</section>
  </div>;
}

function LinkCard({ student, onCopy, onRotate, rotating }: { student: Student; onCopy: () => void; onRotate: () => void; rotating: boolean }) {
  const link = `${window.location.origin}/p/${student.publicToken}`;
  return <Card className={`journal-surface ${student.portalEnabled ? "" : "opacity-75"}`}><CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(170px,0.65fr)_minmax(0,1fr)_auto]"><div><h2 className="font-serif text-xl text-[#193D3C]">{student.name}</h2><p className="mt-1 text-xs text-[#71817D]">{student.grade} · {student.classGroups.map(group => group.name).join(" · ") || "수강 반 미지정"}</p><Badge className={`mt-2 ${student.portalEnabled ? "bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]" : "bg-[#F1EEE7] text-[#796554] hover:bg-[#F1EEE7]"}`}>{student.portalEnabled ? "공개 중" : "비공개"}</Badge></div><div className="flex min-w-0 items-center gap-2"><Input readOnly value={link} className="h-10 bg-[#FCFBF7] text-xs" /><Button variant="outline" size="icon" onClick={onCopy} aria-label="링크 복사"><Copy className="h-4 w-4" /></Button><a href={link} target="_blank" rel="noreferrer"><Button variant="outline" size="icon" aria-label="보호자 화면 열기"><ExternalLink className="h-4 w-4" /></Button></a></div><Button variant="outline" disabled={rotating} onClick={onRotate} className="h-10 border-[#D9C792] text-[#765E10] hover:bg-[#FFF7D9]"><RefreshCw className="mr-1.5 h-4 w-4" />링크 재발급</Button></CardContent></Card>;
}
