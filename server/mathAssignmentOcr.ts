import { createHash, createSign } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  beginMathOcrRequest, failMathOcrRequest, finishMathOcrRequest,
  getMathOcrUsage, parseImageDataUrl, type MathOcrRegion,
  getPublicMathAssignment,
} from "./mathAssignmentStore";

type VisionWord = { text: string; confidence: number; x: number; y: number };
type VisionProvider = (base64Image: string) => Promise<VisionWord[]>;
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
let cachedToken: { token: string; expiresAt: number } | undefined;

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OCR 설정이 아직 없습니다. 직접 입력을 사용해 주세요." });
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    if (!account.client_email || !account.private_key) throw new Error("missing fields");
    return account;
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OCR 설정이 올바르지 않습니다. 직접 입력을 사용해 주세요." });
  }
}

async function accessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT" });
  const claims = encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: account.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const assertion = `${signingInput}.${signer.sign(account.private_key).toString("base64url")}`;
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}`);
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google OAuth response has no token");
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return body.access_token;
}

type VisionSymbol = { text?: string };
type VisionParagraph = { words?: Array<{ symbols?: VisionSymbol[]; confidence?: number;
  boundingBox?: { vertices?: Array<{ x?: number; y?: number }> } }> };
type VisionResponse = { responses?: Array<{ error?: { message?: string };
  fullTextAnnotation?: { pages?: Array<{ blocks?: Array<{ paragraphs?: VisionParagraph[] }> }> } }> };

export async function googleVisionWords(base64Image: string): Promise<VisionWord[]> {
  const token = await accessToken(serviceAccount());
  const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: base64Image }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Google Vision ${response.status}`);
  const body = await response.json() as VisionResponse;
  const result = body.responses?.[0];
  if (result?.error) throw new Error(`Google Vision ${result.error.message || "feature error"}`);
  return (result?.fullTextAnnotation?.pages ?? []).flatMap(page => (page.blocks ?? []).flatMap(block =>
    (block.paragraphs ?? []).flatMap(paragraph => (paragraph.words ?? []).map(word => {
      const vertices = word.boundingBox?.vertices ?? [];
      return { text: (word.symbols ?? []).map(symbol => symbol.text || "").join(""),
        confidence: word.confidence ?? 0, x: vertices.reduce((sum, vertex) => sum + (vertex.x ?? 0), 0) / (vertices.length || 1),
        y: vertices.reduce((sum, vertex) => sum + (vertex.y ?? 0), 0) / (vertices.length || 1) };
    }))));
}

function dimensions(bytes: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") return bytes.length >= 24 ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null;
  if (mimeType !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0xff) { offset++; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

export function mapVisionWordsToRegions(words: VisionWord[], regions: MathOcrRegion[]) {
  return regions.map(region => {
    const inside = words.filter(word => word.x >= region.x && word.x <= region.x + region.width &&
      word.y >= region.y && word.y <= region.y + region.height).sort((a, b) => a.x - b.x);
    return { ordinal: region.ordinal, value: inside.map(word => word.text).join(""),
      confidence: inside.length && inside.every(word => word.confidence >= 0.8) ? "high" as const : "uncertain" as const };
  });
}

export async function recognizeMathAssignmentPage(input: { token: string; studentId: number; assignmentId: string;
  code: string; pageNumber: number; imageDataUrl: string; regions: MathOcrRegion[] }, provider: VisionProvider = googleVisionWords) {
  const assignment = await getPublicMathAssignment(input.token, input.studentId, input.assignmentId);
  if (assignment.code !== input.code || !assignment.canSubmit || input.pageNumber > Math.ceil(assignment.items.length / 30))
    throw new TRPCError({ code: "FORBIDDEN", message: "답안지 과제 또는 페이지가 올바르지 않습니다." });
  // Obtain credentials before quota reservation; unknown Vision outcomes after reservation stay counted.
  if (provider === googleVisionWords) await accessToken(serviceAccount());
  const { bytes, mimeType } = parseImageDataUrl(input.imageDataUrl);
  const size = dimensions(bytes, mimeType);
  if (!size || size.width < 1 || size.height < 1 || size.width > 10000 || size.height > 10000)
    throw new TRPCError({ code: "BAD_REQUEST", message: "OCR 사진 크기를 확인해 주세요." });
  if (input.regions.some(region => ![region.x, region.y, region.width, region.height].every(Number.isInteger) ||
    region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 ||
    region.x + region.width > size.width || region.y + region.height > size.height))
    throw new TRPCError({ code: "BAD_REQUEST", message: "답란 좌표가 OCR 사진 밖에 있습니다." });
  const imageHash = createHash("sha256").update(bytes).update(JSON.stringify(input.regions)).digest("hex");
  const request = await beginMathOcrRequest({ ...input, imageHash });
  if (request.cached) return request.response;
  try {
    const words = await provider(bytes.toString("base64"));
    const answers = mapVisionWordsToRegions(words, input.regions);
    const response = { answers, warnings: answers.filter(answer => answer.confidence === "uncertain").map(answer => `${answer.ordinal}번 답을 확인해 주세요.`),
      usage: await getMathOcrUsage() };
    await finishMathOcrRequest(request.id, response);
    return response;
  } catch (error) {
    await failMathOcrRequest(request.id);
    console.error("Math answer OCR failed", error instanceof Error ? error.name : "unknown");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "OCR을 완료하지 못했습니다. 사진을 다시 촬영하거나 직접 입력해 주세요." });
  }
}
