import { createHash, timingSafeEqual } from "node:crypto";
import { asc } from "drizzle-orm";
import { Router, type Request } from "express";
import { students } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

export type MathbankRosterStudent = {
  id: number;
  name: string;
  grade: string;
  active: boolean;
};

type MathbankRosterRouteOptions = {
  getToken?: () => string | undefined;
  loadStudents?: () => Promise<MathbankRosterStudent[]>;
  isSecureRequest?: (req: Request) => boolean;
};

export async function listMathbankRosterStudents(): Promise<MathbankRosterStudent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Do not reuse listStudents: it reads contact and tuition data and runs settlement.
  return db
    .select({
      id: students.id,
      name: students.name,
      grade: students.grade,
      active: students.active,
    })
    .from(students)
    .orderBy(asc(students.name), asc(students.id));
}

function isConfiguredToken(token: string | undefined): token is string {
  return typeof token === "string" && token.length >= 32 && /^[\x21-\x7e]+$/.test(token);
}

function hasValidBearerToken(authorization: string | undefined, token: string): boolean {
  const presented = /^Bearer ([^\s,]+)$/.exec(authorization ?? "")?.[1] ?? "";
  // Hashing first keeps timingSafeEqual inputs the same length even for bad tokens.
  const expectedDigest = createHash("sha256").update(token).digest();
  const presentedDigest = createHash("sha256").update(presented).digest();
  return timingSafeEqual(expectedDigest, presentedDigest);
}

function defaultIsSecureRequest(req: Request): boolean {
  // Railway terminates TLS at its trusted ingress and sets X-Forwarded-Proto.
  return req.secure || req.get("x-forwarded-proto") === "https";
}

export function createMathbankRosterRouter(options: MathbankRosterRouteOptions = {}) {
  const router = Router();
  const getToken = options.getToken ?? (() => ENV.mathbankRosterToken);
  const loadStudents = options.loadStudents ?? listMathbankRosterStudents;
  const isSecureRequest = options.isSecureRequest ?? defaultIsSecureRequest;

  router.all("/students", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.set("Allow", "GET").status(405).json({ error: "method_not_allowed" });
      return;
    }
    if (!isSecureRequest(req)) {
      res.status(403).json({ error: "https_required" });
      return;
    }
    const token = getToken();
    if (!isConfiguredToken(token)) {
      res.status(503).json({ error: "roster_not_configured" });
      return;
    }
    if (!hasValidBearerToken(req.get("authorization"), token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const rows = await loadStudents();
      res.json({
        students: rows.map(({ id, name, grade, active }) => ({
          id,
          name,
          grade,
          active,
        })),
      });
    } catch (error) {
      console.error("Mathbank roster query failed", error instanceof Error ? error.name : "unknown");
      res.status(503).json({ error: "roster_unavailable" });
    }
  });
  return router;
}
