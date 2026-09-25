import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const todayInKorea = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const subjects = ["국어", "영어", "수학", "사회", "과학", "역사", "도덕", "기술·가정", "정보", "기타"];
const field = "block space-y-1 text-sm font-medium text-[#35504B]";
const card = "rounded-2xl border border-[#E4E0D6] bg-white p-5 shadow-sm";
const scoreText = (value: number | null) => value === null ? "—" : `${value}점`;

export default function SchoolExams() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const exams = trpc.academy.schoolExams.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const students = trpc.academy.schoolExams.students.useQuery(undefined, { enabled: user?.role === "admin" });
  const [selectedExamId, setSelectedExamId] = useState<number>();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>();
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

  useEffect(() => {
    if (selectedExamId === undefined && exams.data?.length) setSelectedExamId(exams.data[0].id);
  }, [exams.data, selectedExamId]);
  const selectedExam = exams.data?.find(item => item.id === selectedExamId);
  const selectedSubject = selectedExam?.subjects.find(item => item.id === selectedSubjectId);
  const existingResult = selectedSubject?.results.find(item => item.studentId === Number(studentId));
  const selectedStudent = students.data?.find(item => item.id === Number(studentId));
  const gradeCode = (value: string) => value.replace(/초등|중등|고등/g, match => match[0]).replace(/\s/g, "");
  const identityMismatch = Boolean(selectedStudent && selectedExam && (
    (selectedStudent.schoolHint && selectedStudent.schoolHint.replace(/\s/g, "") !== selectedExam.schoolName.replace(/\s/g, "")) ||
    gradeCode(selectedStudent.grade) !== gradeCode(selectedExam.grade)
  ));
  const refresh = () => utils.academy.schoolExams.list.invalidate();
  const createExam = trpc.academy.schoolExams.createExam.useMutation({
    onSuccess: async item => {
      setSelectedExamId(item.id); setSelectedSubjectId(undefined);
      await refresh(); toast.success("학교시험을 등록했습니다.");
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
    onSuccess: async () => {
      await refresh(); toast.success("학생 성적을 저장했습니다.");
      setScore(""); setManualLessonCount(""); setLessonCountNote(""); setRecalculateLessonCount(false);
    },
    onError: error => toast.error(error.message),
  });

  const submitExam = (event: FormEvent) => {
    event.preventDefault();
    createExam.mutate({ schoolName, grade, academicYear, semester, examType,
      title: examTitle.trim() || `${examType} ${semester}학기` });
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

  if (user?.role !== "admin") return <p>관리자만 확인할 수 있습니다.</p>;
  return <div className="journal-page-shell space-y-5">
    <header className="journal-page-heading">
      <p className="eyebrow">SCHOOL EXAMS & RESULTS</p>
      <h1>학교시험·성적</h1>
      <p>전 과목 학교시험 결과와 시험 전 수업 횟수를 기록합니다. 이 자료는 관리자에게만 표시됩니다.</p>
    </header>

    <section className={card}>
      <h2 className="mb-3 text-lg font-semibold">학교시험 등록</h2>
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
        <label className={field}>시험명<Input value={examTitle} onChange={e => setExamTitle(e.target.value)} placeholder="비우면 종류·학기로 자동 입력" /></label>
        <div className="sm:col-span-2 lg:col-span-3"><Button disabled={createExam.isPending}>시험 등록</Button></div>
      </form>
    </section>

    {exams.isLoading ? <p>시험 기록을 불러오는 중입니다.</p> : exams.error ? <p role="alert">{exams.error.message}</p> : <>
      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">등록된 시험</h2>
        {exams.data?.length ? <div className="flex flex-wrap gap-2">{exams.data.map(exam =>
          <Button key={exam.id} type="button" variant={selectedExamId === exam.id ? "default" : "outline"}
            onClick={() => { setSelectedExamId(exam.id); setSelectedSubjectId(undefined); setSubjectName(""); }}>
            {exam.schoolName} · {exam.grade} · {exam.academicYear} {exam.semester}학기 {exam.title}
          </Button>)}</div> : <p className="text-sm text-stone-500">등록된 시험이 없습니다.</p>}
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
            <div className="sm:col-span-2 lg:col-span-3"><Button disabled={saveSubject.isPending}>과목 저장</Button></div>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">{selectedExam.subjects.map(item =>
            <Button key={item.id} type="button" variant={selectedSubjectId === item.id ? "default" : "outline"}
              onClick={() => { setSelectedSubjectId(item.id); setSubjectName(item.subject); setExamDate(item.examDate);
                setMaxScore(String(item.maxScore)); setSchoolAverage(item.schoolAverage === null ? "" : String(item.schoolAverage));
                setAverageSource(item.averageSource ?? ""); setStudentId(""); setScore(""); setManualLessonCount(""); setLessonCountNote(""); setRecalculateLessonCount(false); }}>
              {item.subject} · {item.examDate}
            </Button>)}</div>
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
            <p className="mb-4 text-sm text-stone-500">수업 횟수는 첫 실제 과목 수업부터 시험 전날까지 자동 계산합니다. 복합 과목 등 판별이 어려우면 확인 필요로 표시됩니다.</p>
            <form onSubmit={submitResult} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="sm:col-span-2 lg:col-span-3"><Button disabled={saveResult.isPending || selectedSubject.examDate > todayInKorea()}>성적 저장</Button></div>
            </form>
            {selectedSubject.examDate > todayInKorea() && <p className="mt-2 text-xs text-stone-500">시험일이 지난 뒤 점수를 등록할 수 있습니다.</p>}
            <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="bg-[#EFF5F0]"><tr>{["학생", "점수", "시험 전 누적 수업 횟수", "시험 당시 수학 진도", "수정"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{selectedSubject.results.map(item => <tr key={item.id} className="border-t">
                <td className="p-3">{item.studentName}</td><td className="p-3">{item.score} / {selectedSubject.maxScore}</td>
                <td className="p-3">{item.lessonCountStatus === "review" ? "확인 필요" : item.lessonCount === null ? "기록 없음" : `${item.lessonCount}회${item.lessonCountStatus === "manual" ? " (수동)" : ""}`}{item.lessonCountNote && <p className="text-xs text-stone-500">{item.lessonCountNote}</p>}</td>
                <td className="p-3">{item.mathSnapshot ? `기본 ${item.mathSnapshot.percent}% · 학습 ${item.mathSnapshot.learningPercent}% · 평가 ${item.mathSnapshot.evaluationPercent}%` : selectedSubject.subject === "수학" ? "데이터 부족" : "해당 없음"}</td>
                <td className="p-3"><Button type="button" size="sm" variant="outline" onClick={() => { setStudentId(String(item.studentId)); setScore(String(item.score)); setManualLessonCount(item.lessonCountStatus === "manual" ? String(item.lessonCount) : ""); setLessonCountNote(item.lessonCountNote ?? ""); setRecalculateLessonCount(false); setConfirmIdentityMismatch(true); }}>수정</Button></td>
              </tr>)}</tbody>
            </table></div>
          </section>
        </>}
      </>}
    </>}
  </div>;
}
