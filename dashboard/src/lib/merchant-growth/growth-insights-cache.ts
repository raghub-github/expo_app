import type { MerchantMarketInsights } from "@/lib/merchant-store-competitors-shared";

const MARKET_PREFIX = "dash_growth_market_v1:";
const SESSION_TTL_MS = 15 * 60 * 1000;
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function readLayer<T>(
  sessionKey: string,
  localKey: string,
  sessionTtl: number,
  localTtl: number
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const sessionRaw = sessionStorage.getItem(sessionKey);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as CacheEnvelope<T>;
      if (parsed?.data && Date.now() - parsed.ts <= sessionTtl) return parsed.data;
    }
    const localRaw = localStorage.getItem(localKey);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as CacheEnvelope<T>;
      if (parsed?.data && Date.now() - parsed.ts <= localTtl) return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLayer<T>(sessionKey: string, localKey: string, data: T) {
  if (typeof window === "undefined") return;
  const envelope = JSON.stringify({ ts: Date.now(), data } satisfies CacheEnvelope<T>);
  try {
    sessionStorage.setItem(sessionKey, envelope);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(localKey, envelope);
  } catch {
    /* ignore */
  }
}

export function readMarketInsightsCache(storeId: string, scope: string): MerchantMarketInsights | null {
  const id = storeId.trim();
  return readLayer(
    `${MARKET_PREFIX}${id}:${scope}`,
    `${MARKET_PREFIX}ls:${id}:${scope}`,
    SESSION_TTL_MS,
    LOCAL_TTL_MS
  );
}

export function writeMarketInsightsCache(storeId: string, scope: string, data: MerchantMarketInsights) {
  const id = storeId.trim();
  writeLayer(`${MARKET_PREFIX}${id}:${scope}`, `${MARKET_PREFIX}ls:${id}:${scope}`, data);
}
