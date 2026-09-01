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
