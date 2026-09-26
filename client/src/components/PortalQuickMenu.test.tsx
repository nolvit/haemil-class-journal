import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PortalQuickMenu from "./PortalQuickMenu";

const assignmentLink = {
  key: "math-assignments",
  label: "수학(과제)",
  ariaLabel: "수학 과제 새 창에서 열기",
  href: "/p/family-token/assignments?studentId=12",
};

describe("parent assignment shortcut", () => {
  it("opens assignments in a new tab and shows unfinished work", () => {
    const html = renderToStaticMarkup(
      <PortalQuickMenu items={[{ ...assignmentLink, progress: { completed: 2, total: 3 } }]} />
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain("2 / 3");
    expect(html).toContain("new");
    expect(html).toContain("수학(과제)");
  });

  it("shows done after every issued assignment has been submitted", () => {
    const html = renderToStaticMarkup(
      <PortalQuickMenu items={[{ ...assignmentLink, progress: { completed: 3, total: 3 } }]} />
    );
    expect(html).toContain("3 / 3");
    expect(html).toContain("done");
    expect(html).not.toContain("new");
  });

  it("does not render a button without a visible menu item", () => {
    expect(renderToStaticMarkup(<PortalQuickMenu items={[]} />)).toBe("");
  });
});
