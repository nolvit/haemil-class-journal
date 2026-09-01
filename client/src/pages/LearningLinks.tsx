import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { countSavedLearningLinks, getOpenableLearningLink } from "@shared/learningLinksRules";
import { BookMarked, Calculator, ExternalLink, Mic2, Save, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type StudentLink = { id: number; name: string; grade: string; vocabularyResultUrl: string | null; englishSpeakingUrl: string | null; mathUnitEvaluationUrl: string | null };

export default function LearningLinks() {
  const { user } = useAuth();
  const students = trpc.academy.students.list.useQuery({ active: true });
  if (user?.role !== "admin") return <AccessDenied />;
  return <div className="journal-page-shell"><section className="journal-page-heading"><div><p className="eyebrow">STUDENT LEARNING LINKS</p><h1>학습 링크</h1><p>학생별 단어 암기 결과와 영어 말하기 링크를 붙여넣고 Enter로 저장합니다.</p></div></section><section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{students.isLoading ? Array.from({ length: 6 }).map((_, index) => <Card className="h-52 animate-pulse bg-[#FCFBF7]" key={index} />) : (students.data as StudentLink[] | undefined)?.map(student => <StudentLinkCard key={student.id} student={student} />)}</section></div>;
}

function StudentLinkCard({ student }: { student: StudentLink }) {
  const utils = trpc.useUtils();
  const [vocabularyResultUrl, setVocabularyResultUrl] = useState(student.vocabularyResultUrl ?? "");
  const [englishSpeakingUrl, setEnglishSpeakingUrl] = useState(student.englishSpeakingUrl ?? "");
  const [mathUnitEvaluationUrl, setMathUnitEvaluationUrl] = useState(student.mathUnitEvaluationUrl ?? "");
  useEffect(() => { setVocabularyResultUrl(student.vocabularyResultUrl ?? ""); setEnglishSpeakingUrl(student.englishSpeakingUrl ?? ""); setMathUnitEvaluationUrl(student.mathUnitEvaluationUrl ?? ""); }, [student]);
  const save = trpc.academy.students.updateLearningLinks.useMutation({ onSuccess: () => { void utils.academy.students.invalidate(); toast.success(`${student.name} 학생의 학습 링크를 저장했습니다.`); }, onError: error => toast.error(error.message) });
  const submit = () => save.mutate({ id: student.id, vocabularyResultUrl: vocabularyResultUrl.trim(), englishSpeakingUrl: englishSpeakingUrl.trim(), mathUnitEvaluationUrl: mathUnitEvaluationUrl.trim() });
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); submit(); } };
  const savedLinkCount = countSavedLearningLinks({ vocabularyResultUrl, englishSpeakingUrl, mathUnitEvaluationUrl });
  return <Card className="journal-surface"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{student.grade}</p><h2 className="mt-1 font-serif text-2xl text-[#193D3C]">{student.name}</h2></div><Badge className={savedLinkCount ? "bg-[#E5F0E9] text-[#2F7154] hover:bg-[#E5F0E9]" : "bg-[#F5F1E8] text-[#776A5A] hover:bg-[#F5F1E8]"}>{savedLinkCount}개 저장</Badge></div><div className="mt-5 grid gap-3"><LinkField icon={<BookMarked className="h-4 w-4" />} label="단어 암기 결과" value={vocabularyResultUrl} onChange={setVocabularyResultUrl} onEnter={onEnter} /><LinkField icon={<Mic2 className="h-4 w-4" />} label="영어 말하기" value={englishSpeakingUrl} onChange={setEnglishSpeakingUrl} onEnter={onEnter} /><LinkField icon={<Calculator className="h-4 w-4" />} label="수학 단원 평가" value={mathUnitEvaluationUrl} onChange={setMathUnitEvaluationUrl} onEnter={onEnter} /></div><div className="mt-4 flex items-center justify-between"><p className="text-[11px] text-[#71817D]">붙여넣고 Enter를 누르면 저장됩니다.</p><Button variant="ghost" size="sm" onClick={submit} disabled={save.isPending}><Save className="mr-1 h-3.5 w-3.5" />저장</Button></div></CardContent></Card>;
}

function LinkField({ icon, label, value, onChange, onEnter }: { icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; onEnter: (event: React.KeyboardEvent<HTMLInputElement>) => void }) {
  const openableUrl = getOpenableLearningLink(value);
  const openLink = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!openableUrl) {
      toast.error("열 수 있는 웹 주소를 입력해 주세요.");
      return;
    }
    window.open(openableUrl, "_blank", "noopener,noreferrer");
  };
  return <label className="grid gap-1.5"><span className="flex items-center gap-1.5 text-xs font-semibold text-[#46625E]">{icon}{label}</span><div className="relative"><Input value={value} onChange={event => onChange(event.target.value)} onKeyDown={onEnter} placeholder="https:// 링크를 붙여넣으세요" className="pr-10 text-xs" /><button type="button" onClick={openLink} aria-label={`${label} 링크 열기`} className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-[#71817D] transition-colors hover:bg-[#EEF3EF] hover:text-[#193D3C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6F9B8B] disabled:cursor-not-allowed disabled:opacity-40" disabled={!value.trim()}><ExternalLink className="h-3.5 w-3.5" /></button></div></label>;
}
function AccessDenied() { return <div className="journal-page-shell"><Card className="journal-surface mt-8"><CardContent className="journal-empty-state"><ShieldAlert className="h-8 w-8" /><h3>관리자 권한이 필요한 메뉴입니다.</h3><p>학습 링크는 관리자만 관리할 수 있습니다.</p></CardContent></Card></div>; }
