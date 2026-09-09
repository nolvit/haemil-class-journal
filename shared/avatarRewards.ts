import { z } from "zod";
export const rewardOrderInput = z.object({
  top: z.string().trim().min(1).max(300),
  bottom: z.string().trim().min(1).max(300),
  shoes: z.string().trim().min(1).max(300),
  hair: z.string().trim().min(1).max(300),
  background: z.string().trim().min(1).max(300),
  accessories: z.array(z.string().trim().min(1).max(200)).max(8),
  mode: z.enum(["original", "wannabe", "superstar"]),
});
export type RewardOrderInput = z.infer<typeof rewardOrderInput>;
export const modeLabels = {
  original: "오리지널",
  wannabe: "워너비",
  superstar: "슈퍼스타",
};
export const modeDescriptions = {
  original: "내 얼굴과 체형은 그대로, 의상과 헤어를 새롭게",
  wannabe: "나다운 느낌을 살려 더 멋진 스타일로",
  superstar: "나에게서 출발하는 가장 화려한 변신",
};
export type RewardAccount = {
  studentId: number;
  balance: number;
  lifetime: number;
  completedOrders: number;
  masterUrl: string | null;
  representativeId: string | null;
  cropY: number;
};
export type RewardOrder = {
  id: string;
  studentId: number;
  status: "submitted" | "ready" | "completed" | "cancelled";
  price: number;
  input: RewardOrderInput;
  prompt: string;
  masterUrl: string;
  createdAt: string;
  candidates: { id: string; url: string }[];
};
export type RewardCard = {
  id: string;
  url: string;
  mode: string;
  createdAt: string;
};
export type RewardSnapshot = {
  account: RewardAccount;
  nextPrice: number;
  orders: RewardOrder[];
  cards: RewardCard[];
  ledger: { id: number; delta: number; reason: string; createdAt: string }[];
};
