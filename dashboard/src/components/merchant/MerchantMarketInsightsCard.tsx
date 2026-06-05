"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Info, Loader2, TrendingDown, TrendingUp, Users } from "lucide-react";
import type {
  CompetitorRow,
  MarketMatchScope,
  MerchantMarketInsights,
} from "@/lib/merchant-store-competitors";

const TOP_N = 10;

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
          <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaD ? <path d={areaD} fill={`url(#sf-${gid})`} /> : null}
      <path
        d={d}
        fill="none"
        stroke="rgb(37 99 235)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill="rgb(37 99 235)" />
      ))}
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
      {neg ? <TrendingDown size={12} strokeWidth={2.5} aria-hidden /> : <TrendingUp size={12} strokeWidth={2.5} aria-hidden />}
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function rankTrendPct(rankDelta: number | null): number | null {
  if (rankDelta == null || rankDelta === 0) return null;
  return rankDelta > 0 ? rankDelta * 5 : rankDelta * 5;
}

/** Sparkline series derived from affinity (visual parity with customer experience rows). */
function sparkSeries(c: CompetitorRow): number[] {
  const end = Math.max(0.5, c.affinity_pct);
  const start = Math.max(0.2, end - (c.rank_delta ?? 0) * 1.2);
  return Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return start + (end - start) * t + Math.sin(i * 0.9) * 0.15;
  });
}

function MatchScopeToggle({
  scope,
  onChange,
}: {
  scope: MarketMatchScope;
  onChange: (s: MarketMatchScope) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 shrink-0"
      role="group"
      aria-label="Match competitors by"
    >
      {(["city", "locality"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            scope === s
              ? "bg-white text-violet-700 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {s === "city" ? "City" : "Locality"}
        </button>
      ))}
    </div>
  );
}

export function MerchantMarketInsightsCard({
  storeId,
  className = "",
}: {
  storeId: string;
  className?: string;
}) {
  const [matchScope, setMatchScope] = useState<MarketMatchScope>("city");
  const [data, setData] = useState<MerchantMarketInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ scope: matchScope, limit: String(TOP_N) });
      const res = await fetch(
        `/api/merchant/stores/${encodeURIComponent(storeId)}/market/insights?${q}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as MerchantMarketInsights & { success?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load market insights");
      }
      setData(json);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, matchScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const competitors = (data?.competitors ?? []).slice(0, TOP_N);
  const scopeLabel = matchScope === "city" ? "city" : "pincode";

  return (
    <div className={`h-full min-h-0 flex flex-col ${className}`}>
      <div className="flex flex-wrap items-center gap-2 gap-y-2 pb-3 border-b border-slate-200/80">
        <Users className="text-violet-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
        <h2 className="text-sm font-bold text-slate-900 tracking-tight">Competitors</h2>
        <span className="text-slate-400" title={`Top ${TOP_N} by customer overlap (${scopeLabel})`}>
          <Info size={15} strokeWidth={2} aria-hidden />
        </span>
        <div className="w-full sm:w-auto sm:ml-auto">
          <MatchScopeToggle scope={matchScope} onChange={setMatchScope} />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-red-600">{error}</p>
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 min-h-0">
          <p className="text-sm text-slate-500 text-center max-w-xs leading-relaxed">
            {matchScope === "locality"
              ? "No competitors in your pincode yet. Add a valid postal code on the store profile."
              : "No competitors in your city yet. Overlap builds as customers order from multiple stores."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200/70 flex-1">
          {competitors.map((c) => {
            const trend = rankTrendPct(c.rank_delta);
            return (
              <div
                key={c.competitor_store_id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5"
              >
                <div
                  className="sm:col-span-3 text-sm text-slate-700 font-medium truncate"
                  title={c.name}
                >
                  <span className="text-[10px] text-slate-400 font-semibold tabular-nums mr-1.5">#{c.rank}</span>
                  {c.name}
                </div>
                <div className="sm:col-span-5 flex justify-start sm:justify-center">
                  <MiniSparkline values={sparkSeries(c)} />
                </div>
                <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {c.affinity_pct.toFixed(1)}%
                  </span>
                  {trend != null ? <DeltaBadge pct={trend} /> : (
                    <span className="text-[11px] font-medium tabular-nums text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-full">
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
