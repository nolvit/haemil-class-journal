import React, { useEffect, useMemo, useState } from "react";
import { mathCurriculumForDate } from "@shared/mathCurriculum";
import { getMathReviewSuggestions, type MathReviewSuggestion } from "@shared/mathJournalQuickEntry";
import { mathItemLabel, mathUnitOptions, middleGrade, type MathJournalEntry, type MathJournalPayload } from "@shared/mathProgress";

type Props = {
  date: string;
  grade: string;
  sessionKind: MathJournalPayload["sessionKind"];
  entries: MathJournalEntry[];
  previousEntries?: MathJournalEntry[];
  disabled?: boolean;
  legacy?: boolean;
  onSessionKindChange: (value: MathJournalPayload["sessionKind"]) => void;
  onEntriesChange: (value: MathJournalEntry[]) => void;
  onReviewSuggestion?: (value: MathReviewSuggestion) => void;
};

export function MathJournalSelection({ date, grade, sessionKind, entries, previousEntries = [], disabled, legacy, onSessionKindChange, onEntriesChange, onReviewSuggestion }: Props) {
  const courses = useMemo(() => mathCurriculumForDate(date), [date]);
  const lastEntry = entries.at(-1);
  const gradeNumber = middleGrade(grade) ?? 2;
  const middle3Term = gradeNumber === 3 ? `중3-${Number(date.slice(5, 7)) >= 7 ? 2 : 1}` : null;
  const defaultTerm = lastEntry?.key.split(":")[0] ?? courses.find(course => course.term === middle3Term)?.term ??
    courses.find(course => course.term.startsWith(`중${gradeNumber}-`))?.term ?? courses[0]?.term ?? "중1-1";
  const [term, setTerm] = useState(defaultTerm);
  const [unitNumber, setUnitNumber] = useState(Number(lastEntry?.key.split(":")[1]) || 1);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTerm(defaultTerm);
    setUnitNumber(Number(lastEntry?.key.split(":")[1]) || 1);
    setExpanded(false);
  }, [date, grade]);
  // 복사로 선택 항목이 바뀌면 다음에 펼칠 목록도 해당 단원에서 시작한다.
  useEffect(() => {
    if (expanded || !lastEntry) return;
    setTerm(lastEntry.key.split(":")[0]!);
    setUnitNumber(Number(lastEntry.key.split(":")[1]) || 1);
  }, [lastEntry?.key, expanded]);

  const course = courses.find(value => value.term === term) ?? courses[0];
  const options = mathUnitOptions(course?.term ?? term, unitNumber, date);
  const selected = new Map(entries.map(entry => [entry.key, entry.state]));
  const reviewSuggestions = getMathReviewSuggestions([...previousEntries, ...entries], date);
  const focusedEntry = entries.findLast(entry => entry.state === "active") ?? lastEntry;
  const nextItem = useMemo(() => {
    if (!focusedEntry || sessionKind !== "math") return null;
    const [entryTerm, entryUnit] = focusedEntry.key.split(":");
    const selectedCourse = courses.find(value => value.term === entryTerm);
    if (!selectedCourse) return null;
    const selectedKeys = new Set(entries.map(entry => entry.key));
    for (let unit = Number(entryUnit); unit <= selectedCourse.units.length; unit++) {
      const unitOptions = mathUnitOptions(entryTerm!, unit, date);
      const start = unit === Number(entryUnit) ? unitOptions.findIndex(item => item.key === focusedEntry.key) + 1 : 0;
      for (const item of unitOptions.slice(Math.max(0, start)))
        if (!selectedKeys.has(item.key)) return item;
    }
    return null;
  }, [courses, date, entries, focusedEntry, sessionKind]);
  const change = (key: string, state: MathJournalEntry["state"] | "") => {
    if (!state) { onEntriesChange(entries.filter(entry => entry.key !== key)); return; }
    onEntriesChange(entries.some(entry => entry.key === key)
      ? entries.map(entry => entry.key === key ? { ...entry, state } : entry)
      : [...entries, { key, state }]);
  };
  const startNext = () => {
    if (!focusedEntry || !nextItem) return;
    const updated = entries.map(entry => entry.key === focusedEntry.key && entry.state === "active"
      ? { ...entry, state: "complete" as const } : entry);
    onEntriesChange([...updated, { key: nextItem.key, state: "active" }]);
  };

  return <section className="rounded-xl border border-[#D5E3DA] bg-[#F4F8F3] px-3 py-2 text-sm">
    {legacy && <p className="mb-2 rounded-lg bg-[#FFF6D8] px-2 py-1.5 text-xs text-[#765E10]">과거 일지의 완료 상태를 보존하기 위해 기존 일지는 종전 방식으로 유지합니다. 새 일지부터 항목 선택을 사용할 수 있습니다.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <strong>수학 과정</strong>
        <span className="ml-2 text-xs text-[#61746E]">{sessionKind === "english" ? "영어 집중 · 수학 진도 제외" : entries.length ? `이번 일지 ${entries.length}개 항목` : "선택한 항목 없음"}</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <button type="button" aria-label="수학 수업 선택" aria-pressed={sessionKind === "math"} disabled={disabled} onClick={() => onSessionKindChange("math")} className={`rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${sessionKind === "math" ? "border-[#8FB9A2] bg-[#E9F4EC] text-[#285943]" : "border-[#C5D4CC] bg-white text-[#61746E]"}`}>수학</button>
        <button type="button" aria-label="영어 집중 수업 선택" aria-pressed={sessionKind === "english"} disabled={disabled} onClick={() => onSessionKindChange("english")} className={`rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${sessionKind === "english" ? "border-[#8FB9A2] bg-[#E9F4EC] text-[#285943]" : "border-[#C5D4CC] bg-white text-[#61746E]"}`}>영어 집중 수업</button>
        <button type="button" aria-expanded={expanded} disabled={disabled} onClick={() => setExpanded(value => !value)} className="rounded-lg border border-[#C5D4CC] bg-white px-2.5 py-1 text-xs font-semibold text-[#31564B] disabled:opacity-50">{expanded ? "선택 닫기" : "과정 변경"}</button>
      </div>
    </div>
    {sessionKind === "english" && entries.length > 0 && <p className="mt-2 text-xs text-[#765E10]">영어 집중으로 저장하면 선택한 수학 과정 {entries.length}개는 이번 일지의 진도에 반영되지 않습니다.</p>}
    {sessionKind === "math" && entries.length > 0 && <div className="mt-2 space-y-1" aria-label="이번 일지의 수학 과정 항목">
      {entries.map(entry => {
        const [entryTerm, entryUnit] = entry.key.split(":");
        const label = mathItemLabel(entry.key, date);
        const accessibleLabel = `${entryTerm} ${entryUnit}단원 ${label}`;
        return <div key={entry.key} className="flex flex-col gap-1 rounded-md border border-[#DDE7E0] bg-white px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 break-keep text-xs text-[#31564B]"><span className="mr-1 text-[#71817D]">{entryTerm} · {entryUnit}단원</span>{label} · {entry.state === "complete" ? "완료" : entry.state === "skipped" ? "건너뜀" : "진행 중"}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label={`${accessibleLabel} 진행 중`} aria-pressed={entry.state === "active"} disabled={disabled} onClick={() => change(entry.key, "active")} className={`rounded border px-1.5 py-0.5 text-[11px] disabled:opacity-50 ${entry.state === "active" ? "border-[#8FB9A2] bg-[#E9F4EC] font-semibold text-[#285943]" : "border-[#DDE7E0] text-[#71817D]"}`}>진행 중</button>
            <button type="button" aria-label={`${accessibleLabel} 완료`} aria-pressed={entry.state === "complete"} disabled={disabled} onClick={() => change(entry.key, "complete")} className={`rounded border px-1.5 py-0.5 text-[11px] disabled:opacity-50 ${entry.state === "complete" ? "border-[#8FB9A2] bg-[#E9F4EC] font-semibold text-[#285943]" : "border-[#DDE7E0] text-[#71817D]"}`}>완료</button>
            <button type="button" aria-label={`${accessibleLabel} 선택 삭제`} disabled={disabled} onClick={() => change(entry.key, "")} className="rounded border border-[#E4D8D2] px-1.5 py-0.5 text-[11px] text-[#9B5A4C] disabled:opacity-50">삭제</button>
          </div>
        </div>;
      })}
    </div>}
    {!expanded && !disabled && sessionKind === "math" && focusedEntry && <div className="mt-2 flex flex-wrap gap-1.5">
      {focusedEntry.state === "active" && <button type="button" onClick={() => change(focusedEntry.key, "complete")} className="rounded-md border border-[#BBD3C4] bg-white px-2 py-1 text-xs text-[#315D45]">현재 항목 완료</button>}
      {nextItem && <button type="button" onClick={startNext} className="rounded-md border border-[#BBD3C4] bg-white px-2 py-1 text-xs text-[#315D45]">{focusedEntry.state === "active" ? "완료 후 다음 과정" : "다음 과정 시작"}</button>}
    </div>}
    {!disabled && sessionKind === "math" && onReviewSuggestion && reviewSuggestions.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="재수강 추천 입력">
      <span className="text-[11px] text-[#61746E]">재수강 빠른 입력</span>
      {reviewSuggestions.map(suggestion => <button key={suggestion.key} type="button" onClick={() => onReviewSuggestion(suggestion)} className="rounded-md border border-[#D9C28A] bg-[#FFF8DE] px-2 py-1 text-xs text-[#765E10]">{suggestion.label}</button>)}
    </div>}
    {expanded && <div className="mt-3 border-t border-[#DDE7E0] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#61746E]">여러 항목을 선택할 수 있습니다. 설명 문장만으로는 진도를 완료 처리하지 않습니다.</p>
      </div>
      {sessionKind === "math" && <>
        <div className="mt-3 flex gap-2">
          <select aria-label="수학 학기" value={course?.term ?? term} disabled={disabled} onChange={event => { setTerm(event.target.value); setUnitNumber(1); }} className="min-w-0 flex-1 rounded-lg border border-[#C5D4CC] bg-white px-2 py-2">
            {courses.map(value => <option key={value.term} value={value.term}>{value.term}</option>)}
          </select>
          <select aria-label="수학 대단원" value={unitNumber} disabled={disabled} onChange={event => setUnitNumber(Number(event.target.value))} className="min-w-0 flex-[2] rounded-lg border border-[#C5D4CC] bg-white px-2 py-2">
            {course?.units.map((unit, index) => <option key={index} value={index + 1}>{index + 1}. {unit.name}</option>)}
          </select>
        </div>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-[#DDE7E0] bg-white">
          {options.map(item => <label key={item.key} className="flex items-center justify-between gap-2 border-b border-[#ECF0EB] px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 text-xs"><span className="mr-1 text-[#6E8379]">{item.sector === "learn" ? "학습" : "평가"}</span>{item.label}</span>
            <select aria-label={`${item.label} 상태`} value={selected.get(item.key) ?? ""} disabled={disabled} onChange={event => change(item.key, event.target.value as MathJournalEntry["state"] | "")} className="max-w-[112px] rounded border border-[#D5DFD7] bg-white px-1 py-1 text-xs">
              <option value="">선택 안 함</option><option value="active">진행 중</option><option value="complete">완료</option><option value="skipped">건너뜀</option>
            </select>
          </label>)}
        </div>
      </>}
    </div>}
  </section>;
}
