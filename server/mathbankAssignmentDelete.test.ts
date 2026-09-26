import { describe, expect, it, vi } from "vitest";
import { deleteMathbankAssignmentCopy } from "./mathbankAssignmentDelete";

const assignmentId = "550e8400-e29b-41d4-a716-446655440000";
const baseUrl = "https://mathbank.haemiledu.kr/api/auto-grade/assignments";
const token = "t".repeat(64);

describe("Mathbank assignment deletion", () => {
  it("sends an authenticated HTTPS DELETE without following redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await deleteMathbankAssignmentCopy(assignmentId, { baseUrl, token, fetcher });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`${baseUrl}/${assignmentId}`);
    expect(options).toMatchObject({ method: "DELETE", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}` } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([200, 404, 410])("accepts an already removed Mathbank snapshot (%i)", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(deleteMathbankAssignmentCopy(assignmentId, { baseUrl, token, fetcher })).resolves.toBeUndefined();
  });

  it.each([202, 401, 500])("blocks local deletion when Mathbank returns %i", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(deleteMathbankAssignmentCopy(assignmentId, { baseUrl, token, fetcher }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("blocks local deletion on a timeout or network failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("request timed out"));
    await expect(deleteMathbankAssignmentCopy(assignmentId, { baseUrl, token, fetcher }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it.each([
    "http://mathbank.haemiledu.kr/api/auto-grade/assignments",
    "https://mathbank.haemiledu.kr/other",
    "https://user:pass@mathbank.haemiledu.kr/api/auto-grade/assignments",
    "https://mathbank.haemiledu.kr/api/auto-grade/assignments?redirect=1",
  ])("refuses an unsafe or unexpected endpoint: %s", async unsafeUrl => {
    const fetcher = vi.fn();
    await expect(deleteMathbankAssignmentCopy(assignmentId, { baseUrl: unsafeUrl, token, fetcher }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
