"use client";

import React from "react";
import { mapInsightsDatePreset } from "@/components/merchant/LivePreviewInsightsPanel";
import {
  BusinessReportsChartSkeleton,
  BusinessReportsTableSkeleton,
} from "@/components/merchant/GrowthInsightsSkeleton";
import type { GrowthBusinessInsights } from "@/lib/merchant-growth/growth-business-insights";
import {
  readBusinessInsightsCache,
  writeBusinessInsightsCache,
} from "@/lib/merchant-growth/growth-insights-cache";

export type { GrowthBusinessInsights };

function MiniSparkline({ values }: { values: readonly number[] }) {
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
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="rgb(37 99 235)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const neg = pct < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${
        neg ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function pctChange(current: number, compare: number): number {
  if (compare === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - compare) / compare) * 100);
}

type Props = {
  storeId: string | null;
  periodPreset?: string;
  subview: "table" | "chart";
  /** When false, skip network fetch (e.g. reports tab not visible). */
  enabled?: boolean;
};

export function BusinessReportsPanel({
  storeId,
  periodPreset = "this_week",
  subview,
  enabled = true,
}: Props) {
  const period = mapInsightsDatePreset(periodPreset);

  const [data, setData] = React.useState<GrowthBusinessInsights | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!storeId || !enabled) return;
    const cached = readBusinessInsightsCache(storeId, period);
    if (cached) setData(cached);

    let cancelled = false;
    setError(null);
    void fetch(
      `/api/merchant/growth/business-insights?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(String((j as { error?: string }).error ?? "Failed to load reports"));
        }
        return res.json() as Promise<GrowthBusinessInsights>;
      })
      .then((body) => {
        if (!cancelled) {
          writeBusinessInsightsCache(storeId, period, body);
          setData(body);
        }
      })
      .catch((e) => {
        if (!cancelled && !cached) {
          setError(e instanceof Error ? e.message : "Failed to load reports");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, period, enabled]);

  if (!storeId) return null;

  if (!data) {
    if (error) {
      return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
    }
    return subview === "table" ? <BusinessReportsTableSkeleton /> : <BusinessReportsChartSkeleton />;
  }

  const rows = [
    {
      m: "Gross sales",
      current: data.current.sales,
      compare: data.compare.sales,
      spark: data.buckets.map((b) => b.sales),
      fmt: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`,
    },
    {
      m: "Orders",
      current: data.current.orders,
      compare: data.compare.orders,
      spark: data.buckets.map((b) => b.orders),
      fmt: (v: number) => String(Math.round(v)),
    },
    {
      m: "AOV",
      current: data.current.aov,
      compare: data.compare.aov,
      spark: data.buckets.map((b) => (b.orders > 0 ? Math.round(b.sales / b.orders) : 0)),
      fmt: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`,
    },
  ];

  if (subview === "table") {
    return (
      <div className="mt-2 pb-8">
        <p className="text-[11px] text-slate-500 mb-3">{data.compare_header}</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
          <table className="min-w-full text-xs text-slate-800">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">Metric</th>
                <th className="px-3 py-2.5 font-semibold">Trend</th>
                <th className="px-3 py-2.5 font-semibold tabular-nums">Current</th>
                <th className="px-3 py-2.5 font-semibold tabular-nums">Compare</th>
                <th className="px-3 py-2.5 font-semibold">vs prior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.m}>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{row.m}</td>
                  <td className="px-3 py-2.5">
                    <MiniSparkline values={row.spark} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">{row.fmt(row.current)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.fmt(row.compare)}</td>
                  <td className="px-3 py-2.5">
                    <DeltaBadge pct={pctChange(row.current, row.compare)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {rows.map((block) => (
        <div key={block.m} className="rounded-lg border border-slate-200/80 bg-white/80 p-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">{block.m}</p>
          <div className="flex items-end gap-1 h-24">
            {block.spark.map((v, i) => {
              const max = Math.max(...block.spark, 1);
              const h = Math.max(4, Math.round((v / max) * 88));
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-indigo-500/80"
                  style={{ height: `${h}px` }}
                  title={String(v)}
                />
              );
            })}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">{block.fmt(block.current)}</p>
        </div>
      ))}
    </div>
  );
}
