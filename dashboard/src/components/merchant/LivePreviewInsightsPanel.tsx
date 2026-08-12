"use client";

import React from "react";
import {
  BarChart3,
  Star,
  Info,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  Check,
  Funnel,
} from "lucide-react";
import { MerchantMarketInsightsCard } from "@/components/merchant/MerchantMarketInsightsCard";

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

export function mapInsightsDatePreset(preset: string): string {
  switch (preset) {
    case "yesterday":
      return "yesterday";
    case "this_week":
    case "last_week":
      return "week";
    case "this_month":
    case "last_month":
      return "month";
    default:
      return "today";
  }
}

function MiniSparkline({ values, className = "" }: { values: readonly number[]; className?: string }) {
  const gid = React.useId().replace(/:/g, "");
  const w = 128;
  const h = 32;
  const pad = 3;
  const nums = values.length ? [...values] : [0];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const points = nums.map((v, i) => {
    const x = pad + (nums.length <= 1 ? innerW / 2 : (i / (nums.length - 1)) * innerW);
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaD = last && first ? `${d} L ${last.x.toFixed(2)} ${h - pad} L ${first.x.toFixed(2)} ${h - pad} Z` : "";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`sf-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaD ? <path d={areaD} fill={`url(#sf-${gid})`} /> : null}
      <path d={d} fill="none" stroke="rgb(37 99 235)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill="rgb(37 99 235)" />
      ))}
    </svg>
  );
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const neg = pct < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
        neg ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {neg ? <TrendingDown size={12} strokeWidth={2.5} aria-hidden /> : <TrendingUp size={12} strokeWidth={2.5} aria-hidden />}
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function MetricRow({
  label,
  metric,
}: {
  label: string;
  metric: InsightMetric;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
      <div className="sm:col-span-3 text-sm text-slate-700 font-medium">{label}</div>
      <div className="sm:col-span-5 flex justify-start sm:justify-center">
        <MiniSparkline values={metric.sparkline} />
      </div>
      <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{metric.display}</span>
        <DeltaBadge pct={metric.pct_change} />
      </div>
    </div>
  );
}

type Props = {
  storeId?: string | null;
  storeInternalId?: number;
  periodPreset?: string;
  marketStoreId?: string | number;
};

