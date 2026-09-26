import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";

type DeleteOptions = {
  baseUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
};

function unavailable(): never {
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE",
    message: "문제은행 과제 삭제를 확인하지 못했습니다. 수업일지 과제는 유지했습니다." });
}

/** The Mathbank endpoint is idempotent: a missing snapshot is already deleted. */
export async function deleteMathbankAssignmentCopy(assignmentId: string, options: DeleteOptions = {}) {
  const baseUrl = options.baseUrl ?? ENV.mathbankAssignmentDeleteUrl;
  const token = options.token ?? ENV.mathbankAssignmentWriteToken;
  if (!baseUrl || token.length < 32 || (ENV.mathbankRosterToken && token === ENV.mathbankRosterToken)) unavailable();

  let url: URL;
  try { url = new URL(baseUrl); }
  catch { unavailable(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname.replace(/\/$/, "") !== "/api/auto-grade/assignments") unavailable();
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(assignmentId)}`;

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch { unavailable(); }
  // 202 does not establish that the remote deletion has finished.
  if ((!response.ok || response.status === 202) && response.status !== 404 && response.status !== 410) unavailable();
}
