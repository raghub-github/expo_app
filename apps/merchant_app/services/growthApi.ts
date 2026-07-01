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

export type GrowthQuickMetric = {
  value: number;
  display: string;
  pct_change: number | null;
};

export type GrowthQuickInsights = {
  period: GrowthPeriod;
  primary_header: string;
  compare_header: string;
  sales: GrowthQuickMetric;
  orders: GrowthQuickMetric;
  aov: GrowthQuickMetric;
  rating: GrowthQuickMetric;
  online_pct: GrowthQuickMetric;
  active_orders: { value: number; display: string };
  pending_acceptance: { value: number; display: string };
  complaints: GrowthQuickMetric;
};

export type GrowthKitchenBucket = {
  key: string;
  label: string;
  orders_count: number;
  late_count: number;
};

export type GrowthKitchenInsights = {
  period: GrowthPeriod;
  primary_header: string;
  configured_prep_minutes: number;
  avg_prep_actual_minutes: number | null;
  prep_delay_pct: number;
  prep_reliability_score: number;
  prep_samples_count: number;
  orders_prepared: number;
  orders_late: number;
  late_rate_pct: number;
  avg_late_minutes: number;
  currently_preparing: number;
  currently_ready: number;
  buckets: GrowthKitchenBucket[];
};

function normalizeGrowthPeriod(p: unknown): GrowthPeriod {
  const s = String(p ?? "today");
  return s === "yesterday" || s === "week" || s === "month" || s === "alltime" ? s : "today";
}

function parseQuickMetric(raw: unknown): GrowthQuickMetric {
  const m = (raw ?? {}) as Record<string, unknown>;
  return {
    value: Number(m.value) || 0,
    display: String(m.display ?? "—"),
    pct_change: m.pct_change == null ? null : Number(m.pct_change),
  };
}

export async function fetchGrowthQuickInsights(
  storeId: number,
  token: string,
  period: GrowthPeriod = "today"
): Promise<GrowthQuickInsights> {
  const q = new URLSearchParams({ period });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/growth/quick-insights?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load quick insights");
  }
  const data = (await res.json()) as GrowthQuickInsights;
  return {
    period: normalizeGrowthPeriod(data.period),
    primary_header: String(data.primary_header ?? ""),
    compare_header: String(data.compare_header ?? ""),
    sales: parseQuickMetric(data.sales),
    orders: parseQuickMetric(data.orders),
    aov: parseQuickMetric(data.aov),
    rating: parseQuickMetric(data.rating),
    online_pct: parseQuickMetric(data.online_pct),
    active_orders: {
      value: Number(data.active_orders?.value) || 0,
      display: String(data.active_orders?.display ?? "0"),
    },
    pending_acceptance: {
      value: Number(data.pending_acceptance?.value) || 0,
      display: String(data.pending_acceptance?.display ?? "0"),
    },
    complaints: parseQuickMetric(data.complaints),
  };
}

export async function fetchGrowthKitchenInsights(
  storeId: number,
  token: string,
  period: GrowthPeriod = "today"
): Promise<GrowthKitchenInsights> {
  const q = new URLSearchParams({ period });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/growth/kitchen-insights?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || "Failed to load kitchen insights");
  }
  const data = (await res.json()) as GrowthKitchenInsights;
  return {
    period: normalizeGrowthPeriod(data.period),
    primary_header: String(data.primary_header ?? ""),
    configured_prep_minutes: Number(data.configured_prep_minutes) || 18,
    avg_prep_actual_minutes:
      data.avg_prep_actual_minutes != null ? Number(data.avg_prep_actual_minutes) : null,
    prep_delay_pct: Number(data.prep_delay_pct) || 0,
    prep_reliability_score: Number(data.prep_reliability_score) || 0,
    prep_samples_count: Number(data.prep_samples_count) || 0,
    orders_prepared: Number(data.orders_prepared) || 0,
    orders_late: Number(data.orders_late) || 0,
    late_rate_pct: Number(data.late_rate_pct) || 0,
    avg_late_minutes: Number(data.avg_late_minutes) || 0,
    currently_preparing: Number(data.currently_preparing) || 0,
    currently_ready: Number(data.currently_ready) || 0,
    buckets: Array.isArray(data.buckets)
      ? data.buckets.map((b) => ({
          key: String(b.key),
          label: String(b.label),
          orders_count: Number(b.orders_count) || 0,
          late_count: Number(b.late_count) || 0,
        }))
      : [],
  };
}
