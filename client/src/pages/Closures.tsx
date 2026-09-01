import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { appendClosureNoticeTemplate, getClosureNoticeTemplates, type NoticeTemplateKind } from "@shared/closureNoticeTemplates";
import { CalendarDays, ImagePlus, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

type ClosurePeriod = {
  id: number;
  startDate: string;
  endDate: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
type ClosureDraft = Pick<ClosurePeriod, "startDate" | "endDate" | "name"> & { description: string; imageKey: string | null; imageUrl: string | null };
type LegalHolidayNotice = ClosurePeriod;
type LegalHolidayNoticeDraft = ClosureDraft;
type AvailableLegalHoliday = { id: string; name: string; startDate: string; endDate: string; dates: string[]; weekdayDates: string[] };
type PendingImage = { file: File; width: number; height: number };

const todayInKorea = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const currentYearInKorea = () => Number(todayInKorea().slice(0, 4));
const emptyDraft = (): ClosureDraft => ({ startDate: todayInKorea(), endDate: todayInKorea(), name: "", description: "", imageKey: null, imageUrl: null });
const periodLabel = (startDate: string, endDate: string) => startDate === endDate ? startDate.replaceAll("-", ".") : `${startDate.replaceAll("-", ".")} ~ ${endDate.replaceAll("-", ".")}`;

function readImageAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) reject(new Error("이미지 파일 형식이 올바르지 않습니다."));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function imageRatioLabel(width: number, height: number) {
  return `${width.toLocaleString()} × ${height.toLocaleString()}px · ${(width / height).toFixed(2)}:1`;
}

function isRecommendedImageRatio(width: number, height: number) {
  const ratio = width / height;
  return Math.min(Math.abs(ratio - 2), Math.abs(ratio - 16 / 9)) <= 0.16;
}

export default function Closures() {
  const utils = trpc.useUtils();
  const periods = trpc.academy.closures.list.useQuery();
  const legalNotices = trpc.academy.legalHolidayNotices.list.useQuery();
  const [legalYear, setLegalYear] = useState(currentYearInKorea);
  const legalSchedules = trpc.academy.legalHolidayNotices.availableSchedules.useQuery({ year: legalYear });
  const [selected, setSelected] = useState<ClosurePeriod | null | undefined>(undefined);
  const [selectedLegalNotice, setSelectedLegalNotice] = useState<LegalHolidayNotice | null | undefined>(undefined);
  const refresh = () => {
    void utils.academy.closures.invalidate();
    void utils.academy.legalHolidayNotices.invalidate();
    void utils.academy.weeklyWorkspace.invalidate();
    void utils.academy.workspace.invalidate();
    void utils.academy.dashboard.invalidate();
    void utils.academy.publicStudent.invalidate();
  };
  const create = trpc.academy.closures.create.useMutation({ onSuccess: () => { refresh(); toast.success("휴강 기간을 등록했습니다."); setSelected(undefined); }, onError: error => toast.error(error.message) });
  const update = trpc.academy.closures.update.useMutation({ onSuccess: () => { refresh(); toast.success("휴강 기간을 수정했습니다."); setSelected(undefined); }, onError: error => toast.error(error.message) });
  const remove = trpc.academy.closures.delete.useMutation({ onSuccess: () => { refresh(); toast.success("휴강 기간을 삭제했습니다."); }, onError: error => toast.error(error.message) });
  const createLegalNotice = trpc.academy.legalHolidayNotices.create.useMutation({ onSuccess: () => { refresh(); toast.success("법정공휴일 안내를 등록했습니다."); setSelectedLegalNotice(undefined); }, onError: error => toast.error(error.message) });
  const updateLegalNotice = trpc.academy.legalHolidayNotices.update.useMutation({ onSuccess: () => { refresh(); toast.success("법정공휴일 안내를 수정했습니다."); setSelectedLegalNotice(undefined); }, onError: error => toast.error(error.message) });
  const removeLegalNotice = trpc.academy.legalHolidayNotices.delete.useMutation({ onSuccess: () => { refresh(); toast.success("법정공휴일 안내를 삭제했습니다."); }, onError: error => toast.error(error.message) });
  const rows = useMemo(() => (periods.data ?? []) as ClosurePeriod[], [periods.data]);
  const noticeRows = useMemo(() => (legalNotices.data ?? []) as LegalHolidayNotice[], [legalNotices.data]);
  const scheduleRows = useMemo(() => (legalSchedules.data ?? []) as AvailableLegalHoliday[], [legalSchedules.data]);

  return <div className="journal-page-shell">
    <section className="journal-page-heading">
      <div><p className="eyebrow">ACADEMY CLOSURES</p><h1>휴강 관리</h1><p>학원 휴강과 법정공휴일 안내 이미지·문구를 관리하고, 보호자 화면에 표시할 수 있습니다.</p></div>
      <Button className="journal-primary-button" onClick={() => setSelected(null)}><Plus className="mr-1.5 h-4 w-4" />학원 휴강 등록</Button>
    </section>
    <section className="journal-guidance mt-4"><CalendarDays className="h-4 w-4" /><span><b>법정공휴일은 평일에 자동 반영됩니다.</b> 토·일 법정공휴일은 자동 적용하지 않습니다. 아래 법정공휴일 안내에서는 자동 일정에 이미지와 문구만 연결하며 출석·수업 횟수에는 영향을 주지 않습니다.</span></section>

    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">LEGAL HOLIDAY NOTICE</p><h2 className="font-serif text-2xl text-[#193D3C]">법정공휴일 안내 이미지</h2><p className="mt-1 text-sm text-[#71817D]">해당 연도의 자동 법정공휴일을 선택해 보호자용 이미지와 안내 문구를 연결합니다.</p></div><Button variant="outline" onClick={() => setSelectedLegalNotice(null)}><Plus className="mr-1.5 h-4 w-4" />법정공휴일 안내 등록</Button></div>
      <div className="grid gap-4 xl:grid-cols-2">{legalNotices.isLoading ? Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-56" />) : noticeRows.length ? noticeRows.map(notice => <LegalHolidayNoticeCard key={notice.id} notice={notice} onEdit={() => setSelectedLegalNotice(notice)} onDelete={() => { if (window.confirm(`‘${notice.name}’ 법정공휴일 안내를 삭제할까요? 보호자 화면의 이미지와 안내 문구가 사라집니다.`)) removeLegalNotice.mutate({ id: notice.id }); }} deleting={removeLegalNotice.isPending} />) : <EmptyNoticeCard />}</div>
    </section>

    <section className="mt-10"><div className="mb-4"><p className="eyebrow">ACADEMY CLOSURES</p><h2 className="font-serif text-2xl text-[#193D3C]">학원 휴강</h2><p className="mt-1 text-sm text-[#71817D]">정기 휴강, 방학, 특별 휴강을 등록하면 출석·수업일지·주간 출석 목표에서 제외됩니다.</p></div><div className="grid gap-4 xl:grid-cols-2">{periods.isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56" />) : rows.length ? rows.map(period => <ClosureCard key={period.id} period={period} onEdit={() => setSelected(period)} onDelete={() => { if (window.confirm(`‘${period.name}’ 휴강 기간을 삭제할까요? 보호자 화면에서 즉시 사라지며, 이 작업은 되돌릴 수 없습니다.`)) remove.mutate({ id: period.id }); }} deleting={remove.isPending} />) : <EmptyClosureCard />}</div></section>

    <ClosureDialog target={selected} pending={create.isPending || update.isPending} onClose={() => setSelected(undefined)} onSave={values => selected ? update.mutate({ id: selected.id, values }) : create.mutate(values)} />
    <LegalHolidayNoticeDialog target={selectedLegalNotice} pending={createLegalNotice.isPending || updateLegalNotice.isPending} year={legalYear} schedules={scheduleRows} schedulesLoading={legalSchedules.isLoading} existingNotices={noticeRows} onYearChange={setLegalYear} onClose={() => setSelectedLegalNotice(undefined)} onCreate={(values, schedule) => createLegalNotice.mutate({ values, schedule: { year: legalYear, id: schedule.id } })} onUpdate={values => selectedLegalNotice && updateLegalNotice.mutate({ id: selectedLegalNotice.id, values })} />
  </div>;
}

function EmptyNoticeCard() { return <Card className="journal-surface xl:col-span-2"><CardContent className="journal-empty-state"><ImagePlus className="h-8 w-8" /><h3>등록된 법정공휴일 안내가 없습니다.</h3><p>해당 연도의 자동 법정공휴일을 선택해 이미지를 넣고 싶은 기간만 등록해 주세요.</p></CardContent></Card>; }
function EmptyClosureCard() { return <Card className="journal-surface xl:col-span-2"><CardContent className="journal-empty-state"><CalendarDays className="h-8 w-8" /><h3>등록된 학원 휴강 기간이 없습니다.</h3><p>정기 휴강, 방학, 특별 휴강을 등록하면 출석과 수업일지에서 자동으로 제외됩니다.</p></CardContent></Card>; }

function ClosureCard({ period, onEdit, onDelete, deleting }: { period: ClosurePeriod; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <Card className="journal-surface overflow-hidden"><CardContent className="p-0"><div className="grid min-h-[194px] md:grid-cols-[minmax(0,1fr)_190px]"><div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge className="bg-[#F1E7D4] text-[#7C5A2A] hover:bg-[#F1E7D4]">학원 휴강</Badge><h2 className="mt-3 font-serif text-2xl text-[#193D3C]">{period.name}</h2><p className="mt-1.5 text-sm font-medium text-[#55716C]">{periodLabel(period.startDate, period.endDate)}</p></div><Actions onEdit={onEdit} onDelete={onDelete} deleting={deleting} editLabel="휴강 수정" deleteLabel="휴강 삭제" /></div><p className="mt-4 whitespace-pre-line text-sm leading-6 text-[#62736E]">{period.description || "수업과 수업일지 작성이 없는 휴강 기간입니다."}</p></div><CardImage imageUrl={period.imageUrl} alt={`${period.name} 안내 이미지`} kind="closure" /></div></CardContent></Card>;
}

function LegalHolidayNoticeCard({ notice, onEdit, onDelete, deleting }: { notice: LegalHolidayNotice; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <Card className="journal-surface overflow-hidden"><CardContent className="p-0"><div className="grid min-h-[194px] md:grid-cols-[minmax(0,1fr)_190px]"><div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge className="bg-[#E8EFED] text-[#315B57] hover:bg-[#E8EFED]">법정공휴일</Badge><h2 className="mt-3 font-serif text-2xl text-[#193D3C]">{notice.name}</h2><p className="mt-1.5 text-sm font-medium text-[#55716C]">{periodLabel(notice.startDate, notice.endDate)}</p></div><Actions onEdit={onEdit} onDelete={onDelete} deleting={deleting} editLabel="법정공휴일 안내 수정" deleteLabel="법정공휴일 안내 삭제" /></div><p className="mt-4 whitespace-pre-line text-sm leading-6 text-[#62736E]">{notice.description || "법정공휴일 자동 적용일에 보호자용 안내로 표시됩니다."}</p></div><CardImage imageUrl={notice.imageUrl} alt={`${notice.name} 안내 이미지`} kind="legal" /></div></CardContent></Card>;
}

function Actions({ onEdit, onDelete, deleting, editLabel, deleteLabel }: { onEdit: () => void; onDelete: () => void; deleting: boolean; editLabel: string; deleteLabel: string }) { return <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={editLabel} onClick={onEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={deleteLabel} disabled={deleting} onClick={onDelete} className="text-[#A05242] hover:text-[#A05242]"><Trash2 className="h-4 w-4" /></Button></div>; }
function CardImage({ imageUrl, alt, kind }: { imageUrl: string | null; alt: string; kind: "closure" | "legal" }) { return imageUrl ? <img src={imageUrl} alt={alt} className="h-full min-h-[150px] w-full object-contain bg-[#E8EFED]" /> : <div className="closure-preview-fallback">{kind === "legal" ? <ImagePlus className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}<span>이미지 없음</span><small>보호자 화면에는 안내 패널로 표시됩니다.</small></div>; }

function ClosureDialog({ target, pending, onClose, onSave }: { target: ClosurePeriod | null | undefined; pending: boolean; onClose: () => void; onSave: (values: ClosureDraft) => void }) {
  const [draft, setDraft] = useState<ClosureDraft>(emptyDraft);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const upload = trpc.academy.closures.uploadImage.useMutation({ onError: error => toast.error(error.message) });
  useEffect(() => { setDraft(target ? { startDate: target.startDate, endDate: target.endDate, name: target.name, description: target.description ?? "", imageKey: target.imageKey, imageUrl: target.imageUrl } : emptyDraft()); setPendingImage(null); }, [target]);
  const save = async () => {
    try {
      let values = { ...draft, name: draft.name.trim(), description: draft.description.trim() };
      if (pendingImage) {
        const image = await upload.mutateAsync({ fileName: pendingImage.file.name, mimeType: pendingImage.file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await readImageAsBase64(pendingImage.file) });
        values = { ...values, imageKey: image.key, imageUrl: image.url };
      }
      onSave(values);
    } catch (error) { toast.error(error instanceof Error ? error.message : "이미지를 준비하지 못했습니다."); }
  };
  const valid = Boolean(draft.name.trim() && draft.startDate && draft.endDate && draft.startDate <= draft.endDate);
  return <Dialog open={target !== undefined} onOpenChange={open => { if (!open && !upload.isPending) onClose(); }}><DialogContent className="journal-dialog max-h-[90vh] overflow-y-auto sm:max-w-[620px]"><DialogHeader><p className="eyebrow">{target ? "EDIT CLOSURE" : "NEW CLOSURE"}</p><DialogTitle>{target ? "휴강 기간 수정" : "휴강 기간 등록"}</DialogTitle><DialogDescription>법정공휴일 외 학원 자체 휴강을 등록합니다. 이미지는 선택 사항이며, 저장할 때만 업로드됩니다.</DialogDescription></DialogHeader><div className="grid gap-5 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="시작일" required><Input type="date" value={draft.startDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} /></Field><Field label="종료일" required><Input type="date" min={draft.startDate} value={draft.endDate} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))} /></Field></div><Field label="휴강명" required><Input autoFocus value={draft.name} maxLength={120} placeholder="예: 여름방학 휴강" onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></Field><TemplateChips kind="closure" name={draft.name} period={periodLabel(draft.startDate, draft.endDate)} onApply={template => setDraft(current => ({ ...current, description: appendClosureNoticeTemplate(current.description, template, { name: current.name, period: periodLabel(current.startDate, current.endDate) }) }))} /><Field label="보호자 안내 문구"><Textarea value={draft.description} maxLength={4000} placeholder="예: 8월 첫째 주는 학원 방학입니다. 즐겁고 안전한 방학 보내세요." onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></Field><NoticeImagePicker key={target ? `closure-${target.id}` : "new-closure"} storedImageUrl={draft.imageUrl} pendingImage={pendingImage} onPendingImageChange={setPendingImage} onRemoveStored={() => setDraft(current => ({ ...current, imageKey: null, imageUrl: null }))} disabled={upload.isPending} /></div><DialogFooter><Button variant="outline" disabled={pending || upload.isPending} onClick={onClose}>취소</Button><Button className="journal-primary-button" disabled={pending || upload.isPending || !valid} onClick={() => { void save(); }}>{upload.isPending ? "이미지 업로드 중" : target ? "수정 저장" : "휴강 등록"}</Button></DialogFooter></DialogContent></Dialog>;
}

function LegalHolidayNoticeDialog({ target, pending, year, schedules, schedulesLoading, existingNotices, onYearChange, onClose, onCreate, onUpdate }: { target: LegalHolidayNotice | null | undefined; pending: boolean; year: number; schedules: AvailableLegalHoliday[]; schedulesLoading: boolean; existingNotices: LegalHolidayNotice[]; onYearChange: (year: number) => void; onClose: () => void; onCreate: (values: LegalHolidayNoticeDraft, schedule: AvailableLegalHoliday) => void; onUpdate: (values: LegalHolidayNoticeDraft) => void }) {
  const [draft, setDraft] = useState<LegalHolidayNoticeDraft>(emptyDraft);
  const [scheduleId, setScheduleId] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const upload = trpc.academy.legalHolidayNotices.uploadImage.useMutation({ onError: error => toast.error(error.message) });
  const isNew = target === null;
  const selectedSchedule = schedules.find(schedule => schedule.id === scheduleId) ?? null;
  useEffect(() => { setDraft(target ? { startDate: target.startDate, endDate: target.endDate, name: target.name, description: target.description ?? "", imageKey: target.imageKey, imageUrl: target.imageUrl } : emptyDraft()); setScheduleId(""); setPendingImage(null); }, [target]);
  const chooseSchedule = (id: string) => { setScheduleId(id); const schedule = schedules.find(item => item.id === id); if (schedule) setDraft(current => ({ ...current, name: schedule.name, startDate: schedule.startDate, endDate: schedule.endDate })); };
  const save = async () => {
    try {
      let values = { ...draft, name: draft.name.trim(), description: draft.description.trim() };
      if (pendingImage) {
        const image = await upload.mutateAsync({ fileName: pendingImage.file.name, mimeType: pendingImage.file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await readImageAsBase64(pendingImage.file) });
        values = { ...values, imageKey: image.key, imageUrl: image.url };
      }
      if (isNew && selectedSchedule) onCreate(values, selectedSchedule); else if (target) onUpdate(values);
    } catch (error) { toast.error(error instanceof Error ? error.message : "이미지를 준비하지 못했습니다."); }
  };
  const duplicate = Boolean(selectedSchedule && existingNotices.some(notice => notice.startDate === selectedSchedule.startDate && notice.endDate === selectedSchedule.endDate));
  const valid = isNew ? Boolean(selectedSchedule && !duplicate) : Boolean(target && draft.name.trim() && draft.startDate <= draft.endDate);
  return <Dialog open={target !== undefined} onOpenChange={open => { if (!open && !upload.isPending) onClose(); }}><DialogContent className="journal-dialog max-h-[90vh] overflow-y-auto sm:max-w-[620px]"><DialogHeader><p className="eyebrow">LEGAL HOLIDAY NOTICE</p><DialogTitle>{isNew ? "법정공휴일 안내 등록" : "법정공휴일 안내 수정"}</DialogTitle><DialogDescription>{isNew ? "해당 연도의 자동 법정공휴일을 선택하면 이름과 기간이 자동 입력됩니다." : "기존 안내의 문구와 이미지를 수정할 수 있습니다."}</DialogDescription></DialogHeader><div className="grid gap-5 py-2">{isNew ? <><Field label="연도"><select className="journal-select h-10 w-full" value={year} onChange={event => onYearChange(Number(event.target.value))}>{[year - 1, year, year + 1].map(option => <option key={option} value={option}>{option}년</option>)}</select></Field><Field label="자동 법정공휴일" required><select className="journal-select h-10 w-full" value={scheduleId} disabled={schedulesLoading} onChange={event => chooseSchedule(event.target.value)}><option value="">{schedulesLoading ? "자동 일정을 불러오는 중입니다" : "법정공휴일을 선택해 주세요"}</option>{schedules.map(schedule => <option key={schedule.id} value={schedule.id} disabled={existingNotices.some(notice => notice.startDate === schedule.startDate && notice.endDate === schedule.endDate)}>{schedule.name} · {periodLabel(schedule.startDate, schedule.endDate)}</option>)}</select>{legalScheduleHelp(selectedSchedule, duplicate, legalSchedulesErrorText(schedulesLoading, schedules))}</Field></> : <div className="grid gap-4 sm:grid-cols-2"><Field label="법정공휴일명"><Input disabled value={draft.name} /></Field><Field label="기간"><Input disabled value={periodLabel(draft.startDate, draft.endDate)} /></Field></div>}<TemplateChips kind="legal_holiday" name={draft.name} period={periodLabel(draft.startDate, draft.endDate)} onApply={template => setDraft(current => ({ ...current, description: appendClosureNoticeTemplate(current.description, template, { name: current.name, period: periodLabel(current.startDate, current.endDate) }) }))} /><Field label="보호자 안내 문구"><Textarea value={draft.description} maxLength={4000} placeholder="예: 풍성한 한가위 보내세요." onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></Field><NoticeImagePicker key={target ? `legal-${target.id}` : "new-legal"} storedImageUrl={draft.imageUrl} pendingImage={pendingImage} onPendingImageChange={setPendingImage} onRemoveStored={() => setDraft(current => ({ ...current, imageKey: null, imageUrl: null }))} disabled={upload.isPending} /></div><DialogFooter><Button variant="outline" disabled={pending || upload.isPending} onClick={onClose}>취소</Button><Button className="journal-primary-button" disabled={pending || upload.isPending || !valid} onClick={() => { void save(); }}>{upload.isPending ? "이미지 업로드 중" : isNew ? "안내 등록" : "수정 저장"}</Button></DialogFooter></DialogContent></Dialog>;
}

function legalScheduleHelp(schedule: AvailableLegalHoliday | null, duplicate: boolean, noSchedules: boolean) {
  if (noSchedules) return <small className="text-xs text-[#A05242]">자동 일정을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</small>;
  if (!schedule) return <small className="text-xs text-[#71817D]">선택한 일정의 이름과 기간은 변경할 수 없습니다.</small>;
  if (duplicate) return <small className="text-xs text-[#A05242]">이 기간의 법정공휴일 안내가 이미 등록되어 있습니다.</small>;
  const weekendDates = schedule.dates.filter(date => !schedule.weekdayDates.includes(date));
  return <small className="text-xs text-[#55716C]">자동 적용: {schedule.weekdayDates.map(date => date.replaceAll("-", ".")).join(", ")}{weekendDates.length ? ` · 토·일 ${weekendDates.map(date => date.replaceAll("-", ".")).join(", ")}은 자동 적용 제외` : ""}</small>;
}
function legalSchedulesErrorText(loading: boolean, schedules: AvailableLegalHoliday[]) { return !loading && schedules.length === 0; }

function TemplateChips({ kind, name, period, onApply }: { kind: NoticeTemplateKind; name: string; period: string; onApply: (template: ReturnType<typeof getClosureNoticeTemplates>[number]) => void }) {
  return <div className="grid gap-2"><Label>안내 문구 템플릿</Label><div className="flex flex-wrap gap-2">{getClosureNoticeTemplates(kind).map(template => <Button type="button" key={template.id} variant="outline" size="sm" className="h-8 bg-[#FFFEFA] text-xs" onClick={() => onApply({ ...template, content: template.content.replaceAll("{period}", period).replaceAll("{name}", name || "해당 일정") })}>{template.label}</Button>)}</div><small className="text-xs text-[#71817D]">기존 문구는 지우지 않고 아래에 추가됩니다.</small></div>;
}

function NoticeImagePicker({ storedImageUrl, pendingImage, onPendingImageChange, onRemoveStored, disabled }: { storedImageUrl: string | null; pendingImage: PendingImage | null; onPendingImageChange: (image: PendingImage | null) => void; onRemoveStored: () => void; disabled: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const chooseImage = (file: File | undefined) => {
    if (!file) return;
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) { toast.error("JPG, PNG 또는 WebP 파일만 선택할 수 있습니다."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("이미지는 5MB 이하만 올릴 수 있습니다."); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { setPreviewUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; }); onPendingImageChange({ file, width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); toast.error("이미지 크기를 확인하지 못했습니다."); };
    image.src = url;
  };
  const remove = () => {
    if (pendingImage) { setPreviewUrl(previous => { if (previous) URL.revokeObjectURL(previous); return null; }); onPendingImageChange(null); return; }
    onRemoveStored();
  };
  const displayedUrl = previewUrl ?? storedImageUrl;
  return <Field label="안내 이미지 (선택)"><div className="rounded-xl border border-dashed border-[#D7CCB9] bg-[#FCFBF7] p-3">{displayedUrl ? <div className="space-y-3"><div className="relative h-48 overflow-hidden rounded-lg bg-[#183F3C]"><img src={displayedUrl} alt="업로드 예정 이미지 배경" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl" /><img src={displayedUrl} alt="업로드 예정 이미지 미리보기" className="relative z-10 h-full w-full object-contain" /><Button type="button" variant="secondary" size="sm" className="absolute right-2 top-2 z-20 bg-white/90" disabled={disabled} onClick={remove}><X className="mr-1 h-3.5 w-3.5" />{pendingImage ? "새 이미지 취소" : "이미지 제거"}</Button></div>{pendingImage ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#E8EFED] px-3 py-2 text-xs"><span className="font-semibold text-[#315B57]">{imageRatioLabel(pendingImage.width, pendingImage.height)}</span><span className={isRecommendedImageRatio(pendingImage.width, pendingImage.height) ? "font-medium text-[#2F7154]" : "text-[#62736E]"}>{isRecommendedImageRatio(pendingImage.width, pendingImage.height) ? "권장 비율 · 가로형 안내 이미지" : "사용 가능 · 원본 전체가 표시됩니다"}</span></div> : <small className="block text-xs text-[#71817D]">저장된 이미지입니다. 새 이미지를 선택하면 저장할 때 교체됩니다.</small>}</div> : <label className="flex cursor-pointer flex-col items-center justify-center gap-2 py-6 text-center"><span className="rounded-full bg-[#E8EFED] p-3 text-[#315B57]"><ImagePlus className="h-5 w-5" /></span><b className="text-sm text-[#315B57]">JPG, PNG, WebP 이미지를 선택하세요</b><small className="text-xs text-[#71817D]">최대 5MB · 2:1 또는 16:9 가로형 권장 · 선택만으로는 업로드되지 않습니다.</small><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled} onChange={event => { chooseImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}</div></Field>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <div className="grid gap-2"><Label>{label} {required && <b className="text-[#B8891B]">필수</b>}</Label>{children}</div>; }
