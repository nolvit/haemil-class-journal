import {
  isMathProgressSession,
  type MathJournalPayload,
} from "../shared/mathProgress";
import { suggestMathJournalCopy } from "../shared/mathJournalCopy";

/** A copy source must describe math work, not merely be a populated journal. */
export function isMathLessonCopyCandidate(row: {
  content: string | null;
  journalDate: string;
  isDraft: boolean | null;
  mathProgress: MathJournalPayload | null;
}) {
  if (row.isDraft) return false;
  if (row.mathProgress)
    return row.mathProgress.sessionKind === "math" && row.mathProgress.entries.length > 0;
  if (!row.content?.trim()) return false;
  // Old copy/paste journals can retain a math header even when the actual
  // lesson was explicitly marked as English-focused.
  if (/(?:^|\n)\s*(?:-\s*)?영어\s*집중(?:\s*수업)?(?:\s|$)/.test(row.content.normalize("NFKC")))
    return false;
  const recognizedSession = isMathProgressSession({
    id: 0,
    content: row.content,
    journalDate: row.journalDate,
    isDraft: false,
  }, row.journalDate);
  if (!recognizedSession) return false;
  // A broad unit heading plus unrelated prose does not identify a process item.
  // A small-unit heading names one explicitly; a unit-wide heading needs a
  // recognized item from the conservative legacy-copy parser.
  const namesSmallUnit = /\[\s*중\s*[123]\s*[-–−—]\s*[12]\s*\/\s*(?:기본(?:\s*과정)?|1\s*단계)\s*\/\s*\d+\s*-\s*\d+\s*단원\s*\]/.test(row.content.normalize("NFKC"));
  return namesSmallUnit || suggestMathJournalCopy(row.content, row.journalDate) !== null;
}
