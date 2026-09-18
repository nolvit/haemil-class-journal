import type { MouseEvent } from "react";
import { buildJournalHistoryUrl } from "@shared/journalHistory";
import { openJournalHistoryWindow } from "@/lib/journalHistoryWindow";

type HistoryTarget = {
  student: { id: number; name: string; grade: string };
  classGroup: { id: number; subject: string };
};

/** A real link keeps Ctrl/Cmd-click and the browser's new-tab fallback available. */
export default function JournalHistoryButton({ student, classGroup }: HistoryTarget) {
  const href = buildJournalHistoryUrl(student.id, classGroup.id);
  const openCalendar = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (openJournalHistoryWindow(href)) event.preventDefault();
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openCalendar}
      className="rounded text-left font-serif text-lg text-[#193D3C] underline decoration-[#AFC3BD] decoration-dotted underline-offset-4 hover:text-[#2F7154] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52706A] focus-visible:ring-offset-2"
      aria-label={`${student.name} ${classGroup.subject} 최근 4주 수업일지 달력 새 창에서 보기`}
      title="이름을 누르면 최근 4주 달력이 새 창에서 열립니다."
    >
      {student.name}
    </a>
  );
}
