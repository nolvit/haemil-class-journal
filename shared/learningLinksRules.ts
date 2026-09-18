export type StudentLearningLinks = {
  vocabularyResultUrl?: string | null;
  englishSpeakingUrl?: string | null;
  mathUnitEvaluationUrl?: string | null;
};

export function countSavedLearningLinks(links: StudentLearningLinks) {
  return [links.vocabularyResultUrl, links.englishSpeakingUrl, links.mathUnitEvaluationUrl].filter(value => Boolean(value?.trim())).length;
}

/** 학습 링크 열기에 사용할 수 있는 HTTP(S) 주소만 반환한다. */
export function getOpenableLearningLink(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type SubjectLearningLink = {
  kind: "vocabulary" | "speaking" | "math";
  label: string;
  url: string;
};

/** 과목별 4주 달력에 노출할 수 있는 학습 링크만 반환한다. */
export function getSubjectLearningLinks(
  subject: string,
  links: StudentLearningLinks,
): SubjectLearningLink[] {
  if (subject.includes("수학")) {
    const url = getOpenableLearningLink(links.mathUnitEvaluationUrl);
    return url ? [{ kind: "math", label: "수학 단원 평가", url }] : [];
  }
  if (subject.includes("영어")) {
    const result: SubjectLearningLink[] = [];
    const vocabularyUrl = getOpenableLearningLink(links.vocabularyResultUrl);
    const speakingUrl = getOpenableLearningLink(links.englishSpeakingUrl);
    if (vocabularyUrl)
      result.push({
        kind: "vocabulary",
        label: "단어 암기 결과",
        url: vocabularyUrl,
      });
    if (speakingUrl)
      result.push({
        kind: "speaking",
        label: "영어 말하기",
        url: speakingUrl,
      });
    return result;
  }
  return [];
}
