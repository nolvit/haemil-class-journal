import { createHash, createSign } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  beginMathOcrRequest, failMathOcrRequest, finishMathOcrRequest,
  getMathOcrUsage, parseImageDataUrl, type MathOcrRect, type MathOcrRegion,
  getPublicMathAssignment,
} from "./mathAssignmentStore";
import { mathAssignmentRowsPerPageForVersion } from "../shared/mathAssignmentLayout";
import { isSupportedAnswerKey } from "./mathAssignmentRules";

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

async function visionAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (apiKey) return { "x-goog-api-key": apiKey };
  return { Authorization: `Bearer ${await accessToken(serviceAccount())}` };
}

type VisionVertex = { x?: number; y?: number };
type VisionBox = { vertices?: VisionVertex[] };
type VisionSymbol = { text?: string; confidence?: number; boundingBox?: VisionBox };
type VisionParagraph = { words?: Array<{ symbols?: VisionSymbol[]; confidence?: number;
  boundingBox?: VisionBox }> };
type VisionResponse = { responses?: Array<{ error?: { message?: string };
  fullTextAnnotation?: { pages?: Array<{ blocks?: Array<{ paragraphs?: VisionParagraph[] }> }> } }> };

export async function googleVisionWords(base64Image: string): Promise<VisionWord[]> {
  const authHeaders = await visionAuthHeaders();
  const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: base64Image }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      imageContext: { languageHints: ["en-t-i0-handwrit"] } }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Google Vision ${response.status}`);
  const body = await response.json() as VisionResponse;
  const result = body.responses?.[0];
  if (result?.error) throw new Error(`Google Vision ${result.error.message || "feature error"}`);
  return (result?.fullTextAnnotation?.pages ?? []).flatMap(page => (page.blocks ?? []).flatMap(block =>
    (block.paragraphs ?? []).flatMap(paragraph => (paragraph.words ?? []).flatMap(word =>
      (word.symbols ?? []).flatMap(symbol => {
        const vertices = symbol.boundingBox?.vertices ?? word.boundingBox?.vertices ?? [];
        if (!symbol.text || !vertices.length) return [];
        if (vertices.length >= 2 &&
            Math.abs((vertices[1]!.y ?? 0) - (vertices[0]!.y ?? 0)) >
            Math.abs((vertices[1]!.x ?? 0) - (vertices[0]!.x ?? 0))) return [];
        return [{ text: symbol.text, confidence: symbol.confidence ?? word.confidence ?? 0,
          x: vertices.reduce((sum, vertex) => sum + (vertex.x ?? 0), 0) / vertices.length,
          y: vertices.reduce((sum, vertex) => sum + (vertex.y ?? 0), 0) / vertices.length }];
      })))));
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

function insideRect(point: VisionWord, rect: MathOcrRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}

function rectSymbols(words: VisionWord[], rect: MathOcrRect) {
  return words.filter(word => insideRect(word, rect)).sort((a, b) => a.x - b.x);
}

function normalizeOcrText(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, "").replace(/[−–—]/g, "-").replace(/[／]/g, "/").replace(/[：]/g, ":");
}

type OcrReading = { value: string; confidences: number[] };
function readRect(words: VisionWord[], rect: MathOcrRect, kind: "numeric" | "integer"): OcrReading | null {
  const symbols = rectSymbols(words, rect);
  if (!symbols.length) return null;
  const raw = symbols.map(symbol => symbol.text).join("").replace(/\s+/g, "");
  // Restrict the actual Vision symbols before NFKC so circled numerals and
  // other compatibility characters cannot silently turn into digits.
  if (!/^[0-9０-９+＋\-－−–—.．/／:：]+$/.test(raw)) return null;
  const value = normalizeOcrText(raw);
  const valid = kind === "integer"
    ? /^[+-]?\d+$/.test(value)
    : /^[0-9+\-./:]+$/.test(value) &&
      (isSupportedAnswerKey("numeric", value, "value") || isSupportedAnswerKey("numeric", value, "ratio"));
  return valid ? { value, confidences: symbols.map(symbol => symbol.confidence) } : null;
}

function readingConfidence(readings: OcrReading[]) {
  const confidences = readings.flatMap(reading => reading.confidences);
  return confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
}

function reconcileReadings(readings: Array<OcrReading | null>) {
  const groups = new Map<string, OcrReading[]>();
  for (const reading of readings) if (reading) {
    const group = groups.get(reading.value) ?? [];
    group.push(reading);
    groups.set(reading.value, group);
  }
  if (!groups.size) return { value: "", confidence: "uncertain" as const };
  const [value, matching] = [...groups.entries()].sort((a, b) =>
    b[1].length - a[1].length || readingConfidence(b[1]) - readingConfidence(a[1]))[0]!;
  // Even a high-confidence OCR word is unsafe if another independent image
  // reading yields a different valid numeric answer (for example 5/2 vs 5/12).
  const hasConflict = groups.size > 1;
  const oneStrong = matching.some(reading => reading.confidences.every(confidence => confidence >= 0.8));
  const consensus = matching.length >= 2 &&
    matching.every(reading => reading.confidences.every(confidence => confidence >= 0.65)) &&
    readingConfidence(matching) >= 0.8;
  return { value, confidence: !hasConflict && (oneStrong || consensus) ? "high" as const : "uncertain" as const };
}

export function mapVisionWordsToRegions(words: VisionWord[], regions: MathOcrRegion[]) {
  return regions.map(region => {
    if (region.fraction) {
      const numerator = reconcileReadings(region.fraction.numerator.map(rect => readRect(words, rect, "integer")));
      const denominator = reconcileReadings(region.fraction.denominator.map(rect => readRect(words, rect, "integer")));
      const candidate = numerator.value && denominator.value && !/^[+-]?0+$/.test(denominator.value)
        ? `${numerator.value}/${denominator.value}` : "";
      const value = candidate && isSupportedAnswerKey("numeric", candidate, "value") ? candidate : "";
      return { ordinal: region.ordinal, value,
        confidence: value && numerator.confidence === "high" && denominator.confidence === "high"
          ? "high" as const : "uncertain" as const };
    }
    if (region.samples) {
      return { ordinal: region.ordinal,
        ...reconcileReadings(region.samples.map(rect => readRect(words, rect, "numeric"))) };
    }
    // Older clients send one region without subrectangles. Preserve that
    // response contract while using symbol positions when Vision supplies them.
    const inside = rectSymbols(words, region);
    const candidate = normalizeOcrText(inside.map(symbol => symbol.text).join(""));
    const supported = isSupportedAnswerKey("numeric", candidate, "value") || isSupportedAnswerKey("numeric", candidate, "ratio");
    return { ordinal: region.ordinal, value: supported ? candidate : "",
      confidence: supported && inside.every(symbol => symbol.confidence >= 0.8) ? "high" as const : "uncertain" as const };
  });
}

function validRect(rect: MathOcrRect, size: { width: number; height: number }) {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) &&
    rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
    rect.x + rect.width <= size.width && rect.y + rect.height <= size.height;
}

export function validateMathOcrRegions(regions: MathOcrRegion[], size: { width: number; height: number }) {
  for (const region of regions) {
    if (!validRect(region, size) || (region.samples && region.fraction))
      throw new TRPCError({ code: "BAD_REQUEST", message: "답란 좌표가 올바르지 않습니다." });
    if ((region.samples && (region.samples.length < 1 || region.samples.length > 3)) ||
      (region.fraction && [region.fraction.numerator, region.fraction.denominator]
        .some(parts => parts.length < 1 || parts.length > 3)))
      throw new TRPCError({ code: "BAD_REQUEST", message: "OCR 답란 수가 올바르지 않습니다." });
    const children = region.samples ?? (region.fraction
      ? [...region.fraction.numerator, ...region.fraction.denominator] : []);
    if (children.some(rect => !validRect(rect, size) ||
      rect.x < region.x || rect.y < region.y ||
      rect.x + rect.width > region.x + region.width ||
      rect.y + rect.height > region.y + region.height))
      throw new TRPCError({ code: "BAD_REQUEST", message: "답란 세부 좌표가 OCR 영역 밖에 있습니다." });
  }
}

export async function recognizeMathAssignmentPage(input: { token: string; studentId: number; assignmentId: string;
  code: string; pageNumber: number; imageDataUrl: string; regions: MathOcrRegion[] }, provider: VisionProvider = googleVisionWords) {
  const assignment = await getPublicMathAssignment(input.token, input.studentId, input.assignmentId);
  if (assignment.code !== input.code || !assignment.canSubmit || input.pageNumber > Math.ceil(assignment.items.length / mathAssignmentRowsPerPageForVersion(assignment.answerSheetVersion)))
    throw new TRPCError({ code: "FORBIDDEN", message: "답안지 과제 또는 페이지가 올바르지 않습니다." });
  // Obtain credentials before quota reservation; unknown Vision outcomes after reservation stay counted.
  if (provider === googleVisionWords) await visionAuthHeaders();
  const { bytes, mimeType } = parseImageDataUrl(input.imageDataUrl);
  const size = dimensions(bytes, mimeType);
  if (!size || size.width < 1 || size.height < 1 || size.width > 10000 || size.height > 10000)
    throw new TRPCError({ code: "BAD_REQUEST", message: "OCR 사진 크기를 확인해 주세요." });
  validateMathOcrRegions(input.regions, size);
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
