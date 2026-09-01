import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Archive, BookMarked, CalendarDays, Pencil, Plus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RestrictedPage } from "./Students";

type ClassGroup = { id: number; name: string; subject: string; description: string | null; meetingDays: string; accentColor: string };
type GroupDraft = { subject: string; description: string; meetingDays: number[]; accentColor: string };
const weekdays = [{ value: 1, label: "월" }, { value: 2, label: "화" }, { value: 3, label: "수" }, { value: 4, label: "목" }, { value: 5, label: "금" }, { value: 6, label: "토" }, { value: 0, label: "일" }];
const emptyDraft: GroupDraft = { subject: "", description: "", meetingDays: [1, 2, 3, 4, 5], accentColor: "#234E52" };
const parseDays = (value: string) => value.split(",").map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b);
const formatDays = (value: string) => parseDays(value).map(day => weekdays.find(item => item.value === day)?.label).filter(Boolean).join("·");

export default function Classes() {
  const { user } = useAuth();
  const groups = trpc.academy.classGroups.list.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<ClassGroup | null | undefined>(undefined);
  const create = trpc.academy.classGroups.create.useMutation({ onSuccess: () => { void utils.academy.classGroups.invalidate(); toast.success("과목을 등록했습니다."); setSelected(undefined); }, onError: error => toast.error(error.message) });
  const update = trpc.academy.classGroups.update.useMutation({ onSuccess: () => { void utils.academy.classGroups.invalidate(); toast.success("과목 정보를 수정했습니다."); setSelected(undefined); }, onError: error => toast.error(error.message) });
  const archive = trpc.academy.classGroups.archive.useMutation({ onSuccess: () => { void utils.academy.classGroups.invalidate(); toast.success("과목을 비활성 처리했습니다."); }, onError: error => toast.error(error.message) });
  if (user?.role !== "admin") return <RestrictedPage title="반 관리" />;

  return <div className="journal-page-shell">
    <section className="journal-page-heading"><div><p className="eyebrow">SUBJECT DIRECTORY</p><h1>반 관리</h1><p>과목과 정기 수업 요일을 등록해 학생 수강과 일반 수업 일정 정보로 사용합니다.</p></div><Button className="journal-primary-button" onClick={() => setSelected(null)}><Plus className="mr-1.5 h-4 w-4" />과목 등록</Button></section>
    <section className="journal-class-grid mt-7">{groups.isLoading ? Array.from({ length: 4 }).map((_, index) => <Card key={index} className="h-48 animate-pulse bg-[#FCFBF7]" />) : groups.data?.length ? groups.data.map(group => <Card key={group.id} className="journal-class-card"><CardContent className="p-5"><div className="flex items-start justify-between"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.accentColor }} /><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setSelected(group)} aria-label="과목 수정"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`${group.subject} 과목을 비활성 처리할까요? 연결된 수강 과목은 해제됩니다.`)) archive.mutate({ id: group.id }); }} aria-label="과목 비활성 처리" className="text-[#A05242] hover:text-[#A05242]"><Archive className="h-4 w-4" /></Button></div></div><h2 className="mt-7 font-serif text-[25px] text-[#193D3C]">{group.subject}</h2><p className="mt-3 min-h-10 text-sm leading-6 text-[#71817D]">{group.description || "등록된 과목 설명이 없습니다."}</p><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E8E3D8] pt-4"><Badge className="bg-[#E8EFED] text-[#315B57] hover:bg-[#E8EFED]"><BookMarked className="mr-1 h-3 w-3" />수업일지 연결</Badge><Badge variant="outline" className="border-[#E1D7C5] text-[#667B76]"><CalendarDays className="mr-1 h-3 w-3" />{formatDays(group.meetingDays)} 수업</Badge></div></CardContent></Card>) : <Card className="journal-surface col-span-full"><CardContent className="journal-empty-state"><UsersRound className="h-7 w-7" /><h3>등록된 과목이 없습니다.</h3><p>과목을 등록한 뒤 학생을 연결하면 바로 일지를 작성할 수 있습니다.</p></CardContent></Card>}</section>
    <ClassDialog open={selected !== undefined} group={selected ?? null} onClose={() => setSelected(undefined)} pending={create.isPending || update.isPending} onSave={values => selected ? update.mutate({ id: selected.id, values }) : create.mutate(values)} />
  </div>;
}

function ClassDialog({ open, group, onClose, pending, onSave }: { open: boolean; group: ClassGroup | null; onClose: () => void; pending: boolean; onSave: (values: GroupDraft) => void }) {
  const [draft, setDraft] = useState<GroupDraft>(emptyDraft);
  useEffect(() => setDraft(group ? { subject: group.subject, description: group.description ?? "", meetingDays: parseDays(group.meetingDays), accentColor: group.accentColor } : emptyDraft), [group, open]);
  const toggleDay = (day: number) => setDraft(current => ({ ...current, meetingDays: current.meetingDays.includes(day) ? current.meetingDays.filter(value => value !== day) : [...current.meetingDays, day].sort((a, b) => a - b) }));
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="journal-dialog"><DialogHeader><p className="eyebrow">{group ? "EDIT SUBJECT" : "NEW SUBJECT"}</p><DialogTitle>{group ? "과목 정보 수정" : "과목 등록"}</DialogTitle><DialogDescription>정기 수업 요일은 과목의 일반 수업 일정 정보입니다. 결석·미등록 수업일지는 월~금 평일 기준으로 자동 이동합니다.</DialogDescription></DialogHeader><div className="grid gap-5 py-3"><Field label="과목" required><Input value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} placeholder="예: 수학" /></Field><div className="grid gap-2"><Label>정기 수업 요일 <b className="text-[#B8891B]">필수</b></Label><div className="flex flex-wrap gap-2">{weekdays.map(day => <Button key={day.value} type="button" size="sm" variant={draft.meetingDays.includes(day.value) ? "default" : "outline"} className={draft.meetingDays.includes(day.value) ? "bg-[#315B57] hover:bg-[#315B57]" : ""} onClick={() => toggleDay(day.value)}>{day.label}</Button>)}</div><p className="text-xs leading-5 text-[#71817D]">수업일지 자동 이관·당김은 정기 요일과 무관하게 월~금 평일을 기준으로 처리합니다.</p></div><Field label="과목 설명"><Textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="학년, 교재, 수업 시간 등을 간단히 기록해 주세요." /></Field><div className="grid gap-2"><Label>식별 색상</Label><div className="flex items-center gap-3"><input className="h-10 w-14 cursor-pointer rounded-lg border border-[#DCD6CA] bg-white p-1" type="color" value={draft.accentColor} onChange={event => setDraft({ ...draft, accentColor: event.target.value })} /><Input value={draft.accentColor} onChange={event => setDraft({ ...draft, accentColor: event.target.value })} className="max-w-36" /></div></div></div><DialogFooter><Button variant="outline" onClick={onClose}>취소</Button><Button className="journal-primary-button" disabled={pending || !draft.subject.trim() || !draft.meetingDays.length} onClick={() => onSave({ ...draft, subject: draft.subject.trim() })}>저장하기</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label} {required && <b className="text-[#B8891B]">필수</b>}</Label>{children}</div>; }
