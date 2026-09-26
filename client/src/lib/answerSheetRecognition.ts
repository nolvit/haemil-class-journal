import sheetSpec from "./answer-sheet-spec.json";

/** Coordinates are in 0.1 mm on the A4 sheet printed by mathbank. Keep the JSON identical in both apps. */
export const answerSheetGeometry = {
  width: sheetSpec.page.width,
  height: sheetSpec.page.height,
  markers: sheetSpec.fiducials.centers.map(([x, y]) => ({ x, y })),
  firstRowY: sheetSpec.rows.firstCenterY,
  rowGap: sheetSpec.rows.pitchY,
  rowsPerPage: sheetSpec.rows.max,
  rowsPerColumn: sheetSpec.rows.perColumn,
  columns: sheetSpec.columns.map(column => ({ choiceXs: column.choiceXs, numericX: column.numericX })),
  choiceRadius: sheetSpec.choice.radius,
  numericBox: { width: sheetSpec.numeric.width, yOffset: sheetSpec.numeric.centerOffsetY, height: sheetSpec.numeric.height },
};

export type MarkerPoint = { x: number; y: number };
export type SheetItem = { ordinal: number; answerType: "choice" | "numeric" };
export type SheetAnswer = { ordinal: number; value: string; uncertain: boolean };
export type NumericRegion = { ordinal: number; x: number; y: number; width: number; height: number };

export type PreparedPhoto = {
  canvas: HTMLCanvasElement;
  imageDataUrl: string;
  width: number;
  height: number;
};

export type RecognizedSheet = {
  answers: SheetAnswer[];
  numericImageDataUrl: string | null;
  regions: NumericRegion[];
  warnings: string[];
  markers: MarkerPoint[];
};

export async function prepareAnswerSheetPhoto(file: File): Promise<PreparedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("사진을 읽을 수 없습니다.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, imageDataUrl: canvas.toDataURL("image/jpeg", 0.83), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function grayscale(data: Uint8ClampedArray, index: number) {
  const offset = index * 4;
  return (data[offset]! * 77 + data[offset + 1]! * 150 + data[offset + 2]! * 29) / 256;
}

/** Finds the four filled 6 mm corner squares. A manual four-tap fallback is provided by the UI. */
export function detectAnswerSheetMarkers(canvas: HTMLCanvasElement): MarkerPoint[] | null {
  const sample = document.createElement("canvas");
  const factor = Math.min(1, 1100 / Math.max(canvas.width, canvas.height));
  sample.width = Math.round(canvas.width * factor);
  sample.height = Math.round(canvas.height * factor);
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const width = sample.width;
  const height = sample.height;
  const pixels = context.getImageData(0, 0, width, height).data;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const candidates: Array<{ point: MarkerPoint; size: number }> = [];
  const minSide = Math.max(5, Math.round(Math.min(width, height) * 0.009));
  const maxSide = Math.max(50, Math.round(Math.min(width, height) * 0.075));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The four fiducials are within the outer quarter of a well framed photo.
      if (x > width * 0.38 && x < width * 0.62) continue;
      if (y > height * 0.32 && y < height * 0.68) continue;
      const start = y * width + x;
      if (visited[start] || grayscale(pixels, start) > 95) continue;
      visited[start] = 1;
      let head = 0;
      let tail = 1;
      queue[0] = start;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (head < tail) {
        const index = queue[head++]!;
        const px = index % width;
        const py = Math.floor(index / width);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (const next of [index - 1, index + 1, index - width, index + width]) {
          if (next < 0 || next >= width * height || visited[next]) continue;
          const nx = next % width;
          if (Math.abs(nx - px) > 1) continue;
          if (grayscale(pixels, next) > 95) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      const sideX = maxX - minX + 1;
      const sideY = maxY - minY + 1;
      if (sideX < minSide || sideY < minSide || sideX > maxSide || sideY > maxSide) continue;
      if (Math.max(sideX, sideY) / Math.min(sideX, sideY) > 1.4) continue;
      if (tail / (sideX * sideY) < 0.56) continue;
      candidates.push({ point: { x: (minX + maxX) / (2 * factor), y: (minY + maxY) / (2 * factor) }, size: (sideX + sideY) / (2 * factor) });
    }
  }
  if (candidates.length < 4) return null;
  const targets = [
    { x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 },
    { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 },
  ];
  const chosen: Array<{ point: MarkerPoint; size: number }> = [];
  for (const target of targets) {
    const matching = candidates
      .filter(candidate => !chosen.includes(candidate))
      .map(candidate => ({ candidate, distance: Math.hypot(candidate.point.x / canvas.width - target.x, candidate.point.y / canvas.height - target.y) }))
      .sort((a, b) => a.distance - b.distance);
    if (!matching[0] || matching[0].distance > 0.4) return null;
    chosen.push(matching[0].candidate);
  }
  const sizes = chosen.map(item => item.size);
  if (Math.max(...sizes) / Math.min(...sizes) > 2.5) return null;
  const points = chosen.map(item => item.point);
  const top = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
  const bottom = Math.hypot(points[2]!.x - points[3]!.x, points[2]!.y - points[3]!.y);
  const left = Math.hypot(points[3]!.x - points[0]!.x, points[3]!.y - points[0]!.y);
  const right = Math.hypot(points[2]!.x - points[1]!.x, points[2]!.y - points[1]!.y);
  if (Math.min(top, bottom, left, right) < Math.min(canvas.width, canvas.height) * 0.3) return null;
  return points;
}

