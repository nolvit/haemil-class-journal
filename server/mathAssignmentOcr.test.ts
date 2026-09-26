import { describe, expect, it, vi } from "vitest";
import { googleVisionWords, mapVisionWordsToRegions, validateMathOcrRegions } from "./mathAssignmentOcr";
import { mathOcrRegionSchema } from "./routers/mathAssignments";
import type { MathOcrRect, MathOcrRegion } from "./mathAssignmentStore";

const rect = (y: number): MathOcrRect => ({ x: 0, y, width: 100, height: 25 });
const glyph = (text: string, y: number, confidence = 0.95, x = 10) =>
  ({ text, x, y: y + 10, confidence });

describe("numeric OCR sample reconciliation", () => {
  it("flags a high-confidence 5/2 when another sample reads 5/12", () => {
    const samples = [rect(0), rect(40), rect(80)];
    const result = mapVisionWordsToRegions([
      glyph("5/2", 0, 0.99), glyph("5/12", 40, 0.93), glyph("5/12", 80, 0.87),
    ], [{ ordinal: 31, x: 0, y: 0, width: 100, height: 105, samples }]);
    expect(result).toEqual([{ ordinal: 31, value: "5/12", confidence: "uncertain" }]);
  });

  it("accepts either one strong unopposed sample or matching weaker samples", () => {
    const regions: MathOcrRegion[] = [
      { ordinal: 1, x: 0, y: 0, width: 100, height: 105, samples: [rect(0), rect(40), rect(80)] },
      { ordinal: 2, x: 110, y: 0, width: 100, height: 65,
        samples: [{ x: 110, y: 0, width: 100, height: 25 }, { x: 110, y: 40, width: 100, height: 25 }] },
    ];
    const result = mapVisionWordsToRegions([
      glyph("12", 0, 0.96), glyph("b", 40, 0.99), glyph("नै", 80, 0.99),
      glyph("600", 0, 0.7, 120), glyph("600", 40, 0.9, 120),
    ], regions);
    expect(result).toEqual([
      { ordinal: 1, value: "12", confidence: "high" },
      { ordinal: 2, value: "600", confidence: "high" },
    ]);
  });

  it("rejects letters and units in new samples even when legacy regions allow supported units", () => {
    const result = mapVisionWordsToRegions([
      glyph("12cm", 0), glyph("b", 40), glyph("1/2", 80), glyph("②", 120),
    ], [
      { ordinal: 1, x: 0, y: 0, width: 100, height: 25 },
      { ordinal: 2, x: 0, y: 40, width: 100, height: 25, samples: [rect(40)] },
      { ordinal: 3, x: 0, y: 80, width: 100, height: 25, samples: [rect(80)] },
      { ordinal: 4, x: 0, y: 120, width: 100, height: 25, samples: [rect(120)] },
    ]);
    expect(result).toEqual([
      { ordinal: 1, value: "12cm", confidence: "high" },
      { ordinal: 2, value: "", confidence: "uncertain" },
      { ordinal: 3, value: "1/2", confidence: "high" },
      { ordinal: 4, value: "", confidence: "uncertain" },
    ]);
  });

  it("assembles separately read fraction integers and refuses a zero denominator", () => {
    const fraction = { numerator: [rect(0), rect(40)], denominator: [rect(80), rect(120)] };
    const result = mapVisionWordsToRegions([
      glyph("5", 0, 0.91), glyph("5", 40, 0.87),
      glyph("12", 80, 0.92), glyph("12", 120, 0.89),
      glyph("0", 200, 0.99), glyph("0", 240, 0.99),
    ], [
      { ordinal: 31, x: 0, y: 0, width: 100, height: 145, fraction },
      { ordinal: 32, x: 0, y: 200, width: 100, height: 65,
        fraction: { numerator: [{ ...rect(200), y: 200 }], denominator: [{ ...rect(240), y: 240 }] } },
    ]);
    expect(result).toEqual([
      { ordinal: 31, value: "5/12", confidence: "high" },
      { ordinal: 32, value: "", confidence: "uncertain" },
    ]);
  });

  it("keeps a conflicting fraction component uncertain", () => {
    const result = mapVisionWordsToRegions([
      glyph("5", 0, 0.98), glyph("5", 40, 0.92),
      glyph("2", 80, 0.99), glyph("12", 120, 0.93),
    ], [{ ordinal: 31, x: 0, y: 0, width: 100, height: 145,
      fraction: { numerator: [rect(0), rect(40)], denominator: [rect(80), rect(120)] } }]);
    expect(result).toEqual([{ ordinal: 31, value: "5/2", confidence: "uncertain" }]);
  });
});

