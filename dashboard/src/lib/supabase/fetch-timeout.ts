/**
 * Bounded fetch for Supabase auth calls so slow networks fail fast instead of
 * hanging until the reverse proxy returns 502.
 *
 * Timeouts MUST NOT throw. Next.js 16 attributes a thrown Error from this
 * fetch to the RSC that started it (e.g. FoodOrdersPage) and opens the overlay.
 * Return HTTP 408 so supabase-js treats it as a failed request instead.
 */
export const AUTH_FETCH_TIMEOUT_MS = 8_000;

export class AuthFetchTimeoutError extends Error {
  code = "TIMEOUT" as const;
  constructor(message = "Auth fetch timeout") {
    super(message);
    this.name = "AuthFetchTimeoutError";
  }
}

function isAbortLike(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string | number };
  const name = String(e.name ?? "").toLowerCase();
  const msg = String(e.message ?? "").toLowerCase();
  if (name === "aborterror" || msg.includes("aborted")) return true;
  if (e.code === 20 || e.code === "ABORT_ERR" || e.code === "ABORT") return true;
  return false;
}

function timeoutResponse(message: string): Response {
  return new Response(JSON.stringify({ message, code: "TIMEOUT" }), {
    status: 408,
    statusText: "Request Timeout",
    headers: { "Content-Type": "application/json" },
  });
}

function networkErrorResponse(message: string): Response {
  return new Response(JSON.stringify({ message, code: "FETCH_FAILED" }), {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "application/json" },
  });
}

function isNetworkFetchFailure(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  const name = String(e.name ?? "").toLowerCase();
  const msg = String(e.message ?? "").toLowerCase();
  const code = String(e.code ?? e.cause?.code ?? "");
  const causeMsg = String(e.cause?.message ?? "").toLowerCase();
  return (
    name === "typeerror" ||
    msg.includes("fetch failed") ||
    causeMsg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("connect timeout") ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET_TIMEOUT"
  );
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeoutController = new AbortController();
  const id = setTimeout(() => timeoutController.abort(), AUTH_FETCH_TIMEOUT_MS);

  const external = init?.signal;
  const onExternalAbort = () => {
    try {
      timeoutController.abort();
    } catch {
      /* ignore */
    }
  };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  return fetch(input, {
    ...init,
    signal: timeoutController.signal,
  })
    .catch((err: unknown) => {
      if (isAbortLike(err) || timeoutController.signal.aborted) {
        return timeoutResponse(
          external?.aborted ? "Auth fetch aborted" : "Auth fetch timeout"
        );
      }
      if (isNetworkFetchFailure(err)) {
        const message = err instanceof Error ? err.message : "Auth fetch failed";
        return networkErrorResponse(message);
      }
      throw err;
    })
    .finally(() => {
      clearTimeout(id);
      if (external) external.removeEventListener("abort", onExternalAbort);
    });
}
