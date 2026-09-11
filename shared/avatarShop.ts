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
export const shopAssetRoles = [
  "world_background",
  "slider_track_base",
  "slider_track_fill",
  "slider_thumb",
  "bgm_panel",
] as const;
export const shopAssetRole = z.enum(shopAssetRoles);
export type ShopAssetRole = z.infer<typeof shopAssetRole>;
export const shopAssetRoleLabels: Record<ShopAssetRole, string> = {
  world_background: "전체 배경",
  slider_track_base: "확대바 바탕 트랙",
  slider_track_fill: "확대바 채움 트랙",
  slider_thumb: "확대바 손잡이",
  bgm_panel: "BGM 플레이어 패널",
};
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
  assets: z
    .partialRecord(shopAssetRole, z.string().trim().max(1000))
    .default({}),
  durationSeconds: z.number().int().min(1).max(7200).nullable().default(null),
  active: z.boolean().default(true),
});
export type ShopItemInput = z.infer<typeof shopItemInput>;
export type ShopItem = ShopItemInput & {
  createdAt?: string;
  updatedAt?: string;
};
export type WorldThemeState = {
  owned: string[];
  equipped: string;
  items: ShopItem[];
  assets: Partial<Record<ShopAssetRole, string>>;
};

export const defaultShopItems: ShopItemInput[] = [
  ...(frames.map(x => ({
    ...x,
    category: "card_frame" as const,
    season: "상시",
    assetUrl: null,
    assets: {},
    durationSeconds: null,
    active: true,
  })) as ShopItemInput[]),
  ...(backgrounds.map(x => ({
    ...x,
    category: "card_background" as const,
    season: "상시",
    assetUrl: null,
    assets: {},
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
    assets: {},
    durationSeconds: x.durationSeconds,
    active: true,
  })),
  {
    id: "starlight-court",
    category: "world_background",
    name: "별빛 정원",
    description: "은은한 별 문양과 금빛 테두리로 꾸민 해밀월드 기본 테마",
    rank: "기본",
    price: 0,
    season: "상시",
    assetUrl: null,
    assets: {},
    durationSeconds: null,
    active: true,
  },
];
