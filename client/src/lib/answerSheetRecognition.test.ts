import { afterEach, describe, expect, it } from "vitest";
import {
  answerSheetGeometry,
  detectAnswerSheetMarkers,
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
  toDataURL() { return "data:image/jpeg;base64,dGVzdA=="; }
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
    const center = coordinate(answerSheetGeometry.choiceXs[choice - 1]!, answerSheetGeometry.firstRowY + (ordinal - 1) * answerSheetGeometry.rowGap);
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) if (dx * dx + dy * dy <= 100) canvas.paint(center.x + dx, center.y + dy, 55);
  };
  fillBubble(1, 3);
  fillBubble(2, 2);
  fillBubble(2, 4);
  globalThis.document = { createElement: () => new FakeCanvas() } as unknown as Document;
  return { canvas, coordinate };
}

describe("printed answer sheet geometry", () => {
  it("matches the fixed 30-row A4 print layout", () => {
    expect(answerSheetGeometry.width).toBe(2100);
    expect(answerSheetGeometry.height).toBe(2970);
    expect(answerSheetGeometry.firstRowY + 29 * answerSheetGeometry.rowGap).toBe(2672);
  });

  it("finds four fiducials and reads one marked answer without guessing a double mark", () => {
    const { canvas } = makeSheet();
    const markers = detectAnswerSheetMarkers(canvas as unknown as HTMLCanvasElement);
    expect(markers).toHaveLength(4);
    const recognized = recognizeAnswerSheet(
      { canvas: canvas as unknown as HTMLCanvasElement, imageDataUrl: "", width: canvas.width, height: canvas.height },
      [{ ordinal: 1, answerType: "choice" }, { ordinal: 2, answerType: "choice" }, { ordinal: 3, answerType: "numeric" }],
      markers!
    );
    expect(recognized.answers).toEqual([
      { ordinal: 1, value: "3", uncertain: false },
      { ordinal: 2, value: "", uncertain: true },
    ]);
    expect(recognized.warnings.some(warning => warning.includes("2번"))).toBe(true);
    expect(recognized.regions.map(region => region.ordinal)).toEqual([3]);
    expect(recognized.numericImageDataUrl).toMatch(/^data:image\/jpeg/);
  });

  it("maps the printed coordinate system to a photographed page", () => {
    const { coordinate } = makeSheet();
    const h = sheetHomography(answerSheetGeometry.markers.map(point => coordinate(point.x, point.y)));
    expect(h[0]).toBeCloseTo(0.35, 6);
    expect(h[4]).toBeCloseTo(0.35, 6);
    expect(h[2]).toBeCloseTo(20, 6);
    expect(h[5]).toBeCloseTo(20, 6);
  });
});
