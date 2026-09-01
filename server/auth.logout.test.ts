import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("portable local session", () => {
  it("creates a verifiable session without a Manus app id", async () => {
    const previousAppId = ENV.appId;
    const previousSecret = ENV.cookieSecret;
    ENV.appId = "";
    ENV.cookieSecret = "test-only-session-secret";
    try {
      const token = await sdk.createSessionToken("local:haemil-admin", {
        name: "해밀학원 관리자",
      });

      await expect(sdk.verifySession(token)).resolves.toMatchObject({
        openId: "local:haemil-admin",
        appId: "haemil-class-journal",
        name: "해밀학원 관리자",
      });
    } finally {
      ENV.appId = previousAppId;
      ENV.cookieSecret = previousSecret;
    }
  });
});
