import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createGeneralUserContext(): TrpcContext {
  return {
    user: {
      id: 909,
      openId: "general-user",
      email: "general@example.com",
      name: "General User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("academy internal access", () => {
  it("blocks a signed-in non-admin user before any internal data is read", async () => {
    const caller = appRouter.createCaller(createGeneralUserContext());

    await expect(caller.academy.dashboard({ journalDate: "2026-08-26" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
