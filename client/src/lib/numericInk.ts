export type InkBox = { x: number; y: number; width: number; height: number };
export type NumericInk = { pixels: Uint8ClampedArray; bounds: InkBox | null; fraction?: { numerator: InkBox; denominator: InkBox } };

/** Remove fragments from adjacent rows without dropping decimal points or minus signs. */
export function isolateNumericInk(source: Uint8ClampedArray, width: number, height: number): NumericInk {
  const pixels = new Uint8ClampedArray(source);
  const visited = new Uint8Array(width * height);
  const groups: Array<{ indices: number[]; x0: number; y0: number; x1: number; y1: number }> = [];
  const black = (x: number, y: number) => pixels[(y * width + x) * 4]! < 128;
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4]! >= 128) continue;
    const indices = [start]; visited[start] = 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let head = 0; head < indices.length; head++) {
      const index = indices[head]!, x = index % width, y = Math.floor(index / width);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited[next] || !black(nx, ny)) continue;
        visited[next] = 1; indices.push(next);
      }
    }
    groups.push({ indices, x0, y0, x1, y1 });
  }
  const largest = Math.max(0, ...groups.map(group => group.indices.length));
  const possibleBars = groups.filter(group => group.x1 - group.x0 >= 16 &&
    group.x1 - group.x0 > (group.y1 - group.y0 + 1) * 3 &&
    group.y0 > height * 0.2 && group.y1 < height * 0.8);
  for (const group of groups) {
    const edge = group.y1 < height * 0.18 || group.y0 > height * 0.82;
    const possibleNumerator = possibleBars.some(bar => group.y1 < bar.y0 &&
      (group.x0 + group.x1) / 2 >= bar.x0 && (group.x0 + group.x1) / 2 <= bar.x1 &&
      groups.some(lower => lower.y0 > bar.y1 && lower.y1 - lower.y0 >= 8));
    if (group.indices.length < 3 || (edge && !possibleNumerator && group.indices.length < largest * 0.35 && group.y1 - group.y0 < height * 0.22)) {
      for (const index of group.indices) pixels.fill(255, index * 4, index * 4 + 4);
    }
  }
  const boundsWithin = (top: number, bottom: number): InkBox | null => {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) if (black(x, y)) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  };
  const bounds = boundsWithin(0, height);
  if (!bounds || bounds.height < 24) return { pixels, bounds };
  const counts = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) if (black(x, y)) count++;
    return count;
  });
  // A fraction rule is a long straight stroke, with handwriting above and below
  // and a clear gap below it. The gap avoids turning a crossed 4/8 into a fraction.
  for (let y = bounds.y + 8; y < bounds.y + bounds.height - 10; y++) {
    let longest = 0, run = 0;
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      run = black(x, y) ? run + 1 : 0; longest = Math.max(longest, run);
    }
    if (longest < Math.max(16, bounds.width * 0.65)) continue;
    let end = y;
    while (end + 1 < height && counts[end + 1]! >= longest * 0.6) end++;
    if (end - y > Math.max(8, bounds.height * 0.12)) continue;
    let gap = end + 1;
    while (gap < Math.min(height, end + 9) && counts[gap]! > 1) gap++;
    if (gap >= Math.min(height, end + 9)) continue;
    let top = y;
    while (top > bounds.y && counts[top - 1]! >= longest * 0.6) top--;
    const numerator = boundsWithin(bounds.y, Math.max(bounds.y, top - 3)), denominator = boundsWithin(gap + 1, bounds.y + bounds.height);
    if (!numerator || !denominator || numerator.height < 8 || denominator.height < 8) continue;
    if (Math.max(numerator.width, denominator.width) > longest * 1.5) continue;
    return { pixels, bounds, fraction: { numerator, denominator } };
  }
  return { pixels, bounds };
}