/** Returns the sheet-to-photo projective transform for 4 fiducial centres. */
export function sheetHomography(points: MarkerPoint[]): number[] {
  if (points.length !== 4) throw new Error("답안지의 네 모서리 표시를 지정해 주세요.");
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = answerSheetGeometry.markers[i]!.x;
    const v = answerSheetGeometry.markers[i]!.y;
    const x = points[i]!.x;
    const y = points[i]!.y;
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row;
    if (Math.abs(rows[pivot]![col]!) < 1e-8) throw new Error("답안지 위치를 읽을 수 없습니다. 모서리 표시를 다시 지정해 주세요.");
    [rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!];
    const factor = rows[col]![col]!;
    for (let j = col; j <= 8; j++) rows[col]![j] = rows[col]![j]! / factor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const multiple = rows[row]![col]!;
      for (let j = col; j <= 8; j++) rows[row]![j] = rows[row]![j]! - multiple * rows[col]![j]!;
    }
  }
  return rows.map(row => row[8]!);
}

function mapPoint(h: number[], u: number, v: number): MarkerPoint {
  const denominator = h[6]! * u + h[7]! * v + 1;
  return { x: (h[0]! * u + h[1]! * v + h[2]!) / denominator, y: (h[3]! * u + h[4]! * v + h[5]!) / denominator };
}

function sampleGray(pixels: Uint8ClampedArray, width: number, height: number, point: MarkerPoint) {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 255;
  return grayscale(pixels, y * width + x);
}

/** Compare the five bubbles on the same row so a dark photo or screen moire does not mark every bubble. */
export function classifyChoiceMeans(means: number[]): { value: string; uncertain: boolean } {
  if (means.length !== 5 || means.some(value => !Number.isFinite(value))) return { value: "", uncertain: true };
  const sorted = means.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const strongest = sorted[0]!;
  const second = sorted[1]!;
  const baseline = sorted[2]!.value;
  const strength = baseline - strongest.value;
  const secondStrength = baseline - second.value;
  if (strength < 12) return { value: "", uncertain: false };
  if (strength >= 16 && second.value - strongest.value >= 12 &&
      !(secondStrength >= 16 && secondStrength >= strength * 0.5))
    return { value: String(strongest.index + 1), uncertain: false };
  return { value: "", uncertain: true };
}

/** Remove column-wide dark bands and the printed answer-box rules before sending handwriting to Vision. */
export function normalizeNumericPixels(source: Uint8ClampedArray, width: number, height: number) {
  const output = new Uint8ClampedArray(source.length);
  const histogram = new Uint16Array(256);
  for (let x = 0; x < width; x++) {
    histogram.fill(0);
    for (let y = 0; y < height; y++) histogram[Math.round(grayscale(source, y * width + x))]++;
    const target = Math.ceil(height * 0.85);
    let seen = 0;
    let background = 255;
    for (let level = 0; level < 256; level++) {
      seen += histogram[level]!;
      if (seen >= target) { background = level; break; }
    }
    for (let y = 0; y < height; y++) {
      const index = y * width + x;
      // Keep only dark pen strokes. Thin gray print rules are removed here;
      // the column baseline also prevents a screen-moire band becoming ink.
      const shade = grayscale(source, index) < Math.min(150, background - 40) ? 0 : 255;
      const offset = index * 4;
      output[offset] = output[offset + 1] = output[offset + 2] = shade;
      output[offset + 3] = 255;
    }
  }
  // The box's top/bottom rules run across nearly the entire crop. Vision can
  // treat those lines as text and miss the short handwritten answer entirely.
  // Restore only strokes that visibly continue above and below a rule.
  const ruleRows = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let darkCount = 0;
    for (let x = 0; x < width; x++) if (output[(y * width + x) * 4]! < 245) darkCount++;
    if (darkCount > width * 0.45) ruleRows[y] = 1;
  }
  for (let start = 0; start < height;) {
    if (!ruleRows[start]) { start++; continue; }
    let end = start;
    while (end + 1 < height && ruleRows[end + 1]) end++;
    for (let x = 0; x < width; x++) {
      const crossesRule = start > 0 && end + 1 < height &&
        output[((start - 1) * width + x) * 4]! < 130 &&
        output[((end + 1) * width + x) * 4]! < 130;
      const shade = crossesRule ? 0 : 255;
      for (let y = start; y <= end; y++) {
        const offset = (y * width + x) * 4;
        output[offset] = output[offset + 1] = output[offset + 2] = shade;
      }
    }
    start = end + 1;
  }
  return output;
}

