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
      putImageData(image: ImageData, left: number, top: number) {
        const target = canvas.pixels();
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          const sourceOffset = (y * image.width + x) * 4;
          const targetOffset = ((top + y) * canvas.width + left + x) * 4;
          target.set(image.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      },
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
  const created: FakeCanvas[] = [];
  globalThis.document = { createElement: () => {
    const element = new FakeCanvas();
    created.push(element);
    return element;
  } } as unknown as Document;
  return { canvas, coordinate, created };
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

  it("keeps handwriting above and below the printed numeric box", () => {
    const { canvas, coordinate, created } = makeSheet();
    const column = answerSheetGeometry.columns[0]!;
    const centerX = column.numericX + answerSheetGeometry.numericBox.width / 2;
    const rowY = answerSheetGeometry.firstRowY + 2 * answerSheetGeometry.rowGap;
    for (const offsetY of [-50, 60]) {
      const point = coordinate(centerX, rowY + offsetY);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) canvas.paint(point.x + dx, point.y + dy);
    }
    const result = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      [{ ordinal: 3, answerType: "numeric" }],
      answerSheetGeometry.markers.map(marker => coordinate(marker.x, marker.y))
    );
    const mosaic = created.at(-1)!;
    const region = result.regions[0]!;
    const hasInk = (fromY: number, toY: number) => {
      const pixels = mosaic.pixels();
      for (let y = region.y + fromY; y < region.y + toY; y++) for (let x = region.x; x < region.x + region.width; x++)
        if (pixels[(y * mosaic.width + x) * 4]! < 100) return true;
      return false;
    };
    expect(hasInk(0, 20)).toBe(true);
    expect(hasInk(region.height - 20, region.height)).toBe(true);
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
