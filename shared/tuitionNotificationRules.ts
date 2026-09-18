import { getMonthlySessionCount } from "./tuitionRules";

function tuitionSchoolLabel(grade: string) {
  const normalized = grade.trim();
  if (normalized.startsWith("고")) return "고등부";
  if (normalized.startsWith("중")) return "중등부";
  return "초등부";
}

function formatTuitionAmount(tuition: number) {
  const amount = Math.max(0, Math.round(tuition));
  return amount % 10_000 === 0
    ? `${amount / 10_000}만원`
    : `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function buildTuitionNotificationLine(input: {
  grade: string;
  registrationCount: number;
  subjectCount: number;
  tuition: number;
}) {
  const school = tuitionSchoolLabel(input.grade);
  const monthlyCount = getMonthlySessionCount(input.registrationCount);
  const subject =
    school === "초등부" ? "" : `${Math.max(1, input.subjectCount)}과목 `;
  return `원비는 ${school} ${subject}${monthlyCount}회 기준 ${formatTuitionAmount(input.tuition)}입니다.`;
}
