import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import { getIssuedMathAssignment, issueMathAssignment } from "./mathAssignmentStore";

const questionSchema = z.object({
  questionId: z.string().min(1).max(128),
  order: z.number().int().min(1).max(150),
  answerType: z.enum(["choice", "numeric"]),
  answerKey: z.string().trim().min(1).max(255),
  gradingRule: z.enum(["value", "ratio", "exact"]),
  exactForm: z.boolean().optional(),
  questionLabel: z.string().max(200).optional(),
}).strict();
const issueSchema = z.object({
  sourceBasketId: z.string().min(1).max(128),
  studentId: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
  title: z.string().trim().min(1).max(200).optional(),
  answerSheetVersion: z.union([z.literal(3), z.literal(4)]).optional(),
  questions: z.array(questionSchema).min(1).max(150),
}).strict();

function secure(req: Request) { return req.secure || req.get("x-forwarded-proto") === "https"; }
function validToken(presented: string | undefined, expected: string) {
  const candidate = /^Bearer ([^\s,]+)$/.exec(presented ?? "")?.[1] ?? "";
  return timingSafeEqual(createHash("sha256").update(candidate).digest(), createHash("sha256").update(expected).digest());
}
type IntegrationOptions = {
  getToken?: () => string;
  isSecureRequest?: (req: Request) => boolean;
  issue?: typeof issueMathAssignment;
  getIssued?: typeof getIssuedMathAssignment;
};
export function createMathAssignmentIntegrationRouter(options: IntegrationOptions = {}) {
  const router = Router();
  const getToken = options.getToken ?? (() => ENV.mathbankAssignmentWriteToken);
  const isSecure = options.isSecureRequest ?? secure;
  const issue = options.issue ?? issueMathAssignment;
  const getIssued = options.getIssued ?? getIssuedMathAssignment;
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!isSecure(req)) { res.status(403).json({ error: "https_required" }); return; }
    const expected = getToken();
    if (expected.length < 32 || expected === ENV.mathbankRosterToken) {
      res.status(503).json({ error: "assignment_integration_not_configured" }); return;
    }
    if (!validToken(req.get("authorization"), expected)) {
      res.status(401).json({ error: "unauthorized" }); return;
    }
    next();
  });
  router.post("/assignments", async (req, res) => {
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_assignment", detail: parsed.error.issues.map(issue => issue.message) }); return; }
    try {
      const result = await issue(parsed.data);
      res.status(result.alreadyExisted ? 200 : 201).json(result);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "BAD_REQUEST") {
        res.status(400).json({ error: "invalid_assignment", detail: error instanceof Error ? error.message : undefined }); return;
      }
      console.error("Math assignment issue failed", error instanceof Error ? error.name : "unknown");
      res.status(503).json({ error: "assignment_unavailable" });
    }
  });
  router.get("/assignments/:assignmentId", async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.assignmentId)) { res.status(400).json({ error: "invalid_assignment_id" }); return; }
    try {
      const assignment = await getIssued(req.params.assignmentId);
      if (!assignment) { res.status(404).json({ error: "assignment_not_found" }); return; }
      res.json(assignment);
    } catch (error) {
      console.error("Math assignment read failed", error instanceof Error ? error.name : "unknown");
      res.status(503).json({ error: "assignment_unavailable" });
    }
  });
  return router;
}
