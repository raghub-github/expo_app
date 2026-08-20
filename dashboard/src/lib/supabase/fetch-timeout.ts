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
      throw err;
    })
    .finally(() => {
      clearTimeout(id);
      if (external) external.removeEventListener("abort", onExternalAbort);
    });
}
