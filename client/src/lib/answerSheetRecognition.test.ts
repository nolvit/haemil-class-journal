import { afterEach, describe, expect, it } from "vitest";
import {
  answerSheetGeometry,
  answerSheetGeometryForVersion,
  classifyChoiceMeans,
  detectAnswerSheetMarkers,
  normalizeNumericPixels,
  recognizeAnswerSheet,
  sheetHomography,
} from "./answerSheetRecognition";

class FakeCanvas {
  width: number;
  height: number;
  private buffer: Uint8ClampedArray;
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
    this.buffer = new Uint8ClampedArray(width * height * 4);
    this.buffer.fill(255);
  }
  pixels() {
    if (this.buffer.length !== this.width * this.height * 4) {
      this.buffer = new Uint8ClampedArray(this.width * this.height * 4);
      this.buffer.fill(255);
    }
    return this.buffer;
  }
  paint(x: number, y: number, dark = 20) {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const offset = (py * this.width + px) * 4;
    const data = this.pixels();
    data[offset] = data[offset + 1] = data[offset + 2] = dark;
    data[offset + 3] = 255;
  }
  getContext() {
    const canvas = this;
    let fillStyle = "black";
    return {
      drawImage(source: FakeCanvas, ...args: number[]) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8 ? args :
          [0, 0, source.width, source.height, args[0] ?? 0, args[1] ?? 0, args[2] ?? source.width, args[3] ?? source.height];
        for (let y = Math.floor(dy); y < Math.ceil(dy + dh); y++) for (let x = Math.floor(dx); x < Math.ceil(dx + dw); x++) {
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const px = Math.min(source.width - 1, Math.max(0, Math.floor(sx + (x - dx) * sw / dw)));
          const py = Math.min(source.height - 1, Math.max(0, Math.floor(sy + (y - dy) * sh / dh)));
          canvas.paint(x, y, source.pixels()[(py * source.width + px) * 4]!);
        }
      },
      getImageData() { return { data: canvas.pixels() } as ImageData; },
      createImageData(width: number, height: number) { return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData; },
      putImageData(image: ImageData, left: number, top: number) {
        const target = canvas.pixels();
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          const sourceOffset = (y * image.width + x) * 4;
          const targetOffset = ((top + y) * canvas.width + left + x) * 4;
          target.set(image.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      },
      fillRect(left: number, top: number, width: number, height: number) {
        const shade = fillStyle === "white" ? 255 : 0;
        for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) canvas.paint(x, y, shade);
      },
      // OCR labels lie outside the asserted answer regions; their glyph rasterization is irrelevant here.
      fillText() {},
      set fillStyle(value: string) { fillStyle = value; },
      set font(_value: string) {},
    } as unknown as CanvasRenderingContext2D;
  }
  toDataURL() { return "data:image/png;base64,dGVzdA=="; }
}

const priorDocument = globalThis.document;
afterEach(() => { globalThis.document = priorDocument; });

function makeSheet(version = 3, markChoices = true) {
  const geometry = answerSheetGeometryForVersion(version);
  const canvas = new FakeCanvas(800, 1100);
  canvas.pixels().fill(255);
  const scale = 0.35;
  const offset = 20;
  const coordinate = (x: number, y: number) => ({ x: offset + x * scale, y: offset + y * scale });
  for (const marker of geometry.markers) {
    const center = coordinate(marker.x, marker.y);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) canvas.paint(center.x + dx, center.y + dy);
  }
  const fillBubble = (ordinal: number, choice: number) => {
    const localIndex = (ordinal - 1) % geometry.rowsPerPage;
    const column = geometry.columns[Math.floor(localIndex / geometry.rowsPerColumn)]!;
    const center = coordinate(column.choiceXs[choice - 1]!, geometry.firstRowY + localIndex % geometry.rowsPerColumn * geometry.rowGap);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) if (dx * dx + dy * dy <= 100) canvas.paint(center.x + dx, center.y + dy, 55);
  };
  if (markChoices) {
    fillBubble(1, 3);
    fillBubble(2, 2);
    fillBubble(2, 4);
    fillBubble(geometry.rowsPerColumn + 1, 5);
  }
  const created: FakeCanvas[] = [];
  globalThis.document = { createElement: () => {
    const element = new FakeCanvas();
    created.push(element);
    return element;
  } } as unknown as Document;
  return { canvas, coordinate, created, geometry };
}

