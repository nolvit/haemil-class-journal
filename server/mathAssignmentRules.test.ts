import { describe, expect, it, vi } from "vitest";
import manifest from "../shared/autoGradeAllowlist.json";
import { currentMathOcrMonth } from "./mathAssignmentStore";
import { gradeAnswer } from "./mathAssignmentRules";
import { googleVisionWords, mapVisionWordsToRegions } from "./mathAssignmentOcr";

const numeric = (answerKey: string, submittedAnswer: string, gradingRule: "value" | "ratio" | "exact" = "value", exactForm = false) =>
  gradeAnswer({ answerType: "numeric", answerKey, submittedAnswer, gradingRule, exactForm });

describe("frozen auto-grade catalog", () => {
  it("contains exactly the approved 1,484 unique question IDs", () => {
    expect(manifest.questionIds).toHaveLength(1484);
    expect(new Set(manifest.questionIds).size).toBe(1484);
    expect(manifest.questionIds.every(id => typeof id === "string" && id.length > 0)).toBe(true);
  });
});

describe("math answer grading", () => {
  it("matches equivalent decimals and fractions exactly as rational values", () => {
    expect(numeric("1/2", "2/4")).toBe(true);
    expect(numeric("1/2", "0.5")).toBe(true);
    expect(numeric("-1/2", "-0.5")).toBe(true);
    expect(numeric("1/3", "0.333333")).toBe(false);
    expect(numeric("1/2", "1/0")).toBe(false);
  });
  it("requires an identical unit while accepting equivalent numbers", () => {
    expect(numeric("1/2cm²", "0.5cm2")).toBe(true);
    expect(numeric("1/2cm", "0.5m")).toBe(false);
  });
  it("compares two- and three-term ratios", () => {
    expect(numeric("1:2", "2:4", "ratio")).toBe(true);
    expect(numeric("1:2:3", "2:4:6", "ratio")).toBe(true);
    expect(numeric("1:2:3", "2:4:5", "ratio")).toBe(false);
    expect(numeric("1:2", "2:4:6", "ratio")).toBe(false);
  });
  it("honors exact-form conditions and normalizes choice symbols", () => {
    expect(numeric("1/2", "2/4", "exact", true)).toBe(false);
    expect(gradeAnswer({ answerType: "choice", answerKey: "①", submittedAnswer: "1", gradingRule: "exact", exactForm: false })).toBe(true);
  });
  it("uses a conservative Pacific monthly quota boundary", () => {
    expect(currentMathOcrMonth(new Date("2026-10-01T07:59:59Z"))).toBe("2026-09");
    expect(currentMathOcrMonth(new Date("2026-10-01T08:00:00Z"))).toBe("2026-10");
  });
});

describe("numeric OCR region mapping", () => {
  it("keeps words inside their printed answer rows and flags uncertain recognition", () => {
    const answers = mapVisionWordsToRegions([
      { text: "1", x: 10, y: 10, confidence: 0.99 },
      { text: "/2", x: 22, y: 11, confidence: 0.95 },
      { text: "cm", x: 35, y: 10, confidence: 0.99 },
      { text: "4", x: 10, y: 110, confidence: 0.5 },
    ], [
      { ordinal: 1, x: 0, y: 0, width: 80, height: 40 },
      { ordinal: 2, x: 0, y: 90, width: 80, height: 40 },
      { ordinal: 3, x: 0, y: 180, width: 80, height: 40 },
    ]);
    expect(answers).toEqual([
      { ordinal: 1, value: "1/2cm", confidence: "high" },
      { ordinal: 2, value: "4", confidence: "uncertain" },
      { ordinal: 3, value: "", confidence: "uncertain" },
    ]);
  });
});

describe("Cloud Vision authentication", () => {
  it("sends the restricted API key in a header without exposing it in the URL", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-vision-key");
    vi.stubEnv("GOOGLE_VISION_SERVICE_ACCOUNT_JSON", "");
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://vision.googleapis.com/v1/images:annotate");
      expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-vision-key", "Content-Type": "application/json" });
      expect(init?.headers).not.toHaveProperty("Authorization");
      return new Response(JSON.stringify({ responses: [{}] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await googleVisionWords("c2FtcGxl")).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
