import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MathCourseDetails } from "../client/src/components/MathCourseProgress";
import { calculateMathProgress } from "./mathProgress";

it("places a dated retraining note directly below its completed small-unit evaluation", () => {
  const progress = calculateMathProgress([{
    id: 1,
    journalDate: "2026-09-23",
    isDraft: false,
    content: "[중2-2 / 기본 / 3단원]\n3-3 소단원 평가 · 완료\n3-3 소단원 재수강",
    mathProgress: {
      version: 1, sessionKind: "math", freeText: "3-3 소단원 재수강",
      entries: [{ key: "중2-2:3:test:3", state: "complete" }],
    },
  }], [], "2026-09-26");
  const html = renderToStaticMarkup(createElement(MathCourseDetails, { progress }));
  const evaluation = html.indexOf("3-3 소단원 평가");
  const review = html.indexOf("3-3 소단원 재수강");
  expect(evaluation).toBeGreaterThan(-1);
  expect(review).toBeGreaterThan(evaluation);
  expect(html).toContain('dateTime="2026-09-23"');
  expect(html).not.toContain("집중 관리 중인 학습");
});