describe("printed answer sheet geometry", () => {
  it("preserves legacy 40-item sheets while using taller numeric boxes on new 20-item sheets", () => {
    expect(answerSheetGeometry.width).toBe(2100);
    expect(answerSheetGeometry.height).toBe(2970);
    expect(answerSheetGeometry.rowsPerPage).toBe(20);
    expect(answerSheetGeometry.rowsPerColumn).toBe(10);
    expect(answerSheetGeometry.columns).toHaveLength(2);
    expect(answerSheetGeometry.numericBox).toEqual({ width: 320, height: 180, yOffset: -90 });
    const legacy = answerSheetGeometryForVersion(3);
    expect(legacy.rowsPerPage).toBe(40);
    expect(legacy.rowsPerColumn).toBe(20);
    expect(legacy.firstRowY + (legacy.rowsPerColumn - 1) * legacy.rowGap).toBe(2520);
    expect(legacy.numericBox).toEqual({ width: 560, height: 90, yOffset: -45 });
    expect(answerSheetGeometry.columns.map(column => column.choiceXs)).toEqual(legacy.columns.map(column => column.choiceXs));
    expect(answerSheetGeometry.choiceRadius).toBe(legacy.choiceRadius);
  });

  it.each([3, 4])("reads both columns and rejects a double mark on a v%s sheet", version => {
    const { canvas, geometry } = makeSheet(version);
    const markers = detectAnswerSheetMarkers(canvas as unknown as HTMLCanvasElement);
    expect(markers).toHaveLength(4);
    const recognized = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      [{ ordinal: 1, answerType: "choice" }, { ordinal: 2, answerType: "choice" }, { ordinal: 3, answerType: "numeric" }, { ordinal: geometry.rowsPerColumn + 1, answerType: "choice" }],
      markers!, version
    );
    expect(recognized.answers).toEqual([
      { ordinal: 1, value: "3", uncertain: false },
      { ordinal: 2, value: "", uncertain: true },
      { ordinal: geometry.rowsPerColumn + 1, value: "5", uncertain: false },
    ]);
    expect(recognized.warnings.some(warning => warning.includes("2번"))).toBe(true);
    expect(recognized.regions.map(region => region.ordinal)).toEqual([3]);
    expect(recognized.numericImageDataUrl).toMatch(/^data:image\/png/);
  });

  it("maps the printed coordinate system to a photographed page", () => {
    const { coordinate } = makeSheet();
    const h = sheetHomography(answerSheetGeometry.markers.map(point => coordinate(point.x, point.y)));
    expect(h[0]).toBeCloseTo(0.35, 6);
    expect(h[4]).toBeCloseTo(0.35, 6);
    expect(h[2]).toBeCloseTo(20, 6);
    expect(h[5]).toBeCloseTo(20, 6);
  });

  it("reads marked bubbles relative to their row despite strong image banding", () => {
    const measuredRows: Array<[number[], string]> = [
      [[149, 149, 171, 105, 163], "4"], [[165, 164, 130, 173, 173], "3"],
      [[169, 135, 172, 173, 163], "2"], [[151, 170, 173, 175, 181], "1"],
      [[180, 176, 168, 175, 112], "5"], [[178, 176, 177, 173, 157], "5"],
      [[169, 175, 181, 185, 154], "5"], [[182, 101, 177, 165, 179], "2"],
      [[164, 162, 184, 146, 167], "4"], [[175, 166, 169, 171, 113], "5"],
      [[173, 168, 80, 174, 183], "3"], [[151, 171, 155, 133, 163], "4"],
      [[81, 149, 158, 153, 148], "1"], [[138, 146, 70, 145, 139], "3"],
    ];
    for (const [means, expected] of measuredRows)
      expect(classifyChoiceMeans(means)).toEqual({ value: expected, uncertain: false });
    expect(classifyChoiceMeans([230, 227, 232, 228, 231])).toEqual({ value: "", uncertain: false });
    expect(classifyChoiceMeans([230, 50, 233, 55, 229])).toEqual({ value: "", uncertain: true });
  });

  it("keeps handwriting above and below the printed numeric box", () => {
    const { canvas, coordinate, created, geometry } = makeSheet();
    const column = geometry.columns[0]!;
    const centerX = column.numericX + geometry.numericBox.width / 2;
    const rowY = geometry.firstRowY + 2 * geometry.rowGap;
    for (const offsetY of [-50, 60]) {
      const point = coordinate(centerX, rowY + offsetY);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) canvas.paint(point.x + dx, point.y + dy);
    }
    const result = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      [{ ordinal: 3, answerType: "numeric" }],
      geometry.markers.map(marker => coordinate(marker.x, marker.y)), 3
    );
    const mosaic = created.find(canvas => canvas.width === 1800)!;
    const region = result.regions[0]!;
    expect(region.samples).toHaveLength(3);
    const sample = region.samples![1]!;
    const hasInk = (fromY: number, toY: number) => {
      const pixels = mosaic.pixels();
      for (let y = sample.y + fromY; y < sample.y + toY; y++) for (let x = sample.x; x < sample.x + sample.width; x++)
        if (pixels[(y * mosaic.width + x) * 4]! < 100) return true;
      return false;
    };
    expect(hasInk(0, 35)).toBe(true);
    expect(hasInk(85, 120)).toBe(true);
  });

  it("keeps three OCR views and split fraction regions inside their answer region within the image limit", () => {
    const { canvas, coordinate, created, geometry } = makeSheet(3, false);
    const paintRect = (x: number, y: number, width: number, height: number) => {
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
        const point = coordinate(x + dx, y + dy);
        canvas.paint(point.x, point.y, 0);
      }
    };
    const items = Array.from({ length: 40 }, (_, index) => ({ ordinal: index + 1, answerType: "numeric" as const }));
    for (const item of items) {
      const local = item.ordinal - 1;
      const column = geometry.columns[Math.floor(local / geometry.rowsPerColumn)]!;
      const centerX = column.numericX + geometry.numericBox.width / 2;
      const centerY = geometry.firstRowY + local % geometry.rowsPerColumn * geometry.rowGap;
      // Upright 1 over a disconnected fraction bar and a looped 9.
      paintRect(centerX - 3, centerY - 43, 7, 22);
      paintRect(centerX - 28, centerY - 7, 56, 4);
      paintRect(centerX - 12, centerY + 17, 25, 5);
      paintRect(centerX - 12, centerY + 17, 5, 16);
      paintRect(centerX + 8, centerY + 17, 5, 29);
      paintRect(centerX - 12, centerY + 29, 25, 5);
    }
    const result = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      items, geometry.markers.map(marker => coordinate(marker.x, marker.y)), 3
    );
    const mosaic = created.find(candidate => candidate.width === 1800)!;
    expect(result.regions).toHaveLength(40);
    expect(mosaic.height).toBeLessThanOrEqual(9600);
    expect(result.answers).toEqual([]);
    for (const region of result.regions) {
      expect(region.fraction).toBeDefined();
      expect(region.fraction!.numerator).toHaveLength(3);
      expect(region.fraction!.denominator).toHaveLength(3);
      for (const sample of [...region.fraction!.numerator, ...region.fraction!.denominator]) {
        expect(sample.x).toBeGreaterThanOrEqual(region.x);
        expect(sample.y).toBeGreaterThanOrEqual(region.y);
        expect(sample.x + sample.width).toBeLessThanOrEqual(region.x + region.width);
        expect(sample.y + sample.height).toBeLessThanOrEqual(region.y + region.height);
        expect(sample.height).toBeGreaterThan(0);
      }
      expect(region.fraction!.numerator[0]!.y + region.fraction!.numerator[0]!.height)
        .toBeLessThan(region.fraction!.denominator[0]!.y);
      expect(region.y + region.height).toBeLessThanOrEqual(mosaic.height);
    }
  });

  it("removes column-wide stripes while preserving handwriting", () => {
    const width = 8, height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const gray = (y === 4 || y === 5) && (x === 2 || x === 3) ? 10 : x % 2 ? 225 : 75;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
    }
    const clean = normalizeNumericPixels(pixels, width, height);
    const grayAt = (x: number, y: number) => clean[(y * width + x) * 4]!;
    expect(grayAt(0, 1)).toBe(255);
    expect(grayAt(1, 1)).toBe(255);
    expect(grayAt(2, 4)).toBeLessThan(80);
    expect(grayAt(3, 4)).toBe(0);
  });

  it("removes printed horizontal rules while preserving a crossing pen stroke", () => {
    const width = 100, height = 40;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const gray = x >= 45 && x <= 49 && y >= 5 && y <= 25 ? 20 : y === 12 || y === 13 ? 180 : 245;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
    }
    const clean = normalizeNumericPixels(pixels, width, height);
    const grayAt = (x: number, y: number) => clean[(y * width + x) * 4]!;
    expect(grayAt(10, 12)).toBe(255);
    expect(grayAt(47, 12)).toBe(0);
    expect(grayAt(47, 25)).toBeLessThan(80);
  });
});
