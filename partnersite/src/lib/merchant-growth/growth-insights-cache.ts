import type { LivePreviewInsights } from "@/lib/merchant-growth/live-preview-insights";
import type { GrowthBusinessInsights } from "@/lib/merchant-growth/growth-business-insights";
import type { MerchantMarketInsights } from "@/lib/merchant-store-competitors";

const LIVE_PREFIX = "mx_growth_live_v2:";
const REPORTS_PREFIX = "mx_growth_reports_v2:";
const MARKET_PREFIX = "mx_growth_market_v2:";
const TTL_MS = 10 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.data || Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } satisfies CacheEnvelope<T>));
  } catch {
    /* ignore */
  }
}

function scopedKey(prefix: string, storeId: string, extra: string) {
  return `${prefix}${storeId}:${extra}`;
}

export function readLivePreviewCache(storeId: string, period: string): LivePreviewInsights | null {
  return read(scopedKey(LIVE_PREFIX, storeId, period));
}

export function writeLivePreviewCache(storeId: string, period: string, data: LivePreviewInsights) {
  write(scopedKey(LIVE_PREFIX, storeId, period), data);
}

export function readBusinessInsightsCache(storeId: string, period: string): GrowthBusinessInsights | null {
  return read(scopedKey(REPORTS_PREFIX, storeId, period));
}

export function writeBusinessInsightsCache(storeId: string, period: string, data: GrowthBusinessInsights) {
  write(scopedKey(REPORTS_PREFIX, storeId, period), data);
}

export function readMarketInsightsCache(storeId: string, scope: string): MerchantMarketInsights | null {
  return read(scopedKey(MARKET_PREFIX, storeId, scope));
}

export function writeMarketInsightsCache(storeId: string, scope: string, data: MerchantMarketInsights) {
  write(scopedKey(MARKET_PREFIX, storeId, scope), data);
}

export async function prefetchLivePreview(storeId: string, period: string): Promise<void> {
  try {
    const res = await fetch(
      `/api/merchant/growth/live-preview?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const body = (await res.json()) as LivePreviewInsights;
    writeLivePreviewCache(storeId, period, body);
  } catch {
    /* ignore */
  }
}

export async function prefetchBusinessInsights(storeId: string, period: string): Promise<void> {
  try {
    const res = await fetch(
      `/api/merchant/growth/business-insights?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const body = (await res.json()) as GrowthBusinessInsights;
    writeBusinessInsightsCache(storeId, period, body);
  } catch {
    /* ignore */
  }
}

export function prefetchGrowthInsights(storeId: string, livePeriod: string, reportsPeriod: string) {
  void prefetchLivePreview(storeId, livePeriod);
  void prefetchBusinessInsights(storeId, reportsPeriod);
}
