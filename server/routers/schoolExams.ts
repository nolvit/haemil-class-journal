import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as store from "../schoolExamsStore";

const examDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value =>
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
  "올바른 시험일을 입력해 주세요."
);

export const schoolExamsRouter = router({
  list: adminProcedure.query(() => store.listSchoolExams()),
  students: adminProcedure.query(() => store.listExamStudents()),
  deleteExam: adminProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => store.deleteSchoolExam(input.id)),
  deleteSubject: adminProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => store.deleteExamSubject(input.id)),
  deleteResult: adminProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => store.deleteStudentExamResult(input.id)),
  createExam: adminProcedure.input(z.object({
    schoolName: z.string().trim().min(1).max(100),
    grade: z.string().trim().min(1).max(80),
    academicYear: z.number().int().min(2000).max(2100),
    semester: z.union([z.literal(1), z.literal(2)]),
    examType: z.enum(["중간고사", "기말고사", "기타"]),
    title: z.string().trim().min(1).max(100),
  })).mutation(({ input }) => store.createSchoolExam(input)),
  saveSubject: adminProcedure.input(z.object({
    examId: z.number().int().positive(),
    subject: z.string().trim().min(1).max(80),
    examDate,
    maxScore: z.number().finite().positive().max(10000),
    schoolAverage: z.number().finite().min(0).nullable(),
    averageSource: z.string().trim().max(500).nullable(),
  }).superRefine((value, ctx) => {
    if (value.schoolAverage !== null && value.schoolAverage > value.maxScore)
      ctx.addIssue({ code: "custom", message: "학교 평균이 만점을 초과합니다." });
    if (value.schoolAverage !== null && !value.averageSource)
      ctx.addIssue({ code: "custom", message: "학교 평균의 출처를 입력해 주세요." });
  })).mutation(({ input }) => store.saveExamSubject(input)),
  saveResult: adminProcedure.input(z.object({
    examSubjectId: z.number().int().positive(),
    studentId: z.number().int().positive(),
    score: z.number().finite().min(0),
    manualLessonCount: z.number().int().min(0).max(10000).nullable().optional(),
    lessonCountNote: z.string().trim().max(500).optional(),
    confirmIdentityMismatch: z.boolean().default(false),
  }).superRefine((value, ctx) => {
    if (value.manualLessonCount !== undefined && value.manualLessonCount !== null && !value.lessonCountNote)
      ctx.addIssue({ code: "custom", message: "수업 횟수 수동 보정 사유를 입력해 주세요." });
  })).mutation(({ input, ctx }) => store.saveStudentExamResult(input, ctx.user.id)),
});
