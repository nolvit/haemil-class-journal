import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMathbankRosterRouter, type MathbankRosterStudent } from "./mathbankRoster";

const token = "a".repeat(64);
const students: MathbankRosterStudent[] = [
  { id: 17, name: "김학생", grade: "중2", active: true },
  { id: 22, name: "김학생", grade: "중3", active: false },
];

async function requestRoster(
  options: Parameters<typeof createMathbankRosterRouter>[0] = {},
  request: { method?: string; authorization?: string; forwardedProto?: string } = {}
) {
  const app = express();
  app.use("/api/integrations/mathbank", createMathbankRosterRouter(options));
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/integrations/mathbank/students`,
      {
        method: request.method ?? "GET",
        headers: {
          ...(request.authorization ? { Authorization: request.authorization } : {}),
          ...(request.forwardedProto ? { "X-Forwarded-Proto": request.forwardedProto } : {}),
        },
      }
    );
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      allow: response.headers.get("allow"),
      body: request.method === "HEAD" ? null : await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
}

afterEach(() => vi.restoreAllMocks());

describe("mathbank roster integration", () => {
  const secure = () => true;

  it("requires HTTPS even with a valid token", async () => {
    const loadStudents = vi.fn().mockResolvedValue(students);
    const result = await requestRoster(
      { getToken: () => token, loadStudents },
      { authorization: `Bearer ${token}` }
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "https_required" });
    expect(loadStudents).not.toHaveBeenCalled();
  });

  it("accepts HTTPS marked by the trusted TLS ingress", async () => {
    const result = await requestRoster(
      { getToken: () => token, loadStudents: async () => students },
      { authorization: `Bearer ${token}`, forwardedProto: "https" }
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ students });
  });

  it("reports missing or weak configuration without reading students", async () => {
    const loadStudents = vi.fn().mockResolvedValue(students);
    for (const configured of [undefined, "short"]) {
      const result = await requestRoster(
        { getToken: () => configured, loadStudents, isSecureRequest: secure },
        { authorization: `Bearer ${token}` }
      );
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ error: "roster_not_configured" });
    }
    expect(loadStudents).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed, and incorrect bearer tokens", async () => {
    const loadStudents = vi.fn().mockResolvedValue(students);
    for (const authorization of [undefined, token, `Bearer ${token}x`, `Bearer ${token},bad`]) {
      const result = await requestRoster(
        { getToken: () => token, loadStudents, isSecureRequest: secure },
        { authorization }
      );
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: "unauthorized" });
      expect(result.cacheControl).toBe("no-store");
    }
    expect(loadStudents).not.toHaveBeenCalled();
  });

  it("returns active and inactive students with only the four allowed fields", async () => {
    const loadStudents = vi.fn().mockResolvedValue([
      { ...students[0], parentPhone: "private" },
      students[1],
    ]);
    const result = await requestRoster(
      { getToken: () => token, loadStudents, isSecureRequest: secure },
      { authorization: `Bearer ${token}` }
    );
    expect(result.status).toBe(200);
    expect(result.cacheControl).toBe("no-store");
    expect(result.body).toEqual({ students });
    expect(loadStudents).toHaveBeenCalledTimes(1);
  });

  it("permits GET only, including rejecting HEAD", async () => {
    for (const method of ["POST", "HEAD"]) {
      const result = await requestRoster(
        { getToken: () => token, loadStudents: async () => students, isSecureRequest: secure },
        { method, authorization: `Bearer ${token}` }
      );
      expect(result.status).toBe(405);
      expect(result.allow).toBe("GET");
    }
  });

  it("reports roster query failures separately from configuration failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await requestRoster(
      {
        getToken: () => token,
        loadStudents: async () => { throw new Error("database failed"); },
        isSecureRequest: secure,
      },
      { authorization: `Bearer ${token}` }
    );
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "roster_unavailable" });
  });
});
