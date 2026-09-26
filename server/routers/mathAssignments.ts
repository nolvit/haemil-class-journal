import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  changeMathAssignmentStatus, correctMathAssignmentKey, deleteMathAssignment, getAdminMathAssignment,
  getAdminMathAssignmentPhoto, getMathOcrUsage, getPublicMathAssignment,
  listAdminMathAssignments, listPublicMathAssignments, regradeMathAssignment,
  setMathOcrPaidAllowance, submitMathAssignment, currentMathOcrMonth,
  mathAssignmentRowsPerPage,
} from "../mathAssignmentStore";
import { recognizeMathAssignmentPage } from "../mathAssignmentOcr";

const assignmentId = z.string().uuid();
const familyScope = z.object({
  token: z.string().min(8).max(64),
  studentId: z.number().int().positive(),
});
const reason = z.string().trim().min(1).max(500);
const maxAnswerSheetPages = Math.ceil(150 / mathAssignmentRowsPerPage);

export const mathAssignmentsRouter = router({
  publicList: publicProcedure.input(familyScope).query(({ input }) => listPublicMathAssignments(input.token, input.studentId)),
  publicDetail: publicProcedure.input(familyScope.extend({ assignmentId })).query(({ input }) =>
    getPublicMathAssignment(input.token, input.studentId, input.assignmentId)),
  recognizePage: publicProcedure.input(familyScope.extend({
    assignmentId, code: z.string().min(1).max(20), pageNumber: z.number().int().min(1).max(maxAnswerSheetPages),
    imageDataUrl: z.string().max(8_500_000),
    regions: z.array(z.object({ ordinal: z.number().int().min(1).max(150),
      x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
      width: z.number().int().positive(), height: z.number().int().positive() }).strict()).min(1).max(mathAssignmentRowsPerPage),
  })).mutation(({ input }) => recognizeMathAssignmentPage(input)),
  submit: publicProcedure.input(familyScope.extend({
    assignmentId, code: z.string().min(1).max(20),
    answers: z.array(z.object({ ordinal: z.number().int().min(1).max(150), value: z.string().max(255) }).strict()).max(150),
    photos: z.array(z.object({ pageNumber: z.number().int().min(1).max(maxAnswerSheetPages), imageDataUrl: z.string().max(8_500_000) }).strict()).max(maxAnswerSheetPages).optional(),
  })).mutation(({ input }) => submitMathAssignment(input)),
  adminList: adminProcedure.query(() => listAdminMathAssignments()),
  adminDetail: adminProcedure.input(z.object({ assignmentId })).query(({ input }) => getAdminMathAssignment(input.assignmentId)),
  delete: adminProcedure.input(z.object({ assignmentId })).mutation(({ input }) =>
    deleteMathAssignment(input.assignmentId)),
  adminPhoto: adminProcedure.input(z.object({ attemptId: z.string().uuid(), pageNumber: z.number().int().min(1).max(maxAnswerSheetPages) }))
    .query(({ input, ctx }) => { ctx.res.setHeader("Cache-Control", "private, no-store");
      return getAdminMathAssignmentPhoto(input.attemptId, input.pageNumber); }),
  close: adminProcedure.input(z.object({ assignmentId })).mutation(({ input, ctx }) =>
    changeMathAssignmentStatus(input.assignmentId, "close", ctx.user.id)),
  reopen: adminProcedure.input(z.object({ assignmentId })).mutation(({ input, ctx }) =>
    changeMathAssignmentStatus(input.assignmentId, "reopen", ctx.user.id)),
  correctKey: adminProcedure.input(z.object({
    assignmentId, ordinal: z.number().int().min(1).max(150),
    answerKey: z.string().trim().min(1).max(255),
    gradingRule: z.enum(["value", "ratio", "exact"]).optional(),
    exactForm: z.boolean().optional(), reason,
  })).mutation(({ input, ctx }) => correctMathAssignmentKey(input, ctx.user.id)),
  regrade: adminProcedure.input(z.object({ assignmentId, reason })).mutation(({ input, ctx }) =>
    regradeMathAssignment(input.assignmentId, input.reason, ctx.user.id)),
  ocrUsage: adminProcedure.query(() => getMathOcrUsage()),
  setPaidAllowance: adminProcedure.input(z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value => value === currentMathOcrMonth(), "현재 청구 월만 변경할 수 있습니다."),
    extraCalls: z.number().int().min(0).max(10_000),
  })).mutation(({ input, ctx }) => setMathOcrPaidAllowance(input.month, input.extraCalls, ctx.user.id)),
});
