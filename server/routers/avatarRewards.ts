import {
  frameId,
  backgroundId,
  sharingInput,
} from "../../shared/avatarCollection";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getPortalFamilyByToken } from "../db";
import {
  rewardOrderInput,
  rewardAdjustmentInput,
} from "../../shared/avatarRewards";
import * as store from "../avatarRewardStore";
import { storagePut } from "../storage";
const identity = z.object({
  token: z.string().min(8).max(64),
  studentId: z.number().int().positive(),
});
const studentProcedure = publicProcedure
  .input(identity)
  .use(async ({ input, next }) => {
    if (
      !(await getPortalFamilyByToken(input.token)).some(
        s => s.id === input.studentId
      )
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "학생 열람 권한이 없습니다.",
      });
    return next();
  });
const student = z.object({ studentId: z.number().int().positive() });
const order = student.extend({ orderId: z.string().uuid() });
const imageInput = z.object({
  data: z.string().min(1).max(12_000_000),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export function validateRewardImage(image: z.infer<typeof imageInput>) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "이미지 파일을 확인해 주세요.",
    });
  const bytes = Buffer.from(image.data, "base64");
  const valid =
    image.mime === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : image.mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid || bytes.length > 8 * 1024 * 1024)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PNG/JPEG/WebP 이미지(8MB 이하)를 사용해 주세요.",
    });
  return bytes;
}
async function saveImage(image: z.infer<typeof imageInput>) {
  const bytes = validateRewardImage(image);
  return (
    await storagePut(
      `avatar-rewards/${randomUUID()}.${image.mime.split("/")[1]}`,
      bytes,
      image.mime
    )
  ).url;
}
export const avatarRewardsRouter = router({
  purchaseBackground: studentProcedure
    .input(z.object({ cardId: z.string().uuid(), backgroundId }))
    .mutation(({ input }) =>
      store.purchaseBackground(
        input.studentId,
        input.cardId,
        input.backgroundId
      )
    ),
  equipBackground: studentProcedure
    .input(z.object({ cardId: z.string().uuid(), backgroundId }))
    .mutation(({ input }) =>
      store.equipBackground(input.studentId, input.cardId, input.backgroundId)
    ),
  wardrobe: studentProcedure.query(({ input }) =>
    store.wardrobe(input.studentId)
  ),
  purchaseFrame: studentProcedure
    .input(z.object({ cardId: z.string().uuid(), frameId }))
    .mutation(({ input }) =>
      store.purchaseFrame(input.studentId, input.cardId, input.frameId)
    ),
  equipFrame: studentProcedure
    .input(z.object({ cardId: z.string().uuid(), frameId }))
    .mutation(({ input }) =>
      store.equipFrame(input.studentId, input.cardId, input.frameId)
    ),
  cropZoom: studentProcedure
    .input(z.object({ zoom: z.number().int().min(100).max(500) }))
    .mutation(({ input }) => store.setCropZoom(input.studentId, input.zoom)),
  share: studentProcedure
    .input(sharingInput)
    .mutation(({ input }) => store.shareCard(input.studentId, input)),
  gallery: studentProcedure
    .input(z.object({ page: z.number().int().min(0).max(1000).default(0) }))
    .query(({ input }) => store.gallery(input.studentId, input.page)),
  like: studentProcedure
    .input(z.object({ cardId: z.string().uuid(), liked: z.boolean() }))
    .mutation(({ input }) =>
      store.likeCard(input.studentId, input.cardId, input.liked)
    ),

  snapshot: studentProcedure.query(({ input }) =>
    store.rewardSnapshot(input.studentId)
  ),
  submit: studentProcedure
    .input(z.object({ order: rewardOrderInput }))
    .mutation(({ input }) =>
      store.submitRewardOrder(input.studentId, input.order)
    ),
  randomCharge: studentProcedure
    .input(z.object({ all: z.boolean(), requestId: z.string().uuid() }))
    .mutation(({ input }) =>
      store.chargeRewardRandom(input.studentId, input.all, input.requestId)
    ),
  select: studentProcedure
    .input(
      z.object({ orderId: z.string().uuid(), candidateId: z.string().uuid() })
    )
    .mutation(({ input }) =>
      store.selectRewardCandidate(
        input.studentId,
        input.orderId,
        input.candidateId
      )
    ),
  representative: studentProcedure
    .input(
      z.object({
        cardId: z.string().uuid().nullable(),
        cropY: z.number().int().min(0).max(100),
        cropX: z.number().int().min(0).max(100).default(50),
      })
    )
    .mutation(({ input }) =>
      store.setRewardRepresentative(
        input.studentId,
        input.cardId,
        input.cropY,
        input.cropX
      )
    ),
  adminList: adminProcedure.query(() => store.rewardAdminList()),
  adjust: adminProcedure
    .input(rewardAdjustmentInput)
    .mutation(({ input, ctx }) => store.adjustRewardPoints(input, ctx.user.id)),
  adminSnapshot: adminProcedure
    .input(student)
    .query(({ input }) => store.rewardSnapshot(input.studentId)),
  cancel: adminProcedure
    .input(order)
    .mutation(({ input }) =>
      store.cancelRewardOrder(input.studentId, input.orderId)
    ),
  master: adminProcedure
    .input(student.extend({ image: imageInput }))
    .mutation(async ({ input }) =>
      store.setRewardMaster(input.studentId, await saveImage(input.image))
    ),
  publish: adminProcedure
    .input(order.extend({ images: z.tuple([imageInput, imageInput]) }))
    .mutation(async ({ input }) => {
      input.images.forEach(validateRewardImage);
      const urls = await Promise.all(input.images.map(saveImage));
      await store.publishRewardCandidates(
        input.studentId,
        input.orderId,
        urls as [string, string]
      );
    }),
});
