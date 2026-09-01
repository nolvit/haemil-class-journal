export type NoticeTemplateKind = "closure" | "legal_holiday";

export type ClosureNoticeTemplate = {
  id: string;
  label: string;
  content: string;
};

const templatesByKind: Record<NoticeTemplateKind, ClosureNoticeTemplate[]> = {
  legal_holiday: [
    { id: "holiday-greeting", label: "명절 인사", content: "{name}을 맞아 가족과 함께 따뜻하고 풍성한 시간 보내시길 바랍니다." },
    { id: "holiday-substitute", label: "대체공휴일", content: "{name}에는 정규 수업이 없습니다. 편안한 휴일 보내세요." },
    { id: "holiday-national", label: "국경일 안내", content: "{name}에는 정규 수업과 수업일지 작성이 없습니다." },
  ],
  closure: [
    { id: "closure-vacation", label: "방학", content: "{name} 기간에는 정규 수업이 없습니다. 즐겁고 안전한 방학 보내세요." },
    { id: "closure-regular", label: "정기 휴강", content: "{name} 기간에는 정규 수업과 수업일지 작성이 없습니다." },
    { id: "closure-special", label: "특별 휴강", content: "{name}으로 정규 수업이 쉽니다. 일정에 참고해 주세요." },
    { id: "closure-event", label: "학원 행사", content: "{name} 기간에는 학원 일정으로 정규 수업이 없습니다." },
  ],
};

export function getClosureNoticeTemplates(kind: NoticeTemplateKind) {
  return templatesByKind[kind];
}

export function formatClosureNoticeTemplate(template: ClosureNoticeTemplate, values: { name: string; period?: string }) {
  return template.content
    .replaceAll("{name}", values.name.trim() || "해당 일정")
    .replaceAll("{period}", values.period?.trim() || "해당 기간");
}

/** 기존 문구는 지우지 않고, 템플릿을 새로운 문단으로 추가한다. */
export function appendClosureNoticeTemplate(existing: string, template: ClosureNoticeTemplate, values: { name: string; period?: string }) {
  const formatted = formatClosureNoticeTemplate(template, values);
  return existing.trim() ? `${existing.trim()}\n${formatted}` : formatted;
}
