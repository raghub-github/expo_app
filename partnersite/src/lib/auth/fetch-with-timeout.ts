/**
 * Fetch wrapper that aborts after a timeout to avoid long hangs when Supabase is unreachable.
 *
 * IMPORTANT: Never throw on timeout/network. @supabase/auth-js treats thrown fetch errors
 * (and HTTP 502/503/504) as AuthRetryableFetchError and retries for ~30s+, flooding logs.
 * Return a non-retryable 408 so callers fail once and fast.
 *
 * auth-js still console.error's AuthApiError from getUser/recovery — use
 * `runWithQuietAuthTimeoutErrors` around those calls to keep the terminal usable.
 */

const DEFAULT_TIMEOUT_MS = 5_000;

function timeoutResponse(): Response {
  // Use 408-like body but status 499 so @supabase/auth-js does not treat this as
  // AuthRetryableFetchError (502/503/504) and burn 3×3s retries on every page load.
  return new Response(JSON.stringify({ error: "request_timeout", message: "Upstream timeout" }), {
    status: 499,
    headers: { "Content-Type": "application/json" },
  });
}

function isQuietAuthTimeoutLogArg(arg: unknown): boolean {
  if (!arg || typeof arg !== "object") return false;
  const e = arg as { __isAuthError?: boolean; status?: number; message?: string; name?: string };
  if (e.__isAuthError && (e.status === 408 || e.status === 499 || e.status === 0)) return true;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("upstream timeout") ||
    msg.includes("request_timeout") ||
    (msg.includes("operation was aborted") && (e.name === "AbortError" || e.__isAuthError === true))
  );
}

/** Suppress auth-js console.error spam for expected timeout / abort failures. */
export async function runWithQuietAuthTimeoutErrors<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some(isQuietAuthTimeoutLogArg)) return;
    original.apply(console, args as Parameters<typeof console.error>);
  };
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

export function createFetchWithTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const id = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const external = init?.signal;
    if (external) {
      if (external.aborted) {
        controller.abort();
      } else {
        external.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    const { signal: _ignored, ...rest } = init ?? {};
    return fetch(input, { ...rest, signal: controller.signal })
      .catch(() => timeoutResponse())
      .finally(() => clearTimeout(id));
  };
}

/**
 * Alias — same non-throwing timeout behavior (kept for existing imports).
 */
export function createSafeFetchWithTimeout(timeoutMs: number = 5_000): typeof fetch {
  return createFetchWithTimeout(timeoutMs);
}
