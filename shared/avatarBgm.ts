import { z } from "zod";

export const avatarBgmTracks = [
  {
    id: "moonlight-library",
    title: "달빛 도서관",
    durationSeconds: 184,
    durationLabel: "3분 4초",
    price: 300,
    url: "/avatar-rewards/audio/moonlight-library.mp3",
    description: "고요한 책장 사이로 달빛이 번지는 해밀월드의 밤",
  },
  {
    id: "starlight-walk",
    title: "별빛 산책",
    durationSeconds: 162,
    durationLabel: "2분 42초",
    price: 300,
    url: "/avatar-rewards/audio/starlight-walk.mp3",
    description: "별빛을 따라 천천히 걷는 듯 맑고 포근한 선율",
  },
] as const;

export const avatarBgmTrackId = z.string().trim().min(1).max(64);
export type AvatarBgmTrackId = z.infer<typeof avatarBgmTrackId>;
export type AvatarBgmState = {
  owned: AvatarBgmTrackId[];
  equipped: AvatarBgmTrackId | null;
  firstPurchaseFree: boolean;
  tracks: Array<{
    id: string;
    title: string;
    durationSeconds: number;
    durationLabel: string;
    price: number;
    url: string;
    description: string;
  }>;
};

export function avatarBgmPrice(ownedCount: number, listedPrice: number) {
  if (!Number.isSafeInteger(ownedCount) || ownedCount < 0)
    throw new Error("Invalid BGM inventory count");
  return ownedCount === 0 ? 0 : listedPrice;
}

export function avatarBgmTrack(id: AvatarBgmTrackId) {
  return avatarBgmTracks.find(track => track.id === id)!;
}
