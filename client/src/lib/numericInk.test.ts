import { describe, expect, it } from "vitest";
import { isolateNumericInk } from "./numericInk";

const glyphs: Record<string, string[]> = {
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

function inkImage(width = 120, height = 120) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const rect = (left: number, top: number, w: number, h: number) => {
    for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  };
  const text = (value: string, left: number, top: number, scale = 3) => {
    [...value].forEach((digit, index) => glyphs[digit]!.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel === "1") rect(left + (index * 7 + x) * scale, top + y * scale, scale, scale);
    })));
  };
  return { pixels, width, height, rect, text, recognize: () => isolateNumericInk(pixels, width, height) };
}

describe("isolating handwritten numeric answers", () => {
  it.each(["1/9", "29/35"])("separates the numerator and denominator of a vertical %s", value => {
    const image = inkImage();
    const [numerator, denominator] = value.split("/");
    image.text(numerator!, numerator!.length === 1 ? 50 : 39, 20);
    image.rect(34, 53, 50, 3);
    image.text(denominator!, denominator!.length === 1 ? 50 : 39, 69);
    const result = image.recognize();
    expect(result.fraction).toBeDefined();
    expect(result.fraction!.numerator.y).toBe(20);
    expect(result.fraction!.numerator.y + result.fraction!.numerator.height).toBeLessThan(53);
    expect(result.fraction!.denominator.y).toBe(69);
    expect(result.fraction!.denominator.y + result.fraction!.denominator.height).toBe(90);
    expect(result.pixels).toEqual(image.pixels);
  });

  it("keeps a small numerator near the crop edge when it belongs to a vertical fraction", () => {
    const image = inkImage();
    image.text("1", 54, 3, 2);
    image.rect(40, 39, 40, 3);
    image.text("9", 50, 60, 4);
    const result = image.recognize();
    expect(result.fraction).toBeDefined();
    expect(result.fraction!.numerator.y).toBe(3);
  });

  it.each(["4", "8"])("does not split the crossbar of %s into a fraction", digit => {
    const image = inkImage();
    image.text(digit, 45, 35, 6);
    expect(image.recognize().fraction).toBeUndefined();
  });

  it("keeps a minus sign without mistaking it for a fraction bar", () => {
    const image = inkImage();
    image.rect(15, 53, 17, 4);
    image.text("12", 42, 35, 5);
    const result = image.recognize();
    expect(result.fraction).toBeUndefined();
    expect(result.pixels[(54 * image.width + 20) * 4]).toBe(0);
    expect(result.bounds!.x).toBe(15);
  });

  it("removes adjacent-row fragments but retains a decimal point beside the digits", () => {
    const image = inkImage();
    image.text("2", 30, 45, 5);
    image.text("5", 73, 45, 5);
    image.rect(61, 76, 4, 4);
    image.rect(47, 0, 8, 4);
    image.rect(75, 116, 5, 4);
    const result = image.recognize();
    expect(result.pixels[(77 * image.width + 62) * 4]).toBe(0);
    expect(result.pixels[(2 * image.width + 50) * 4]).toBe(255);
    expect(result.pixels[(118 * image.width + 77) * 4]).toBe(255);
    expect(result.bounds!.y).toBe(45);
    expect(result.bounds!.y + result.bounds!.height).toBe(80);
    expect(result.fraction).toBeUndefined();
  });
});