/** The page number is selected by the user and never guessed from OCR text. */
export function recognizeAnswerSheet(prepared: PreparedPhoto, pageItems: SheetItem[], markers: MarkerPoint[]): RecognizedSheet {
  const h = sheetHomography(markers);
  const context = prepared.canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("사진을 읽을 수 없습니다.");
  const pixels = context.getImageData(0, 0, prepared.width, prepared.height).data;
  const answers: SheetAnswer[] = [];
  const warnings: string[] = [];
  const numericItems = pageItems.filter(item => item.answerType === "numeric");
  const cropWidth = 560;
  // Writing often touches or extends below the 9 mm printed box. The old
  // 74-unit inner crop cut off digit strokes on the photographed sheet.
  const cropHeight = answerSheetGeometry.numericBox.height + 40;
  const gap = 20;
  const mosaic = document.createElement("canvas");
  mosaic.width = cropWidth + gap * 2;
  mosaic.height = numericItems.length * (cropHeight + gap) + gap;
  const mosaicContext = mosaic.getContext("2d");
  if (!mosaicContext) throw new Error("답안 영역을 만들 수 없습니다.");
  mosaicContext.fillStyle = "white";
  mosaicContext.fillRect(0, 0, mosaic.width, mosaic.height);
  const regions: NumericRegion[] = [];

  for (const item of pageItems) {
    const pageIndex = (item.ordinal - 1) % answerSheetGeometry.rowsPerPage;
    const column = answerSheetGeometry.columns[Math.floor(pageIndex / answerSheetGeometry.rowsPerColumn)];
    if (!column) throw new Error("답안지 열 위치가 올바르지 않습니다.");
    const rowIndex = pageIndex % answerSheetGeometry.rowsPerColumn;
    const rowY = answerSheetGeometry.firstRowY + rowIndex * answerSheetGeometry.rowGap;
    if (item.answerType === "choice") {
      const sampleRadius = Math.round(answerSheetGeometry.choiceRadius * 0.56);
      const means = column.choiceXs.map(x => {
        let count = 0;
        let total = 0;
        for (let dy = -sampleRadius; dy <= sampleRadius; dy += 3) for (let dx = -sampleRadius; dx <= sampleRadius; dx += 3) {
          if (dx * dx + dy * dy > sampleRadius * sampleRadius) continue;
          count++;
          total += sampleGray(pixels, prepared.width, prepared.height, mapPoint(h, x + dx, rowY + dy));
        }
        return total / count;
      });
      const result = classifyChoiceMeans(means);
      answers.push({ ordinal: item.ordinal, ...result });
      if (result.uncertain) warnings.push(`${item.ordinal}번 마킹이 흐리거나 겹쳐 보입니다. 답을 직접 확인해 주세요.`);
      continue;
    }
    const index = numericItems.findIndex(candidate => candidate.ordinal === item.ordinal);
    const box = answerSheetGeometry.numericBox;
    const output = mosaicContext.createImageData(cropWidth, cropHeight);
    for (let py = 0; py < cropHeight; py++) for (let px = 0; px < cropWidth; px++) {
      const u = column.numericX + 12 + (px / cropWidth) * (box.width - 24);
      const v = rowY + box.yOffset - 15 + (py / cropHeight) * cropHeight;
      const source = mapPoint(h, u, v);
      const sx = Math.round(source.x);
      const sy = Math.round(source.y);
      const dest = (py * cropWidth + px) * 4;
      if (sx < 0 || sy < 0 || sx >= prepared.width || sy >= prepared.height) {
        output.data[dest] = output.data[dest + 1] = output.data[dest + 2] = 255;
      } else {
        const src = (sy * prepared.width + sx) * 4;
        output.data[dest] = pixels[src]!;
        output.data[dest + 1] = pixels[src + 1]!;
        output.data[dest + 2] = pixels[src + 2]!;
      }
      output.data[dest + 3] = 255;
    }
    const y = gap + index * (cropHeight + gap);
    output.data.set(normalizeNumericPixels(output.data, cropWidth, cropHeight));
    mosaicContext.putImageData(output, gap, y);
    regions.push({ ordinal: item.ordinal, x: gap, y, width: cropWidth, height: cropHeight });
  }
  return { answers, numericImageDataUrl: numericItems.length ? mosaic.toDataURL("image/png") : null, regions, warnings, markers };
}
