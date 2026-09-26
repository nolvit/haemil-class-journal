/** Accept the short and full school/grade spellings used in student records. */
export function normalizeSchoolName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "")
    .replace(/초등학교$/, "초")
    .replace(/중학교$/, "중")
    .replace(/고등학교$/, "고");
}

export function sameSchool(a: string | null | undefined, b: string | null | undefined) {
  const first = normalizeSchoolName(a);
  return Boolean(first && first === normalizeSchoolName(b));
}

export function normalizeGrade(value: string) {
  const compact = value.replace(/\s+/g, "");
  const match = /^(초등학교|초등|초|중학교|중등|중|고등학교|고등|고)([1-6])(?:학년)?$/.exec(compact);
  if (!match) return compact;
  const level = match[1].startsWith("초") ? "초" : match[1].startsWith("중") ? "중" : "고";
  return `${level}${match[2]}`;
}

export function sameGrade(a: string, b: string) {
  return Boolean(a.trim() && b.trim() && normalizeGrade(a) === normalizeGrade(b));
}

export function matchingExamStudents<T extends { active: boolean; schoolHint: string | null; grade: string }>(
  students: T[], exam: { schoolName: string; grade: string }
) {
  return students.filter(student => student.active &&
    sameSchool(student.schoolHint, exam.schoolName) && sameGrade(student.grade, exam.grade));
}

export function schoolExamLabel(exam: {
  schoolName: string; grade: string; academicYear: number; semester: number; title: string;
}) {
  const semesterText = `${exam.semester}학기`;
  const title = exam.title.trim();
  const includesSemester = new RegExp(`${exam.semester}\\s*학기`).test(title);
  return `${exam.schoolName} · ${exam.grade} · ${exam.academicYear} ${includesSemester ? title : `${semesterText} ${title}`}`;
}
