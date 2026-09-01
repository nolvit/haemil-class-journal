import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { academyRouter } from "./routers/academy";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as db from "./db";

function verifyLocalPassword(password: string) {
  const [saltHex, expectedHex] = ENV.adminPasswordHash.split(":");
  if (
    !saltHex ||
    !expectedHex ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(expectedHex)
  )
    return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function enforceLoginLimit(req: {
  headers: { [key: string]: unknown };
  socket?: { remoteAddress?: string };
}) {
  const forwarded = req.headers["x-forwarded-for"];
  const key =
    (typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined) ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 10)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    config: publicProcedure.query(() => ({
      localEnabled: Boolean(ENV.adminEmail && ENV.adminPasswordHash),
      manusEnabled: Boolean(ENV.appId && ENV.oAuthServerUrl),
    })),
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          password: z.string().min(8).max(256),
        })
      )
      .mutation(async ({ input, ctx }) => {
        enforceLoginLimit(ctx.req);
        if (
          !ENV.adminEmail ||
          input.email.trim().toLowerCase() !==
            ENV.adminEmail.trim().toLowerCase() ||
          !verifyLocalPassword(input.password)
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "이메일 또는 비밀번호를 확인해 주세요.",
          });
        }
        const openId = "local:haemil-admin";
        await db.upsertUser({
          openId,
          name: ENV.adminName,
          email: ENV.adminEmail,
          loginMethod: "local",
          role: "admin",
          lastSignedIn: new Date(),
        });
        const sessionToken = await sdk.createSessionToken(openId, {
          name: ENV.adminName,
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  academy: academyRouter,
});

export type AppRouter = typeof appRouter;
