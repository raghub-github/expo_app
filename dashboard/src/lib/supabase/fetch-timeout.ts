/**
 * Bounded fetch for Supabase auth calls so slow networks fail fast instead of
 * hanging until the reverse proxy returns 502.
 */
export const AUTH_FETCH_TIMEOUT_MS = 8000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}
