import type { CSSProperties } from "react";

export function themedRangeStyle(value: number, min: number, max: number) {
  const progress = Math.max(
    0,
    Math.min(100, ((value - min) / (max - min)) * 100)
  );
  return { "--av-range-progress": `${progress}%` } as CSSProperties;
}
