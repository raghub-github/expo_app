import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import type { GrowthPeriod } from "@/services/growthApi";

export type InsightMetric = {
  value: number;
  display: string;
  pct_change: number | null;
  sparkline: number[];
};

export type LivePreviewInsights = {
  period: string;
  compare_header: string;
  sales: {
    sales: InsightMetric;
    delivered_orders: InsightMetric;
    aov: InsightMetric;
  };
  ratings: InsightMetric;
  bad_orders: {
    rejected: InsightMetric;
    delayed: InsightMetric;
    poor_rated: InsightMetric;
  };
  complaints: InsightMetric;
  lost_sales: InsightMetric;
  online_pct: InsightMetric;
  funnel: {
    impressions: InsightMetric;
    impressions_to_menu: InsightMetric;
    menu_to_cart: InsightMetric;
    cart_to_order: InsightMetric;
  };
  user_segments: {
    new_users: InsightMetric;
    repeat_users: InsightMetric;
    lapsed_users: InsightMetric;
  };
};

function getBase(): string {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

export async function fetchLivePreviewInsights(
  storeId: number,
  token: string,
  period: GrowthPeriod = "today"
): Promise<LivePreviewInsights> {
  const q = new URLSearchParams({ period });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/growth/live-preview?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load live preview");
  }
  return (await res.json()) as LivePreviewInsights;
}
