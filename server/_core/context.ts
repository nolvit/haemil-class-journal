import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

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

  if (!user && ENV.isPullRequestPreview) {
    const openId = "local:haemil-admin";
    await upsertUser({
      openId,
      name: ENV.adminName,
      email: ENV.adminEmail || null,
      loginMethod: "preview",
      role: "admin",
      lastSignedIn: new Date(),
    });
    user = (await getUserByOpenId(openId)) ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
