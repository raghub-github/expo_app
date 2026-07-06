import type { LivePreviewInsights } from "@/lib/merchant-growth/live-preview-insights";
import type { GrowthBusinessInsights } from "@/lib/merchant-growth/growth-business-insights";
import type { MerchantMarketInsights } from "@/lib/merchant-store-competitors";

const LIVE_SESSION_PREFIX = "mx_growth_live_v3:";
const LIVE_LOCAL_PREFIX = "mx_growth_live_v3_ls:";
const REPORTS_SESSION_PREFIX = "mx_growth_reports_v3:";
const REPORTS_LOCAL_PREFIX = "mx_growth_reports_v3_ls:";
const MARKET_PREFIX = "mx_growth_market_v2:";
const SESSION_TTL_MS = 15 * 60 * 1000;
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function readLayer<T>(
  sessionKey: string,
  localKey: string,
  sessionTtl: number,
  localTtl: number,
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

function scopedKeys(prefix: string, localPrefix: string, storeId: string, extra: string) {
  const id = storeId.trim();
  return {
    session: `${prefix}${id}:${extra}`,
    local: `${localPrefix}${id}:${extra}`,
  };
}

export function readLivePreviewCache(storeId: string, period: string): LivePreviewInsights | null {
  const keys = scopedKeys(LIVE_SESSION_PREFIX, LIVE_LOCAL_PREFIX, storeId, period);
  return readLayer(keys.session, keys.local, SESSION_TTL_MS, LOCAL_TTL_MS);
}

export function writeLivePreviewCache(storeId: string, period: string, data: LivePreviewInsights) {
  const keys = scopedKeys(LIVE_SESSION_PREFIX, LIVE_LOCAL_PREFIX, storeId, period);
  writeLayer(keys.session, keys.local, data);
}

export function readBusinessInsightsCache(storeId: string, period: string): GrowthBusinessInsights | null {
  const keys = scopedKeys(REPORTS_SESSION_PREFIX, REPORTS_LOCAL_PREFIX, storeId, period);
  return readLayer(keys.session, keys.local, SESSION_TTL_MS, LOCAL_TTL_MS);
}

export function writeBusinessInsightsCache(storeId: string, period: string, data: GrowthBusinessInsights) {
  const keys = scopedKeys(REPORTS_SESSION_PREFIX, REPORTS_LOCAL_PREFIX, storeId, period);
  writeLayer(keys.session, keys.local, data);
}

export function readMarketInsightsCache(storeId: string, scope: string): MerchantMarketInsights | null {
  return readLayer(
    `${MARKET_PREFIX}${storeId.trim()}:${scope}`,
    `${MARKET_PREFIX}ls:${storeId.trim()}:${scope}`,
    SESSION_TTL_MS,
    LOCAL_TTL_MS,
  );
}

export function writeMarketInsightsCache(storeId: string, scope: string, data: MerchantMarketInsights) {
  writeLayer(`${MARKET_PREFIX}${storeId.trim()}:${scope}`, `${MARKET_PREFIX}ls:${storeId.trim()}:${scope}`, data);
}

export async function prefetchLivePreview(storeId: string, period: string): Promise<void> {
  if (readLivePreviewCache(storeId, period)) return;
  try {
    const res = await fetch(
      `/api/merchant/growth/live-preview?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}&lite=1`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const body = (await res.json()) as LivePreviewInsights;
    writeLivePreviewCache(storeId, period, body);
  } catch {
    /* ignore */
  }
}

export async function prefetchBusinessInsights(storeId: string, period: string): Promise<void> {
  if (readBusinessInsightsCache(storeId, period)) return;
  try {
    const res = await fetch(
      `/api/merchant/growth/business-insights?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const body = (await res.json()) as GrowthBusinessInsights;
    writeBusinessInsightsCache(storeId, period, body);
  } catch {
    /* ignore */
  }
}

/** Warm live preview immediately; defer business reports until needed. */
export function prefetchGrowthInsights(storeId: string, livePeriod: string, reportsPeriod?: string) {
  void prefetchLivePreview(storeId, livePeriod);
  if (reportsPeriod && reportsPeriod !== livePeriod) {
    void prefetchBusinessInsights(storeId, reportsPeriod);
  }
}

/** Fire-and-forget before React mounts — uses session/local cache if warm. */
export function warmLivePreviewCache(storeId: string, period = "today"): void {
  if (typeof window === "undefined" || !storeId.trim()) return;
  if (readLivePreviewCache(storeId, period)) return;
  void prefetchLivePreview(storeId, period);
}

export function warmBusinessInsightsCache(storeId: string, period = "week"): void {
  if (typeof window === "undefined" || !storeId.trim()) return;
  if (readBusinessInsightsCache(storeId, period)) return;
  void prefetchBusinessInsights(storeId, period);
}
