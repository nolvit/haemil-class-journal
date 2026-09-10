import { z } from "zod";
import { frames, backgrounds } from "./avatarCollection";
import { avatarBgmTracks } from "./avatarBgm";

export const shopCategories = [
  "card_frame",
  "card_background",
  "world_background",
  "bgm",
] as const;
export const shopCategory = z.enum(shopCategories);
export type ShopCategory = z.infer<typeof shopCategory>;
export const shopRanks = ["기본", "레어", "에픽", "레전더리", "뮤직"] as const;
export const shopRank = z.enum(shopRanks);
export const shopCategoryLabels: Record<ShopCategory, string> = {
  card_frame: "카드 프레임",
  card_background: "카드 배경",
  world_background: "전체 배경",
  bgm: "BGM",
};
export const shopItemInput = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,18}$/),
  category: shopCategory,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  rank: shopRank,
  price: z.number().int().min(0).max(100000),
  season: z.string().trim().max(30).default("상시"),
  assetUrl: z.string().trim().max(1000).nullable().default(null),
  durationSeconds: z.number().int().min(1).max(7200).nullable().default(null),
  active: z.boolean().default(true),
});
export type ShopItemInput = z.infer<typeof shopItemInput>;
export type ShopItem = ShopItemInput & {
  createdAt?: string;
  updatedAt?: string;
};

export const defaultShopItems: ShopItemInput[] = [
  ...(frames.map(x => ({
    ...x,
    category: "card_frame" as const,
    season: "상시",
    assetUrl: null,
    durationSeconds: null,
    active: true,
  })) as ShopItemInput[]),
  ...(backgrounds.map(x => ({
    ...x,
    category: "card_background" as const,
    season: "상시",
    assetUrl: null,
    durationSeconds: null,
    active: true,
  })) as ShopItemInput[]),
  ...avatarBgmTracks.map(x => ({
    id: x.id,
    category: "bgm" as const,
    name: x.title,
    description: x.description,
    rank: "뮤직" as const,
    price: x.price,
    season: "상시",
    assetUrl: x.url,
    durationSeconds: x.durationSeconds,
    active: true,
  })),
];
