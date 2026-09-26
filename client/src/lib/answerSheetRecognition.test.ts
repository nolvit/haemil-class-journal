import { afterEach, describe, expect, it } from "vitest";
import {
  answerSheetGeometry,
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
    return {
      drawImage(source: FakeCanvas) {
        expect(canvas.width).toBe(source.width);
        expect(canvas.height).toBe(source.height);
        canvas.pixels().set(source.pixels());
      },
      getImageData() { return { data: canvas.pixels() } as ImageData; },
      createImageData(width: number, height: number) { return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData; },
      putImageData() {},
      fillRect() {},
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D;
  }
  toDataURL() { return "data:image/png;base64,dGVzdA=="; }
}

const priorDocument = globalThis.document;
afterEach(() => { globalThis.document = priorDocument; });

function makeSheet() {
  const canvas = new FakeCanvas(800, 1100);
  canvas.pixels().fill(255);
  const scale = 0.35;
  const offset = 20;
  const coordinate = (x: number, y: number) => ({ x: offset + x * scale, y: offset + y * scale });
  for (const marker of answerSheetGeometry.markers) {
    const center = coordinate(marker.x, marker.y);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) canvas.paint(center.x + dx, center.y + dy);
  }
  const fillBubble = (ordinal: number, choice: number) => {
    const localIndex = (ordinal - 1) % answerSheetGeometry.rowsPerPage;
    const column = answerSheetGeometry.columns[Math.floor(localIndex / answerSheetGeometry.rowsPerColumn)]!;
    const center = coordinate(column.choiceXs[choice - 1]!, answerSheetGeometry.firstRowY + localIndex % answerSheetGeometry.rowsPerColumn * answerSheetGeometry.rowGap);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) if (dx * dx + dy * dy <= 100) canvas.paint(center.x + dx, center.y + dy, 55);
  };
  fillBubble(1, 3);
  fillBubble(2, 2);
  fillBubble(2, 4);
  fillBubble(21, 5);
  globalThis.document = { createElement: () => new FakeCanvas() } as unknown as Document;
  return { canvas, coordinate };
}

describe("printed answer sheet geometry", () => {
  it("matches the compact two-column, 40-item A4 print layout", () => {
    expect(answerSheetGeometry.width).toBe(2100);
    expect(answerSheetGeometry.height).toBe(2970);
    expect(answerSheetGeometry.rowsPerPage).toBe(40);
    expect(answerSheetGeometry.rowsPerColumn).toBe(20);
    expect(answerSheetGeometry.columns).toHaveLength(2);
    expect(answerSheetGeometry.firstRowY + (answerSheetGeometry.rowsPerColumn - 1) * answerSheetGeometry.rowGap).toBe(2520);
  });

  it("finds four fiducials and reads one marked answer without guessing a double mark", () => {
    const { canvas } = makeSheet();
    const markers = detectAnswerSheetMarkers(canvas as unknown as HTMLCanvasElement);
    expect(markers).toHaveLength(4);
    const recognized = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      [{ ordinal: 1, answerType: "choice" }, { ordinal: 2, answerType: "choice" }, { ordinal: 3, answerType: "numeric" }, { ordinal: 21, answerType: "choice" }],
      markers!
    );
    expect(recognized.answers).toEqual([
      { ordinal: 1, value: "3", uncertain: false },
      { ordinal: 2, value: "", uncertain: true },
      { ordinal: 21, value: "5", uncertain: false },
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

  it("removes column-wide stripes while preserving handwriting", () => {
    const width = 8, height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const gray = y === 4 || y === 5 ? 10 : x % 2 ? 225 : 75;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
    }
    const clean = normalizeNumericPixels(pixels, width, height);
    const grayAt = (x: number, y: number) => clean[(y * width + x) * 4]!;
    expect(grayAt(0, 1)).toBe(255);
    expect(grayAt(1, 1)).toBe(255);
    expect(grayAt(0, 4)).toBeLessThan(80);
    expect(grayAt(1, 4)).toBe(0);
  });
});
