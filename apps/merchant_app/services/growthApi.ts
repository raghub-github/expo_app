import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

export type GrowthPeriod = "today" | "yesterday" | "week" | "month" | "alltime";

export type GrowthBucket = {
  key: string;
  label: string;
  orders_count: number;
};

export type GrowthSummary = {
  period: GrowthPeriod;
  total_orders: number;
  total_sales: number;
  /** Timely breakdown for the selected period (e.g. 3h slots, days in range). */
  buckets: GrowthBucket[];
  /** Last 7 calendar days (IST), same for every period. */
  weekly_buckets: GrowthBucket[];
};

export type GrowthBusinessBucket = {
  key: string;
  label: string;
  orders: number;
  sales: number;
  compare_orders: number;
  compare_sales: number;
};

export type GrowthBusinessInsights = {
  period: GrowthPeriod;
  primary_header: string;
  compare_header: string;
  current: { orders: number; sales: number; aov: number };
  compare: { orders: number; sales: number; aov: number };
  buckets: GrowthBusinessBucket[];
};

function getBase(): string {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

export async function fetchGrowthSummary(
  storeId: number,
  token: string,
  period: GrowthPeriod = "today"
): Promise<GrowthSummary> {
  const q = new URLSearchParams({ period });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/growth/summary?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load growth data");
  }
  const data = (await res.json()) as GrowthSummary;
  const p = data?.period;
  const periodNorm: GrowthPeriod =
    p === "yesterday" || p === "week" || p === "month" || p === "alltime" ? p : "today";
  return {
    period: periodNorm,
    total_orders: Number(data?.total_orders) || 0,
    total_sales: Number(data?.total_sales) || 0,
    buckets: Array.isArray(data?.buckets) ? data.buckets : [],
    weekly_buckets: Array.isArray((data as { weekly_buckets?: unknown }).weekly_buckets)
      ? (data as { weekly_buckets: GrowthBucket[] }).weekly_buckets
      : [],
  };
}

export async function fetchGrowthBusinessInsights(
  storeId: number,
  token: string,
  period: GrowthPeriod = "today"
): Promise<GrowthBusinessInsights> {
  const q = new URLSearchParams({ period });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/growth/business-insights?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load business insights");
  }
  const data = (await res.json()) as GrowthBusinessInsights;
  const p = data?.period;
  const periodNorm: GrowthPeriod =
    p === "yesterday" || p === "week" || p === "month" || p === "alltime" ? p : "today";
  const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
  return {
    period: periodNorm,
    primary_header: String(data?.primary_header ?? ""),
    compare_header: String(data?.compare_header ?? ""),
    current: {
      orders: Number(data?.current?.orders) || 0,
      sales: Number(data?.current?.sales) || 0,
      aov: Number(data?.current?.aov) || 0,
    },
    compare: {
      orders: Number(data?.compare?.orders) || 0,
      sales: Number(data?.compare?.sales) || 0,
      aov: Number(data?.compare?.aov) || 0,
    },
    buckets: buckets.map((b) => ({
      key: String(b.key),
      label: String(b.label),
      orders: Number(b.orders) || 0,
      sales: Number(b.sales) || 0,
      compare_orders: Number(b.compare_orders) || 0,
      compare_sales: Number(b.compare_sales) || 0,
    })),
  };
}
