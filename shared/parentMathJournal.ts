import { mathCurriculumForDate } from "./mathCurriculum";
import { normalizeMathJournalDisplayContent } from "./mathProgress";

export const PARENT_MATH_TITLE_START_DATE = "2026-09-28";

const smallUnitTitle =
  /^\[\s*(중[1-3]-[12])\s*\/\s*1단계\s*\/\s*(\d+)-(\d+)단원\s*\]$/;

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

/**
 * 보호자 화면에만 소단원명을 끼워 넣는다. 저장된 수업일지는 수정하지 않는다.
 */
export function parentMathJournalContent(
  content: string,
  subject: string,
  today = todayInKorea()
) {
  if (!subject.includes("수학"))
    return content;
  const normalized = normalizeMathJournalDisplayContent(content);
  if (today < PARENT_MATH_TITLE_START_DATE) return normalized;

  const lines = normalized.split(/\r?\n/);
  const display: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    display.push(line);
    const match = line.trim().match(smallUnitTitle);
    if (!match) continue;

    const course = mathCurriculumForDate(today).find(item => item.term === match[1]);
    const unit = course?.units[Number(match[2]) - 1];
    const name = unit?.smalls[Number(match[3]) - 1];
    if (!name || lines[index + 1]?.trim() === name) continue;

    display.push(name);
    if (lines[index + 1]?.trim().match(smallUnitTitle)) display.push("");
  }

  return display.join("\n");
}
