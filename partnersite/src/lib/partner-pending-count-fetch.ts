/**
 * Deduped pending-new-orders count fetch — avoids stacked polls from
 * PartnerPendingNewOrdersBar + PartnerIncomingOrderModal hammering the API.
 */

type CountResult = { count: number };

let inflight: Promise<CountResult | null> | null = null;
let inflightKey = '';
let cache: { key: string; count: number; at: number } | null = null;
/** Skip hammering APIs when session is missing. */
let authBlockedUntil = 0;

const CACHE_MS = 5_000;
const AUTH_BLOCK_MS = 60_000;

function parseCountResponse(text: string, ok: boolean): CountResult | null {
  const trimmed = text.trim();
  if (!trimmed) return ok ? { count: 0 } : null;
  try {
    const data = JSON.parse(trimmed) as { count?: unknown };
    if (typeof data.count === 'number' && Number.isFinite(data.count)) {
      return { count: data.count };
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchPartnerPendingNewOrdersCount(
  storeId: string
): Promise<number | null> {
  const key = storeId.trim();
  if (!key) return null;

  const now = Date.now();
  if (now < authBlockedUntil) return null;
  if (cache && cache.key === key && now - cache.at < CACHE_MS) {
    return cache.count;
  }

  if (inflight && inflightKey === key) {
    const shared = await inflight;
    return shared?.count ?? null;
  }

  inflightKey = key;
  inflight = (async () => {
    try {
      const res = await fetch(
        `/api/merchant/pending-new-orders-count?store_id=${encodeURIComponent(key)}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (res.status === 401 || res.status === 403) {
        authBlockedUntil = Date.now() + AUTH_BLOCK_MS;
        return null;
      }
      const text = await res.text();
      const parsed = parseCountResponse(text, res.ok);
      if (!parsed) return null;
      cache = { key, count: parsed.count, at: Date.now() };
      return parsed;
    } catch {
      return null;
    } finally {
      inflight = null;
      inflightKey = '';
    }
  })();

  const result = await inflight;
  return result?.count ?? null;
}

export function invalidatePartnerPendingCountCache(): void {
  cache = null;
  authBlockedUntil = 0;
}
