/**
 * JSON fetch with a hard deadline, wired to an AbortSignal (React Query's, usually).
 *
 * Both halves matter. Without a deadline, a request stuck on a dead connection holds
 * one of the browser's six sockets per host until Chrome gives up on its own (~2 min)
 * — which is what surfaces as a wall of `ERR_CONNECTION_TIMED_OUT` in the console
 * rather than a real HTTP status. Without the signal, requests superseded by a
 * filter/page change or an unmount are never cancelled and keep holding those sockets.
 *
 * The body is read as text before parsing on purpose: an nginx 502/504 is an HTML
 * page, and calling res.json() on it throws a parse error that hides the real status.
 */

export interface JsonEnvelope {
  success?: boolean;
  error?: string;
}

export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export async function fetchJsonWithTimeout<T extends JsonEnvelope>(
  url: string,
  init: RequestInit & { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  const { signal: outerSignal, timeoutMs = 25_000, ...rest } = init;
  const ctrl = new AbortController();
  let timedOut = false;
  const relay = () => ctrl.abort(outerSignal?.reason);
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort(outerSignal.reason);
    else outerSignal.addEventListener("abort", relay, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...rest,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(
        `No response in ${Math.round(timeoutMs / 1000)}s — the dashboard could not reach the server. Check your connection, then retry.`,
      );
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("You appear to be offline. Reconnect, then retry.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", relay);
  }

  const body = await res.text();
  let parsed: T | null = null;
  try {
    parsed = body ? (JSON.parse(body) as T) : null;
  } catch {
    /* not JSON — an upstream error page */
  }
  if (!res.ok) {
    throw new HttpStatusError(
      res.status,
      parsed?.error ?? `Server error ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
    );
  }
  if (parsed == null) throw new Error("Server returned an empty or non-JSON response.");
  if (parsed.success === false) throw new Error(parsed.error ?? "Request failed");
  return parsed;
}