export function LivePreviewInsightsPanel({
  storeId,
  storeInternalId,
  periodPreset = "today",
  marketStoreId,
}: Props) {
  const [data, setData] = React.useState<LivePreviewInsights | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const period = mapInsightsDatePreset(periodPreset);
  const marketId = marketStoreId ?? storeInternalId ?? storeId;

  React.useEffect(() => {
    const canLoad = storeInternalId != null || storeId;
    if (!canLoad) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url =
      storeInternalId != null
        ? `/api/merchant/stores/${storeInternalId}/growth/live-preview?period=${encodeURIComponent(period)}`
        : `/api/merchant/growth/live-preview?storeId=${encodeURIComponent(String(storeId))}&period=${encodeURIComponent(period)}`;
    void fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(String((j as { error?: string }).error ?? "Failed to load insights"));
        }
        return res.json() as Promise<LivePreviewInsights>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load insights");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, storeInternalId, period]);

  if (storeInternalId == null && !storeId) return null;

  if (loading && !data) {
    return (
      <div className="space-y-4 py-2" aria-busy aria-label="Loading live preview">
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 flex-1 min-w-[120px] rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-slate-100/90 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-28 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-28 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  if (!data) return null;

  return (
    <>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
          <BarChart3 className="text-emerald-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Sales overview</h2>
          <span className="text-slate-400" title="Info">
            <Info size={15} strokeWidth={2} aria-hidden />
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1 mb-2">{data.compare_header}</p>
        <div className="divide-y divide-slate-200/70">
          <MetricRow label="Sales" metric={data.sales.sales} />
          <MetricRow label="Delivered orders" metric={data.sales.delivered_orders} />
          <MetricRow label="AOV" metric={data.sales.aov} />
        </div>
      </div>

      <div className="mb-5 flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch">
        <div className="w-full lg:w-[60%] min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
            <Star className="text-amber-500 shrink-0" size={18} strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer experience</h2>
            <span className="text-slate-400">
              <Info size={15} strokeWidth={2} aria-hidden />
            </span>
          </div>
          <div className="divide-y divide-slate-200/70">
            <MetricRow label="Ratings" metric={data.ratings} />
            <div className="py-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 pl-0.5">Bad orders</p>
              <div className="divide-y divide-slate-200/60">
                {(
                  [
                    ["Rejected orders", data.bad_orders.rejected],
                    ["Delayed orders", data.bad_orders.delayed],
                    ["Poor rated orders", data.bad_orders.poor_rated],
                  ] as const
                ).map(([label, metric]) => (
                  <div
                    key={label}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-2.5 pl-2 sm:pl-3 border-l-2 border-slate-200/80"
                  >
                    <div className="sm:col-span-3 text-xs sm:text-sm text-slate-600">{label}</div>
                    <div className="sm:col-span-5 flex justify-start sm:justify-center">
                      <MiniSparkline values={metric.sparkline} />
                    </div>
                    <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                      <span className="text-xs text-slate-500 tabular-nums">{metric.display}</span>
                      <DeltaBadge pct={metric.pct_change} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <MetricRow label="Total complaints" metric={data.complaints} />
            <MetricRow label="Lost sales" metric={data.lost_sales} />
            <MetricRow label="Online %" metric={data.online_pct} />
          </div>
        </div>
        {marketId ? (
          <div className="w-full lg:w-[40%] min-w-0 flex flex-col">
            <MerchantMarketInsightsCard storeId={String(marketId)} className="flex-1" />
          </div>
        ) : null}
      </div>

      <div className="pb-1">
        <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
          <Funnel className="text-violet-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer funnel</h2>
          <span className="text-slate-400">
            <Info size={15} strokeWidth={2} aria-hidden />
          </span>
        </div>
        <div className="divide-y divide-slate-200/70">
          {(
            [
              ["Impressions", data.funnel.impressions, ChevronDown],
              ["Impressions to menu", data.funnel.impressions_to_menu, ChevronDown],
              ["Menu to cart", data.funnel.menu_to_cart, ChevronDown],
              ["Cart to order", data.funnel.cart_to_order, Check],
            ] as const
          ).map(([label, metric, Icon], idx) => (
            <div key={label} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
              <div className="sm:col-span-3 flex items-center gap-2 text-sm text-slate-700 font-medium">
                <span className="flex w-6 shrink-0 flex-col items-center text-slate-400" aria-hidden>
                  <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 0 ? 0 : 1 }} />
                  <Icon size={14} className="text-blue-600 my-0.5" strokeWidth={2.5} />
                  <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 3 ? 0 : 1 }} />
                </span>
                {label}
              </div>
              <div className="sm:col-span-5 flex justify-start sm:justify-center">
                <MiniSparkline values={metric.sparkline} />
              </div>
              <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                <span className="text-sm font-semibold tabular-nums text-slate-900">{metric.display}</span>
                <DeltaBadge pct={metric.pct_change} />
              </div>
            </div>
          ))}
          {(
            [
              ["New users", data.user_segments.new_users],
              ["Repeat users", data.user_segments.repeat_users],
              ["Lapsed users", data.user_segments.lapsed_users],
            ] as const
          ).map(([label, metric]) => (
            <div key={label} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
              <div className="sm:col-span-3 text-sm text-slate-700 font-medium">{label}</div>
              <div className="sm:col-span-5 flex justify-start sm:justify-center">
                <MiniSparkline values={metric.sparkline} />
              </div>
              <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                <span className="text-sm font-semibold tabular-nums text-slate-900">{metric.display}</span>
                <DeltaBadge pct={metric.pct_change} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
