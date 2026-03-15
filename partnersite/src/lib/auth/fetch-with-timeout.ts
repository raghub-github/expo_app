/**
 * Fetch wrapper that aborts after a timeout to avoid long hangs when Supabase (or other APIs) is unreachable.
 * Use this for auth/session calls so the app fails fast and returns 503 instead of waiting for connect timeout.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

export function createFetchWithTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const requestInit: RequestInit = {
      ...init,
      signal: init?.signal ?? controller.signal,
    };
    return fetch(input, requestInit).finally(() => clearTimeout(id));
  };
}

/**
 * Safe fetch that never throws: on network/timeout failure returns a 503 Response.
 * Use in Edge/Proxy so Supabase auth gets a response and doesn't log "fetch failed" to console.
 */
export function createSafeFetchWithTimeout(timeoutMs: number = 6_000): typeof fetch {
  const timeoutFetch = createFetchWithTimeout(timeoutMs);
  return (input: RequestInfo | URL, init?: RequestInit) =>
    timeoutFetch(input, init).catch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
}
