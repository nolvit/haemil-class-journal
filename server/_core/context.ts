import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { createHash, timingSafeEqual } from "node:crypto";
import { sdk } from "./sdk";

// TEST-ONLY: temporary secret for PR #24 Preview. Remove before merging to main.
const PR_PREVIEW_KEY_HASH =
  "e767b53a0255b74a83d16bc51d2e0128e822b925658dbb2e572f2527778c3e08";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user && hasValidPreviewKey(opts.req)) {
    const now = new Date();
    user = {
      id: 1,
      openId: "preview:haemil-admin",
      name: "해밀 Preview 관리자",
      email: null,
      loginMethod: "preview",
      role: "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

function hasValidPreviewKey(req: CreateExpressContextOptions["req"]) {
  const rawHeader = req.headers["x-haemil-preview-key"];
  const key = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!key) return false;
  const actual = Buffer.from(createHash("sha256").update(key).digest("hex"));
  const expected = Buffer.from(PR_PREVIEW_KEY_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
