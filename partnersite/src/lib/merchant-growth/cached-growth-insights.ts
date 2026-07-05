import type { Sql } from "postgres";
import { withGrowthCache } from "@/lib/growth-insights-cache";
import { buildGrowthBusinessInsights } from "./growth-business-insights";

const BUSINESS_TTL_MS = 5 * 60 * 1000;

/** Shared cache — live-preview and business-insights routes dedupe the same store+period work. */
export async function getCachedGrowthBusinessInsights(
  sql: Sql,
  storeId: number,
  period: string,
) {
  return withGrowthCache(`business-metrics:${storeId}:${period}`, BUSINESS_TTL_MS, () =>
    buildGrowthBusinessInsights(sql, storeId, period),
  );
}

export const GROWTH_LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCachedLivePreviewInsights(
  sql: Sql,
  storeId: number,
  period: string,
  options?: { lite?: boolean },
) {
  const { buildLivePreviewInsights } = await import("./live-preview-insights");
  const lite = options?.lite !== false;
  return withGrowthCache(
    `live-preview-v3:${storeId}:${period}:${lite ? "lite" : "full"}`,
    GROWTH_LIVE_CACHE_TTL_MS,
    () => buildLivePreviewInsights(sql, storeId, period, { lite }),
  );
}
