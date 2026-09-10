import { z } from "zod";
export const frames = [
  {
    id: "lunar",
    name: "월광의 서약",
    rank: "기본",
    price: 0,
    description: "달빛 금선과 별의 문양으로 시작하는 나만의 컬렉션",
  },
  {
    id: "aurora",
    name: "오로라의 정원",
    rank: "레어",
    price: 300,
    description: "청록빛 궤도 위로 번지는 은은한 오로라",
  },
  {
    id: "astral",
    name: "별자리의 왕관",
    rank: "에픽",
    price: 750,
    description: "보랏빛 성운과 겹겹의 별자리 장식",
  },
  {
    id: "solar",
    name: "태양의 성역",
    rank: "레전더리",
    price: 1500,
    description: "찬란한 황금빛과 태양 문장으로 완성하는 한 장",
  },
] as const;
export const frameId = z.enum(["lunar", "aurora", "astral", "solar"]);
export type FrameId = z.infer<typeof frameId>;
export const sharingInput = z.object({
  cardId: z.string().uuid(),
  visible: z.boolean(),
  showName: z.boolean().default(false),
  showGrade: z.boolean().default(false),
});
export type SharingInput = z.infer<typeof sharingInput>;
export type Wardrobe = {
  equipped: FrameId;
  background: BackgroundId;
  ownedBackgrounds: string[];
  owned: string[];
  cropZoom: number;
  sharing: {
    cardId: string;
    visible: boolean;
    showName: boolean;
    showGrade: boolean;
  }[];
};
export type GalleryCard = {
  cropX: number;
  cropY: number;
  cropZoom: number;
  id: string;
  url: string;
  mode: string;
  frame: FrameId;
  background: BackgroundId;
  name: string;
  grade: string;
  likes: number;
  liked: boolean;
  mine: boolean;
};

export const backgrounds = [
  {
    id: "classic",
    name: "별의 인장",
    rank: "기본",
    price: 0,
    description: "짙은 바탕 위 은은한 문양과 정교한 금선 장식",
  },
  {
    id: "library",
    name: "달빛 서고",
    rank: "레어",
    price: 300,
    description: "달빛이 스며드는 아치와 고요한 서가의 실루엣",
  },
  {
    id: "nebula",
    name: "성운의 회랑",
    rank: "에픽",
    price: 750,
    description: "보랏빛 성운과 겹쳐진 천체 궤도",
  },
  {
    id: "palace",
    name: "태양의 궁전",
    rank: "레전더리",
    price: 1500,
    description: "황금빛 대칭 문양과 빛나는 궁전의 아치",
  },
] as const;
export const backgroundId = z.enum(["classic", "library", "nebula", "palace"]);
export type BackgroundId = z.infer<typeof backgroundId>;

export const galleryPageSize = 36;
