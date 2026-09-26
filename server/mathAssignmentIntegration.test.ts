import express from "express";
import { describe, expect, it, vi } from "vitest";
import { createMathAssignmentIntegrationRouter } from "./mathAssignmentIntegration";

const token = "w".repeat(64);
const id = "550e8400-e29b-41d4-a716-446655440000";
async function call(options: Parameters<typeof createMathAssignmentIntegrationRouter>[0],
  method: "GET" | "POST", path: string, authorization?: string, body?: object) {
  const app = express();
  app.use(express.json());
  app.use("/api/integrations/mathbank", createMathAssignmentIntegrationRouter(options));
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/integrations/mathbank${path}`, {
      method, headers: { ...(authorization ? { Authorization: authorization } : {}), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

describe("mathbank assignment integration", () => {
  const valid = { getToken: () => token, isSecureRequest: () => true };
  it("rejects unauthenticated reads and writes without touching the store", async () => {
    const issue = vi.fn(); const getIssued = vi.fn();
    expect((await call({ ...valid, issue, getIssued }, "GET", `/assignments/${id}`)).status).toBe(401);
    expect((await call({ ...valid, issue, getIssued }, "POST", "/assignments", "Bearer wrong", {})).status).toBe(401);
    expect(issue).not.toHaveBeenCalled(); expect(getIssued).not.toHaveBeenCalled();
  });
  it("requires HTTPS and a separate configured write token", async () => {
    const issue = vi.fn();
    expect((await call({ getToken: () => token, isSecureRequest: () => false, issue }, "POST", "/assignments", `Bearer ${token}`, {})).status).toBe(403);
    expect((await call({ getToken: () => "short", isSecureRequest: () => true, issue }, "POST", "/assignments", `Bearer ${token}`, {})).status).toBe(503);
    expect(issue).not.toHaveBeenCalled();
  });
  it("accepts the strict issue contract and returns an idempotent result", async () => {
    const issue = vi.fn().mockResolvedValue({ assignmentId: id, code: "PAPER1", createdAt: "2026-09-26T00:00:00Z", alreadyExisted: false });
    const body = { sourceBasketId: "basket-1", studentId: 17, idempotencyKey: "attempt-key-1",
      questions: [{ questionId: "one", order: 1, answerType: "choice", answerKey: "①", gradingRule: "exact" }] };
    const response = await call({ ...valid, issue }, "POST", "/assignments", `Bearer ${token}`, body);
    expect(response.status).toBe(201);
    expect(response.cache).toBe("no-store");
    expect(issue).toHaveBeenCalledWith(body);
    expect(response.body).toMatchObject({ assignmentId: id, code: "PAPER1" });
  });
  it("requires a grading rule from the authenticated problem bank", async () => {
    const issue = vi.fn();
    const body = { sourceBasketId: "basket-1", studentId: 17, idempotencyKey: "attempt-key-1",
      questions: [{ questionId: "one", order: 1, answerType: "choice", answerKey: "①" }] };
    const response = await call({ ...valid, issue }, "POST", "/assignments", `Bearer ${token}`, body);
    expect(response.status).toBe(400);
    expect(issue).not.toHaveBeenCalled();
  });
  it("exposes the issued snapshot only to the write token", async () => {
    const getIssued = vi.fn().mockResolvedValue({ assignmentId: id, questions: [{ answerKey: "1" }] });
    const response = await call({ ...valid, getIssued }, "GET", `/assignments/${id}`, `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.questions[0].answerKey).toBe("1");
  });
});
