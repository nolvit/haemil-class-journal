import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { matchingExamStudents, sameGrade, sameSchool, schoolExamLabel } from "@shared/schoolExamIdentity";

const todayInKorea = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const subjects = ["국어", "영어", "수학", "사회", "과학", "역사", "도덕", "기술·가정", "정보", "기타"];
const field = "block space-y-1 text-sm font-medium text-[#35504B]";
const card = "rounded-2xl border border-[#E4E0D6] bg-white p-5 shadow-sm";
const scoreText = (value: number | null) => value === null ? "—" : `${value}점`;
const scoreDraftKey = (subjectId: number, studentId: number) => `${subjectId}:${studentId}`;

export default function SchoolExams() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const exams = trpc.academy.schoolExams.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const students = trpc.academy.schoolExams.students.useQuery(undefined, { enabled: user?.role === "admin" });
  const [selectedExamId, setSelectedExamId] = useState<number>();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>();
  const [editingExamId, setEditingExamId] = useState<number>();
  const [schoolName, setSchoolName] = useState("");
  const [grade, setGrade] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState<1 | 2>(1);
  const [examType, setExamType] = useState<"중간고사" | "기말고사" | "기타">("중간고사");
  const [examTitle, setExamTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [examDate, setExamDate] = useState(todayInKorea());
  const [maxScore, setMaxScore] = useState("100");
  const [schoolAverage, setSchoolAverage] = useState("");
  const [averageSource, setAverageSource] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [score, setScore] = useState("");
  const [manualLessonCount, setManualLessonCount] = useState("");
  const [lessonCountNote, setLessonCountNote] = useState("");
  const [recalculateLessonCount, setRecalculateLessonCount] = useState(false);
  const [confirmIdentityMismatch, setConfirmIdentityMismatch] = useState(false);
  const [inlineScores, setInlineScores] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const clearResultForm = () => {
    setStudentId(""); setScore(""); setManualLessonCount(""); setLessonCountNote("");
    setRecalculateLessonCount(false); setConfirmIdentityMismatch(false);
  };
  const clearSubjectForm = () => {
    setSubjectName(""); setExamDate(todayInKorea()); setMaxScore("100");
    setSchoolAverage(""); setAverageSource(""); clearResultForm();
  };
  const clearExamForm = () => {
    setEditingExamId(undefined); setSchoolName(""); setGrade("");
    setAcademicYear(new Date().getFullYear()); setSemester(1);
    setExamType("중간고사"); setExamTitle("");
  };

  useEffect(() => {
    if (selectedExamId === undefined && exams.data?.length) setSelectedExamId(exams.data[0].id);
  }, [exams.data, selectedExamId]);
  useEffect(() => {
    setAdvancedOpen(false);
  }, [selectedSubjectId]);
  const selectedExam = exams.data?.find(item => item.id === selectedExamId);
  useEffect(() => {
    if (selectedExam && !selectedExam.subjects.some(subject => subject.id === selectedSubjectId))
      setSelectedSubjectId(selectedExam.subjects[0]?.id);
  }, [selectedExam, selectedSubjectId]);
  const selectedSubject = selectedExam?.subjects.find(item => item.id === selectedSubjectId);
  const existingResult = selectedSubject?.results.find(item => item.studentId === Number(studentId));
  const selectedStudent = students.data?.find(item => item.id === Number(studentId));
  const matchingStudents = selectedExam ? matchingExamStudents(students.data ?? [], selectedExam) : [];
  const matchingStudentIds = new Set(matchingStudents.map(student => student.id));
  const otherResults = selectedSubject?.results.filter(result => !matchingStudentIds.has(result.studentId)) ?? [];
  const identityMismatch = Boolean(selectedStudent && selectedExam && (
    (selectedStudent.schoolHint && !sameSchool(selectedStudent.schoolHint, selectedExam.schoolName)) ||
    !sameGrade(selectedStudent.grade, selectedExam.grade)
  ));
  const refresh = () => utils.academy.schoolExams.list.invalidate();
  const createExam = trpc.academy.schoolExams.createExam.useMutation({
    onSuccess: async item => {
      setSelectedExamId(item.id); setSelectedSubjectId(undefined);
      await refresh(); toast.success("학교시험을 등록했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const updateExam = trpc.academy.schoolExams.updateExam.useMutation({
    onSuccess: async item => {
      setSelectedExamId(item.id);
      await refresh(); toast.success("학교시험 정보를 수정했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const saveSubject = trpc.academy.schoolExams.saveSubject.useMutation({
    onSuccess: async id => {
      setSelectedSubjectId(id); await refresh(); toast.success("시험 과목을 저장했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const saveResult = trpc.academy.schoolExams.saveResult.useMutation({
    onSuccess: async (_, variables) => {
      await refresh(); toast.success("학생 성적을 저장했습니다.");
      setScore(""); setManualLessonCount(""); setLessonCountNote(""); setRecalculateLessonCount(false);
      setInlineScores(current => {
        const next = { ...current };
        delete next[scoreDraftKey(variables.examSubjectId, variables.studentId)];
        return next;
      });
    },
    onError: error => toast.error(error.message),
  });
  const deleteExam = trpc.academy.schoolExams.deleteExam.useMutation({
    onSuccess: async (_, variables) => {
      const nextId = exams.data?.find(exam => exam.id !== variables.id)?.id;
      await refresh();
      setSelectedExamId(current => current === variables.id ? nextId : current);
      if (editingExamId === variables.id) clearExamForm();
      setSelectedSubjectId(undefined);
      setInlineScores({});
      clearSubjectForm();
      toast.success("시험과 연결된 과목·성적을 삭제했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteSubject = trpc.academy.schoolExams.deleteSubject.useMutation({
    onSuccess: async (_, variables) => {
      await refresh();
      setSelectedSubjectId(current => current === variables.id ? undefined : current);
      setInlineScores(current => Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${variables.id}:`))
      ));
      if (selectedSubjectId === variables.id) clearSubjectForm();
      toast.success("시험 과목과 연결된 성적을 삭제했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteResult = trpc.academy.schoolExams.deleteResult.useMutation({
    onSuccess: async (_, variables) => {
      const deletedStudentId = selectedSubject?.results.find(result => result.id === variables.id)?.studentId;
      await refresh();
      clearResultForm();
      if (deletedStudentId !== undefined && selectedSubject) setInlineScores(current => {
        const next = { ...current };
        delete next[scoreDraftKey(selectedSubject.id, deletedStudentId)];
        return next;
      });
      toast.success("학생 성적 기록을 삭제했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const recordMutationPending = createExam.isPending || updateExam.isPending || saveSubject.isPending || saveResult.isPending ||
    deleteExam.isPending || deleteSubject.isPending || deleteResult.isPending;

  const submitExam = (event: FormEvent) => {
    event.preventDefault();
    const details = { schoolName, grade, academicYear, semester, examType,
      title: examTitle.trim() || examType };
    if (editingExamId !== undefined) {
      const previous = exams.data?.find(exam => exam.id === editingExamId);
      if (!previous) { toast.error("수정할 시험을 찾을 수 없습니다. 목록을 새로고침해 주세요."); return; }
      const resultCount = previous.subjects.reduce((count, subject) => count + subject.results.length, 0);
      if (resultCount > 0 && (previous.schoolName !== schoolName.trim() || previous.grade !== grade.trim()) &&
        !window.confirm(`이 시험에는 학생 성적 ${resultCount}건이 있습니다. 학교 또는 학년을 변경해도 기존 성적은 유지됩니다. 계속할까요?`)) return;
      updateExam.mutate({ id: editingExamId, ...details });
    } else createExam.mutate(details);
  };
  const editExam = (exam: NonNullable<typeof exams.data>[number]) => {
    setSelectedExamId(exam.id); setSelectedSubjectId(undefined); setSubjectName("");
    setEditingExamId(exam.id); setSchoolName(exam.schoolName); setGrade(exam.grade);
    setAcademicYear(exam.academicYear); setSemester(exam.semester as 1 | 2);
    setExamType(exam.examType as typeof examType); setExamTitle(exam.title);
    document.getElementById("school-exam-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const submitSubject = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedExamId) return;
    saveSubject.mutate({ examId: selectedExamId, subject: subjectName.trim(), examDate,
      maxScore: Number(maxScore), schoolAverage: schoolAverage === "" ? null : Number(schoolAverage),
      averageSource: schoolAverage === "" ? null : averageSource.trim() });
  };
  const submitResult = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSubjectId || !studentId || score === "") return;
    saveResult.mutate({ examSubjectId: selectedSubjectId, studentId: Number(studentId),
      score: Number(score),
      confirmIdentityMismatch,
      ...(manualLessonCount !== "" ? { manualLessonCount: Number(manualLessonCount), lessonCountNote }
        : recalculateLessonCount ? { manualLessonCount: null } : {}) });
  };
  const submitInlineScore = (selectedStudentId: number) => {
    if (!selectedSubject) return;
    const current = selectedSubject.results.find(result => result.studentId === selectedStudentId);
    const value = inlineScores[scoreDraftKey(selectedSubject.id, selectedStudentId)] ??
      (current ? String(current.score) : "");
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > selectedSubject.maxScore) {
      toast.error(`0점부터 ${selectedSubject.maxScore}점까지 입력해 주세요.`);
      return;
    }
    saveResult.mutate({ examSubjectId: selectedSubject.id, studentId: selectedStudentId, score: parsed });
  };
  const openResultDetails = (result: NonNullable<typeof selectedSubject>["results"][number]) => {
    setAdvancedOpen(true);
    setStudentId(String(result.studentId));
    setScore((selectedSubject && inlineScores[scoreDraftKey(selectedSubject.id, result.studentId)]) ?? String(result.score));
    setManualLessonCount(result.lessonCountStatus === "manual" ? String(result.lessonCount) : "");
    setLessonCountNote(result.lessonCountNote ?? ""); setRecalculateLessonCount(false);
    setConfirmIdentityMismatch(true);
  };

  const confirmDeleteExam = (exam: NonNullable<typeof exams.data>[number]) => {
    const resultCount = exam.subjects.reduce((count, subject) => count + subject.results.length, 0);
    if (window.confirm(`${schoolExamLabel(exam)} 시험을 삭제할까요?\n\n과목 ${exam.subjects.length}개와 학생 성적 ${resultCount}건도 함께 삭제됩니다. 학생 관리 정보와 수업일지는 유지됩니다. 이 작업은 되돌릴 수 없습니다.`))
      deleteExam.mutate({ id: exam.id });
  };
  const confirmDeleteSubject = (subject: NonNullable<typeof selectedSubject>) => {
    if (window.confirm(`${subject.subject} 시험 과목을 삭제할까요?\n\n이 과목의 학생 성적 ${subject.results.length}건도 함께 삭제됩니다. 다른 과목과 학생 정보는 유지됩니다. 이 작업은 되돌릴 수 없습니다.`))
      deleteSubject.mutate({ id: subject.id });
  };
  const confirmDeleteResult = (result: NonNullable<typeof selectedSubject>["results"][number]) => {
    if (window.confirm(`${result.studentName} 학생의 ${selectedSubject?.subject ?? "선택한 과목"} 성적 기록을 삭제할까요?\n\n학생 관리 정보와 다른 시험 성적은 유지됩니다. 이 작업은 되돌릴 수 없습니다.`))
      deleteResult.mutate({ id: result.id });
  };

  if (user?.role !== "admin") return <p>관리자만 확인할 수 있습니다.</p>;
  return <div className="journal-page-shell space-y-5">
    <header className="journal-page-heading">
      <p className="eyebrow">SCHOOL EXAMS & RESULTS</p>
      <h1>학교시험·성적</h1>
      <p>전 과목 학교시험 결과와 시험 전 수업 횟수를 기록합니다. 이 자료는 관리자에게만 표시됩니다.</p>
    </header>

    <section id="school-exam-form" className={card}>
      <h2 className="mb-3 text-lg font-semibold">학교시험 {editingExamId === undefined ? "등록" : "수정"}</h2>
      {editingExamId !== undefined && <p className="mb-3 text-sm text-stone-500">선택한 시험의 기본 정보를 수정합니다. 과목과 학생 성적은 그대로 유지됩니다.</p>}
      <form onSubmit={submitExam} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={field}>학교명<Input required list="school-name-options" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="예: 원일중학교" /></label>
        <datalist id="school-name-options">{Array.from(new Set([
          ...(students.data?.map(s => s.schoolHint).filter((name): name is string => Boolean(name)) ?? []),
          ...(exams.data?.map(item => item.schoolName) ?? []),
        ])).map(name => <option key={name} value={name} />)}</datalist>
        <label className={field}>시험 당시 학년<Input required value={grade} onChange={e => setGrade(e.target.value)} placeholder="예: 중2" /></label>
        <label className={field}>학년도<Input required type="number" min="2000" max="2100" value={academicYear} onChange={e => setAcademicYear(Number(e.target.value))} /></label>
        <label className={field}>학기<select className="journal-select" value={semester} onChange={e => setSemester(Number(e.target.value) as 1 | 2)}><option value="1">1학기</option><option value="2">2학기</option></select></label>
        <label className={field}>시험 종류<select className="journal-select" value={examType} onChange={e => setExamType(e.target.value as typeof examType)}><option>중간고사</option><option>기말고사</option><option>기타</option></select></label>
        <label className={field}>시험명<Input value={examTitle} onChange={e => setExamTitle(e.target.value)} placeholder="비우면 시험 종류로 입력" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button disabled={recordMutationPending}>{editingExamId === undefined ? "시험 등록" : "수정 저장"}</Button>
          {editingExamId !== undefined && <Button type="button" variant="outline" disabled={recordMutationPending} onClick={clearExamForm}>수정 취소 · 새 시험 등록</Button>}
        </div>
      </form>
    </section>

    {exams.isLoading ? <p>시험 기록을 불러오는 중입니다.</p> : exams.error ? <p role="alert">{exams.error.message}</p> : <>
      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">등록된 시험</h2>
        {exams.data?.length ? <div className="flex flex-wrap gap-2">{exams.data.map(exam =>
          <div key={exam.id} className="flex items-center gap-1">
            <Button type="button" variant={selectedExamId === exam.id ? "default" : "outline"}
              onClick={() => editExam(exam)}>
              {schoolExamLabel(exam)}
            </Button>
            <Button type="button" variant="outline" className="text-[#A05242]" disabled={recordMutationPending}
              aria-label={`${exam.title} 시험 삭제`} onClick={() => confirmDeleteExam(exam)}>삭제</Button>
          </div>)}</div> : <p className="text-sm text-stone-500">등록된 시험이 없습니다.</p>}
      </section>
      {selectedExam && <>
        <section className={card}>
          <h2 className="mb-1 text-lg font-semibold">시험 과목·학교 평균</h2>
          <p className="mb-4 text-sm text-stone-500">학교 평균은 확인된 값과 출처를 함께 입력합니다. 성적 등록 후 시험일·만점은 고정됩니다.</p>
          <form onSubmit={submitSubject} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={field}>과목<Input required list="exam-subject-options" value={subjectName} onChange={e => setSubjectName(e.target.value)} /></label>
            <datalist id="exam-subject-options">{subjects.map(name => <option key={name} value={name} />)}</datalist>
            <label className={field}>시험일<Input required type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /></label>
            <label className={field}>만점<Input required type="number" min="1" step="0.1" value={maxScore} onChange={e => setMaxScore(e.target.value)} /></label>
            <label className={field}>학교 전체 평균(선택)<Input type="number" min="0" max={maxScore} step="0.1" value={schoolAverage} onChange={e => setSchoolAverage(e.target.value)} /></label>
            <label className={field}>학교 평균 출처<Input required={schoolAverage !== ""} value={averageSource} onChange={e => setAverageSource(e.target.value)} placeholder="예: 학교 배부 성적표" /></label>
            <div className="sm:col-span-2 lg:col-span-3"><Button disabled={recordMutationPending}>과목 저장</Button></div>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">{selectedExam.subjects.map(item =>
            <div key={item.id} className="flex items-center gap-1">
              <Button type="button" variant={selectedSubjectId === item.id ? "default" : "outline"}
                onClick={() => { setSelectedSubjectId(item.id); setSubjectName(item.subject); setExamDate(item.examDate);
                  setMaxScore(String(item.maxScore)); setSchoolAverage(item.schoolAverage === null ? "" : String(item.schoolAverage));
                  setAverageSource(item.averageSource ?? ""); setStudentId(""); setScore(""); setManualLessonCount(""); setLessonCountNote(""); setRecalculateLessonCount(false); }}>
                {item.subject} · {item.examDate}
              </Button>
              <Button type="button" variant="outline" className="text-[#A05242]" disabled={recordMutationPending}
                aria-label={`${item.subject} 시험 과목 삭제`} onClick={() => confirmDeleteSubject(item)}>삭제</Button>
            </div>)}</div>
        </section>
        {selectedSubject && <>
          <section className={card}>
            <h2 className="mb-2 text-lg font-semibold">{selectedSubject.subject} 성적 비교</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>학교 전체 평균 <b>{scoreText(selectedSubject.schoolAverage)}</b></span>
              <span>해밀 재원생 평균 <b>{scoreText(selectedSubject.comparison.academyAverage)}</b></span>
              <span>응시 인원 <b>{selectedSubject.comparison.count}명</b></span>
              {selectedSubject.comparison.difference !== null && <span>차이 <b>{selectedSubject.comparison.difference > 0 ? "+" : ""}{selectedSubject.comparison.difference}점</b></span>}
            </div>
            {selectedSubject.averageSource && <p className="mt-2 text-xs text-stone-500">학교 평균 출처: {selectedSubject.averageSource}</p>}
            {selectedSubject.comparison.count > 0 && selectedSubject.comparison.count < 5 &&
              <p className="mt-2 text-xs text-[#906522]">표본이 적어 평균 차이를 학원 효과로 해석할 수 없습니다.</p>}
          </section>
          <section className={card}>
            <h2 className="mb-1 text-lg font-semibold">학생 점수 입력·수정</h2>
            <p className="mb-4 text-sm text-stone-500">{selectedExam.schoolName} · {selectedExam.grade} 재원생 {matchingStudents.length}명을 자동으로 표시합니다. 점수 저장 전에는 성적과 평균에 포함되지 않습니다.</p>
            {students.isLoading ? <p className="text-sm text-stone-500">학생 목록을 불러오는 중입니다.</p> : students.error ? <p role="alert">학생 목록을 불러오지 못했습니다: {students.error.message}</p> : matchingStudents.length ?
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-[#EFF5F0]"><tr>{["학생", `점수 / ${selectedSubject.maxScore}점`, "시험 전 누적 수업 횟수", "시험 당시 수학 진도", "관리"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                <tbody>{matchingStudents.map(student => {
                  const result = selectedSubject.results.find(item => item.studentId === student.id);
                  const draftKey = scoreDraftKey(selectedSubject.id, student.id);
                  const draft = inlineScores[draftKey] ?? (result ? String(result.score) : "");
                  const parsed = Number(draft);
                  const canSave = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 &&
                    parsed <= selectedSubject.maxScore && (!result || parsed !== result.score);
                  return <tr key={student.id} className="border-t">
                    <td className="p-3 font-medium">{student.name}</td>
                    <td className="p-3"><div className="flex items-center gap-2">
                      <Input type="number" min="0" max={selectedSubject.maxScore} step="0.1" className="w-24 min-w-24" aria-label={`${student.name} 점수`}
                        value={draft} onChange={event => setInlineScores(current => ({ ...current, [draftKey]: event.target.value }))} />
                      <Button type="button" size="sm" disabled={recordMutationPending || selectedSubject.examDate > todayInKorea() || !canSave}
                        onClick={() => submitInlineScore(student.id)}>{result ? "수정" : "저장"}</Button>
                    </div>{!result && <span className="text-xs text-stone-500">미입력</span>}</td>
                    <td className="p-3">{result ? result.lessonCountStatus === "review" ? "확인 필요" : result.lessonCount === null ? "기록 없음" : `${result.lessonCount}회${result.lessonCountStatus === "manual" ? " (수동)" : ""}` : "점수 저장 후 계산"}{result?.lessonCountNote && <p className="text-xs text-stone-500">{result.lessonCountNote}</p>}</td>
                    <td className="p-3">{result?.mathSnapshot ? `기본 ${result.mathSnapshot.percent}% · 학습 ${result.mathSnapshot.learningPercent}% · 평가 ${result.mathSnapshot.evaluationPercent}%` : result && selectedSubject.subject === "수학" ? "데이터 부족" : selectedSubject.subject === "수학" ? "점수 저장 후 계산" : "해당 없음"}</td>
                    <td className="p-3">{result && <div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={() => openResultDetails(result)}>상세</Button><Button type="button" size="sm" variant="outline" className="text-[#A05242]" disabled={recordMutationPending} aria-label={`${student.name} 학생 성적 삭제`} onClick={() => confirmDeleteResult(result)}>삭제</Button></div>}</td>
                  </tr>;
                })}</tbody>
              </table></div> : <p className="text-sm text-stone-500">학교·학년이 일치하는 재원생이 없습니다. 학생 관리 정보를 확인하거나 아래의 예외 입력을 사용하세요.</p>}
            {selectedSubject.examDate > todayInKorea() && <p className="mt-2 text-xs text-stone-500">시험일이 지난 뒤 점수를 등록할 수 있습니다.</p>}
            {otherResults.length > 0 && <div className="mt-5">
              <h3 className="mb-2 font-medium">과거 학년·예외 학생의 기존 성적</h3>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-[#EFF5F0]"><tr>{["학생", "점수", "관리"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                <tbody>{otherResults.map(item => <tr key={item.id} className="border-t"><td className="p-3">{item.studentName}</td><td className="p-3">{item.score} / {selectedSubject.maxScore}</td><td className="p-3"><div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={() => openResultDetails(item)}>상세 수정</Button><Button type="button" size="sm" variant="outline" className="text-[#A05242]" disabled={recordMutationPending} onClick={() => confirmDeleteResult(item)}>삭제</Button></div></td></tr>)}</tbody>
              </table></div>
            </div>}
            <Button type="button" variant="outline" className="mt-5" onClick={() => setAdvancedOpen(open => !open)}>{advancedOpen ? "예외 입력 닫기" : "예외 학생 추가·수업 횟수 보정"}</Button>
            {advancedOpen && <form onSubmit={submitResult} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={field}>학생 검색<Input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="학생 이름·현재 학교" /></label>
              <label className={field}>학생<select required className="journal-select" value={studentId} onChange={e => { setStudentId(e.target.value); setScore(""); setManualLessonCount(""); setLessonCountNote(""); setRecalculateLessonCount(false); setConfirmIdentityMismatch(false); }}>
                <option value="">학생 선택</option>
                {students.data?.filter(item => item.id === Number(studentId) || `${item.name} ${item.schoolHint ?? ""}`.includes(studentSearch)).map(item =>
                  <option key={item.id} value={item.id}>{item.name} · {item.grade} · {item.schoolHint || "학교 미입력"}{item.active ? "" : " (퇴원)"}</option>)}
              </select></label>
              <label className={field}>점수 / {selectedSubject.maxScore}점<Input required type="number" min="0" max={selectedSubject.maxScore} step="0.1" value={score} onChange={e => setScore(e.target.value)} /></label>
              <label className={field}>수업 횟수 직접 보정(선택)<Input type="number" min="0" step="1" value={manualLessonCount} onChange={e => { setManualLessonCount(e.target.value); if (e.target.value !== "") setRecalculateLessonCount(false); }} placeholder={existingResult ? "비우면 기존 값 유지" : "비우면 자동 집계"} /></label>
              {manualLessonCount !== "" && <label className={field}>수동 보정 사유<Input required value={lessonCountNote} onChange={e => setLessonCountNote(e.target.value)} placeholder="예: 복합 과목 수업 2회 확인" /></label>}
              {existingResult && <label className="flex items-center gap-2 text-sm text-[#35504B] sm:col-span-2 lg:col-span-3"><input type="checkbox" checked={recalculateLessonCount} onChange={e => { setRecalculateLessonCount(e.target.checked); if (e.target.checked) { setManualLessonCount(""); setLessonCountNote(""); } }} />저장 시 수업 횟수를 일지에서 다시 계산</label>}
              {identityMismatch && <label className="flex items-center gap-2 text-sm text-[#885927] sm:col-span-2 lg:col-span-3"><input required type="checkbox" checked={confirmIdentityMismatch} onChange={e => setConfirmIdentityMismatch(e.target.checked)} />학생의 현재 학교·학년과 이 시험이 다릅니다. 과거 기록임을 확인했습니다.</label>}
              <div className="sm:col-span-2 lg:col-span-3"><Button disabled={recordMutationPending || selectedSubject.examDate > todayInKorea()}>성적 저장</Button></div>
            </form>}
          </section>
        </>}
      </>}
    </>}
  </div>;
}