describe("OCR rectangle validation", () => {
  it("rejects subrectangles outside the image or outer region and mixed modes", () => {
    const outer = { ordinal: 1, x: 10, y: 10, width: 100, height: 100 };
    const valid = { ...outer, samples: [{ x: 20, y: 20, width: 50, height: 30 }] };
    expect(() => validateMathOcrRegions([valid], { width: 200, height: 200 })).not.toThrow();
    expect(() => validateMathOcrRegions([{ ...outer, samples: [{ x: 5, y: 20, width: 50, height: 30 }] }],
      { width: 200, height: 200 })).toThrow();
    expect(() => validateMathOcrRegions([{ ...outer, fraction: {
      numerator: [{ x: 20, y: 20, width: 50, height: 30 }],
      denominator: [{ x: 20, y: 180, width: 50, height: 30 }],
    } }], { width: 200, height: 200 })).toThrow();
    expect(() => validateMathOcrRegions([{ ...valid, fraction: {
      numerator: [{ x: 20, y: 20, width: 50, height: 30 }],
      denominator: [{ x: 20, y: 60, width: 50, height: 30 }],
    } }], { width: 200, height: 200 })).toThrow();
    expect(() => validateMathOcrRegions([{ ...outer, samples: [] }], { width: 200, height: 200 })).toThrow();
  });

  it("requires one to three strict rectangles for each OCR mode", () => {
    const base = { ordinal: 1, x: 0, y: 0, width: 100, height: 100 };
    expect(mathOcrRegionSchema.safeParse(base).success).toBe(true);
    expect(mathOcrRegionSchema.safeParse({ ...base, samples: [] }).success).toBe(false);
    expect(mathOcrRegionSchema.safeParse({ ...base, samples: [rect(0), rect(20), rect(40), rect(60)] }).success).toBe(false);
    expect(mathOcrRegionSchema.safeParse({ ...base, fraction: { numerator: [], denominator: [rect(40)] } }).success).toBe(false);
    expect(mathOcrRegionSchema.safeParse({ ...base, samples: [rect(0)], fraction: {
      numerator: [rect(0)], denominator: [rect(40)],
    } }).success).toBe(false);
    expect(mathOcrRegionSchema.safeParse({ ...base, samples: [{ ...rect(0), extra: 1 }] }).success).toBe(false);
  });
});

describe("Vision symbol geometry", () => {
  it("uses each symbol center and confidence and ignores a rotated character", async () => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-vision-key");
    const box = (x: number, y: number, rotated = false) => ({ vertices: rotated
      ? [{ x, y }, { x: x + 2, y: y + 12 }, { x: x + 12, y: y + 14 }, { x: x + 10, y: y + 2 }]
      : [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 12 }, { x, y: y + 12 }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ responses: [{
      fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words: [{ confidence: 0.88,
        symbols: [
          { text: "5", confidence: 0.97, boundingBox: box(10, 20) },
          { text: "/", boundingBox: box(22, 20) },
          { text: "1", confidence: 0.99, boundingBox: box(34, 20, true) },
          { text: "2", confidence: 0.93, boundingBox: box(46, 20) },
        ],
      }] }] }] }] },
    }] }), { status: 200 })));
    try {
      expect(await googleVisionWords("c2FtcGxl")).toEqual([
        { text: "5", confidence: 0.97, x: 15, y: 26 },
        { text: "/", confidence: 0.88, x: 27, y: 26 },
        { text: "2", confidence: 0.93, x: 51, y: 26 },
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
