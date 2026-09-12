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
import { getStudentNotificationIdentity } from "../db";
import { sendAdminPush } from "../pushNotifications";
import {
  rewardOrderInput,
  rewardAdjustmentInput,
  rewardBulkAdjustmentInput,
} from "../../shared/avatarRewards";
import * as store from "../avatarRewardStore";
import { storagePut } from "../storage";
import { officialCharacterInput } from "../../shared/avatarOfficial";
import { avatarBgmTrackId } from "../../shared/avatarBgm";
import {
  shopItemInput,
  shopCategory,
  shopAssetRole,
} from "../../shared/avatarShop";
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
const shopAssetInput = z.object({
  data: z.string().min(1).max(24_000_000),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "audio/mpeg"]),
});
const shopAssetFilesInput = z
  .partialRecord(shopAssetRole, shopAssetInput)
  .optional();
async function saveShopAsset(file: z.infer<typeof shopAssetInput>) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.data))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "상품 파일을 확인해 주세요.",
    });
  const bytes = Buffer.from(file.data, "base64");
  const audio = file.mime === "audio/mpeg";
  if (bytes.length > (audio ? 15 : 8) * 1024 * 1024)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "이미지는 8MB, MP3는 15MB 이하로 등록해 주세요.",
    });
  if (
    audio &&
    !(
      bytes.subarray(0, 3).toString("ascii") === "ID3" ||
      (bytes[0] === 255 && (bytes[1] & 224) === 224)
    )
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "올바른 MP3 파일을 등록해 주세요.",
    });
  if (!audio) validateRewardImage(file as z.infer<typeof imageInput>);
  const ext = audio ? "mp3" : file.mime.split("/")[1];
  return (
    await storagePut(`avatar-shop/${randomUUID()}.${ext}`, bytes, file.mime)
  ).url;
}
export const avatarRewardsRouter = router({
  ownedDecorationCatalog: studentProcedure.query(({ input }) =>
    store.ownedDecorationCatalog(input.studentId)
  ),
  shopCatalog: studentProcedure
    .input(z.object({ category: shopCategory.optional() }))
    .query(({ input }) => store.shopCatalog(input.category)),
  bgmState: studentProcedure.query(({ input }) =>
    store.bgmState(input.studentId)
  ),
  purchaseBgm: studentProcedure
    .input(z.object({ trackId: avatarBgmTrackId }))
    .mutation(({ input }) => store.purchaseBgm(input.studentId, input.trackId)),
  equipBgm: studentProcedure
    .input(z.object({ trackId: avatarBgmTrackId }))
    .mutation(({ input }) => store.equipBgm(input.studentId, input.trackId)),
  worldThemeState: studentProcedure.query(({ input }) =>
    store.worldThemeState(input.studentId)
  ),
  purchaseWorldTheme: studentProcedure
    .input(z.object({ worldId: z.string().min(1).max(64) }))
    .mutation(({ input }) =>
      store.purchaseWorldTheme(input.studentId, input.worldId)
    ),
  equipWorldTheme: studentProcedure
    .input(z.object({ worldId: z.string().min(1).max(64) }))
    .mutation(({ input }) =>
      store.equipWorldTheme(input.studentId, input.worldId)
    ),
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
    .mutation(async ({ input }) => {
      const result = await store.submitRewardOrder(
        input.studentId,
        input.order
      );
      try {
        const student = await getStudentNotificationIdentity(input.studentId);
        await sendAdminPush({
          title: "새 스페셜 아바타 제작 요청",
          body: `${student?.name ?? "학생"} 학생이 아바타 제작을 요청했습니다.`,
          url: "/avatar-rewards",
          tag: `avatar-order-${result.id}`,
        });
      } catch (error) {
        console.error("[Avatar order] admin push failed", error);
      }
      return result;
    }),
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
  officialCharacters: adminProcedure.query(() => store.officialCharacters()),
  adminShopItems: adminProcedure.query(() =>
    store.shopCatalog(undefined, true)
  ),
  createShopItem: adminProcedure
    .input(
      z.object({
        item: shopItemInput,
        asset: shopAssetInput.optional(),
        assetFiles: shopAssetFilesInput,
      })
    )
    .mutation(async ({ input }) => {
      const assets = { ...input.item.assets };
      for (const [role, file] of Object.entries(input.assetFiles ?? {}))
        assets[role as keyof typeof assets] = await saveShopAsset(file);
      return store.createShopItem({
        ...input.item,
        assets,
        assetUrl: input.asset
          ? await saveShopAsset(input.asset)
          : input.item.assetUrl,
      });
    }),
  updateShopItem: adminProcedure
    .input(
      z.object({
        item: shopItemInput,
        asset: shopAssetInput.optional(),
        assetFiles: shopAssetFilesInput,
      })
    )
    .mutation(async ({ input }) => {
      const assets = { ...input.item.assets };
      for (const [role, file] of Object.entries(input.assetFiles ?? {}))
        assets[role as keyof typeof assets] = await saveShopAsset(file);
      return store.updateShopItem({
        ...input.item,
        assets,
        assetUrl: input.asset
          ? await saveShopAsset(input.asset)
          : input.item.assetUrl,
      });
    }),
  deleteShopItem: adminProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(({ input }) => store.deleteShopItem(input.id)),
  createOfficialCharacter: adminProcedure
    .input(officialCharacterInput.extend({ image: imageInput }))
    .mutation(async ({ input }) => {
      const { image, ...character } = input;
      return store.createOfficialCharacter(character, await saveImage(image));
    }),
  updateOfficialCharacter: adminProcedure
    .input(
      officialCharacterInput.extend({
        id: z.string().uuid(),
        image: imageInput.optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, image, ...character } = input;
      return store.updateOfficialCharacter(
        id,
        character,
        image ? await saveImage(image) : undefined
      );
    }),
  deleteOfficialCharacter: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) => store.deleteOfficialCharacter(input.id)),
  adjust: adminProcedure
    .input(rewardAdjustmentInput)
    .mutation(({ input, ctx }) => store.adjustRewardPoints(input, ctx.user.id)),
  bulkAdjust: adminProcedure
    .input(rewardBulkAdjustmentInput)
    .mutation(({ input, ctx }) =>
      store.bulkAdjustRewardPoints(input.adjustments, ctx.user.id)
    ),
  adminSnapshot: adminProcedure
    .input(student)
    .query(({ input }) => store.rewardSnapshot(input.studentId)),
  adminGalleryCrop: adminProcedure
    .input(
      z.object({
        cardId: z.string().uuid(),
        cropX: z.number().int().min(0).max(100),
        cropY: z.number().int().min(0).max(100),
        cropZoom: z.number().int().min(100).max(500),
      })
    )
    .mutation(({ input }) =>
      store.setGalleryCropAdmin(
        input.cardId,
        input.cropX,
        input.cropY,
        input.cropZoom
      )
    ),
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
      const bytes = input.images.map(validateRewardImage);
      if (bytes[0].equals(bytes[1]))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "서로 다른 후보 이미지 두 장을 등록해 주세요.",
        });
      const urls = await Promise.all(input.images.map(saveImage));
      await store.publishRewardCandidates(
        input.studentId,
        input.orderId,
        urls as [string, string]
      );
    }),
});
