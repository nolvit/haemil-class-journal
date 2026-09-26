import ParentAssignments from "@/components/ParentAssignments";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect } from "react";
import { useRoute } from "wouter";

export default function ParentAssignmentsPage() {
  const [, params] = useRoute("/p/:token/assignments");
  const token = params?.token ?? "";
  const studentId = Number(new URLSearchParams(window.location.search).get("studentId"));
  const validStudentId = Number.isSafeInteger(studentId) && studentId > 0;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "수학(과제) | 해밀학원";
    return () => { document.title = previousTitle; };
  }, []);
  const portalHref = `/p/${encodeURIComponent(token)}${validStudentId ? `?studentId=${studentId}` : ""}`;

  return (
    <div className="portal-shell">
      <main className="portal-container">
        <header className="portal-header">
          <div className="portal-brand">
            <span className="brand-seal">H</span>
            <div>
              <p className="font-serif text-xl text-[#173D3C]">haemil.</p>
              <p className="text-[9px] font-bold tracking-[0.18em] text-[#8B967C]">ACADEMY CLASS JOURNAL</p>
            </div>
          </div>
          <a className="text-sm font-medium text-[#315B57] underline-offset-4 hover:underline" href={portalHref}>
            수업일지로 돌아가기
          </a>
        </header>
        <h1 className="font-serif text-3xl font-semibold text-[#193D3C]">수학(과제)</h1>
        <p className="mt-2 text-sm text-[#71817D]">받은 인쇄 과제의 답을 입력하고 채점 결과를 확인하세요.</p>
        {validStudentId ? (
          <ParentAssignments token={token} studentId={studentId} showEmptyState />
        ) : (
          <Card className="portal-card mt-4"><CardContent className="p-5 text-sm text-red-700">학생 정보를 확인할 수 없습니다. 수업일지에서 과제 버튼을 다시 눌러 주세요.</CardContent></Card>
        )}
      </main>
    </div>
  );
}
