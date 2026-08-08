"use client";

import React from "react";
import { ShoppingBag, Wallet, Package, Star, TrendingDown, TrendingUp } from "lucide-react";
import type { LivePreviewInsights } from "@/lib/merchant-growth/live-preview-insights";
import {
  readLivePreviewCache,
  writeLivePreviewCache,
} from "@/lib/merchant-growth/growth-insights-cache";

function KpiSparkline({
  values,
  stroke,
  fillFrom,
}: {
  values: readonly number[];
  stroke: string;
  fillFrom: string;
}) {
  const gid = React.useId().replace(/:/g, "");
  const w = 200;
  const h = 40;
  const pad = 2;
  const nums = values.length ? [...values] : [0, 0];
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
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaD =
    last && first ? `${d} L ${last.x.toFixed(1)} ${h - pad} L ${first.x.toFixed(1)} ${h - pad} Z` : "";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`kpi-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} stopOpacity="0.35" />
          <stop offset="100%" stopColor={fillFrom} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaD ? <path d={areaD} fill={`url(#kpi-${gid})`} /> : null}
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({
  pct,
  asPoints,
}: {
  pct: number | null;
  asPoints?: boolean;
}) {
  if (pct == null) return null;
  const neg = pct < 0;
  const label = asPoints
    ? `${pct > 0 ? "+" : ""}${Math.abs(pct) % 1 === 0 ? pct : pct.toFixed(1)}`
    : `${pct > 0 ? "+" : ""}${pct}%`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        neg ? "text-red-600" : "text-emerald-600"
      }`}
    >
      {neg ? <TrendingDown size={13} strokeWidth={2.5} aria-hidden /> : <TrendingUp size={13} strokeWidth={2.5} aria-hidden />}
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  compareLabel = "vs Yesterday",
  sparkline,
  stroke,
  fillFrom,
  icon,
  iconBg,
  iconColor,
  asPointsDelta,
}: {
  label: string;
  value: React.ReactNode;
  delta: number | null;
  compareLabel?: string;
  sparkline: readonly number[];
  stroke: string;
  fillFrom: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  asPointsDelta?: boolean;
}) {
  return (
    <div className="relative flex min-h-[148px] flex-col rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </span>
        <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
        <Delta pct={delta} asPoints={asPointsDelta} />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-400">{compareLabel}</p>
      <div className="mt-auto pt-3 -mx-1">
        <KpiSparkline values={sparkline} stroke={stroke} fillFrom={fillFrom} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="min-h-[148px] rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-9 w-9 rounded-lg bg-slate-200/70" />
        <div className="h-3 w-24 rounded bg-slate-200/70" />
      </div>
      <div className="h-7 w-16 rounded bg-slate-200/70" />
      <div className="mt-6 h-8 rounded bg-slate-100" />
    </div>
  );
}

type Props = {
  storeId: string | null;
  period?: string;
  embedded?: boolean;
};

export function PartnerDashboardKpiCards({ storeId, period = "today", embedded = false }: Props) {
  const [data, setData] = React.useState<LivePreviewInsights | null>(() =>
    storeId ? readLivePreviewCache(storeId, period) : null,
  );

  React.useEffect(() => {
    if (!storeId) {
      setData(null);
      return;
    }
    const cached = readLivePreviewCache(storeId, period);
    if (cached) setData(cached);

    let cancelled = false;
    void fetch(
      `/api/merchant/growth/live-preview?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}&lite=1`,
      { credentials: "include" },
    )
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<LivePreviewInsights>;
      })
      .then((body) => {
        if (!cancelled && body) {
          writeLivePreviewCache(storeId, period, body);
          setData(body);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, period]);

  if (!storeId) return null;

  const gridClass = embedded
    ? "grid grid-cols-2 xl:grid-cols-4 gap-3 h-full"
    : "mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4";

  if (!data) {
    return (
      <div className={gridClass}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const ratingDisplay = data.ratings.display.replace(/^₹/, "");
  const ratingDelta =
    data.ratings.pct_change != null ? Math.round(data.ratings.pct_change * 10) / 100 : null;

  return (
    <div className={gridClass}>
      <KpiCard
        label="Today's orders"
        value={data.sales.delivered_orders.display}
        delta={data.sales.delivered_orders.pct_change}
        sparkline={data.sales.delivered_orders.sparkline}
        stroke="rgb(16 185 129)"
        fillFrom="rgb(16 185 129)"
        icon={<ShoppingBag size={18} strokeWidth={2} aria-hidden />}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
      />
      <KpiCard
        label="Today's sales"
        value={data.sales.sales.display}
        delta={data.sales.sales.pct_change}
        sparkline={data.sales.sales.sparkline}
        stroke="rgb(249 115 22)"
        fillFrom="rgb(249 115 22)"
        icon={<Wallet size={18} strokeWidth={2} aria-hidden />}
        iconBg="bg-orange-50"
        iconColor="text-orange-600"
      />
      <KpiCard
        label="Average order value"
        value={data.sales.aov.display}
        delta={data.sales.aov.pct_change}
        sparkline={data.sales.aov.sparkline}
        stroke="rgb(139 92 246)"
        fillFrom="rgb(139 92 246)"
        icon={<Package size={18} strokeWidth={2} aria-hidden />}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
      />
      <KpiCard
        label="Customer rating"
        value={
          <>
            {ratingDisplay}
            <Star size={14} className="inline ml-0.5 text-emerald-500 fill-emerald-500" aria-hidden />
          </>
        }
        delta={ratingDelta}
        compareLabel="vs Last Period"
        asPointsDelta
        sparkline={data.ratings.sparkline}
        stroke="rgb(20 184 166)"
        fillFrom="rgb(20 184 166)"
        icon={<Star size={18} strokeWidth={2} aria-hidden />}
        iconBg="bg-teal-50"
        iconColor="text-teal-600"
      />
    </div>
  );
}
