import { expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context: TrpcContext = {
  user: {
    id: 909, openId: "non-admin", email: "user@example.com", name: "User",
    loginMethod: "manus", role: "user", createdAt: new Date(),
    updatedAt: new Date(), lastSignedIn: new Date(),
  },
  req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
};

it("blocks non-admin access to all school exam data and writes", async () => {
  const caller = appRouter.createCaller(context);
  await expect(caller.academy.schoolExams.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.academy.schoolExams.students()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.academy.schoolExams.saveResult({
    examSubjectId: 1, studentId: 1, score: 90,
  })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.academy.schoolExams.deleteExam({ id: 1 }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.academy.schoolExams.deleteSubject({ id: 1 }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.academy.schoolExams.deleteResult({ id: 1 }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
});
