/**
 * Merchant store dashboard fetch with retry on transient auth/compile 503s.
 */
export async function fetchMerchantStoreApi(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { retries?: number; baseDelayMs?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 350;
  let last: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(input, {
      ...init,
      credentials: init?.credentials ?? "include",
    });
    if (res.status !== 503 && res.status !== 429 && res.status !== 499) {
      return res;
    }
    last = res;
    if (attempt < retries) {
      await new Promise((r) => window.setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }

  return last!;
}
