/**
 * Bounded fetch for Supabase auth calls so slow networks fail fast instead of
 * hanging until the reverse proxy returns 502.
 */
export const AUTH_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeoutController = new AbortController();
  const id = setTimeout(() => timeoutController.abort(), AUTH_FETCH_TIMEOUT_MS);

  const signal =
    init?.signal != null && typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutController.signal, init.signal])
      : timeoutController.signal;

  return fetch(input, {
    ...init,
    signal,
  }).finally(() => clearTimeout(id));
}
