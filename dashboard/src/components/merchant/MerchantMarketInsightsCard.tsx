"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Info, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import type {
  CompetitorLeaderboardRow,
  MarketMatchScope,
  MerchantMarketInsights,
} from "@/lib/merchant-store-competitors-shared";
import {
  buildCompetitorLeaderboard,
  displayPlaceLabel,
} from "@/lib/merchant-store-competitors-shared";
import {
  readMarketInsightsCache,
  writeMarketInsightsCache,
} from "@/lib/merchant-growth/growth-insights-cache";

const TOP_N = 10;

function RankBadge({ displayRank, own }: { displayRank: string; own?: boolean }) {
  const primary = Number(String(displayRank).split("-")[0]) || 1;
  if (own) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full bg-white text-[10px] font-bold text-emerald-700 tabular-nums shrink-0 ring-1 ring-white/50"
        title={`Rank ${displayRank} by affinity`}
      >
        {displayRank}
      </span>
    );
  }
  if (primary === 1) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded bg-amber-100 text-[10px] font-bold text-amber-700 tabular-nums shrink-0"
        title={`Rank ${displayRank} by affinity`}
      >
        {displayRank}
      </span>
    );
  }
  if (primary === 2) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded bg-slate-200/90 text-[10px] font-bold text-slate-600 tabular-nums shrink-0"
        title={`Rank ${displayRank} by affinity`}
      >
        {displayRank}
      </span>
    );
  }
  if (primary === 3) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded bg-orange-100 text-[10px] font-bold text-orange-800 tabular-nums shrink-0"
        title={`Rank ${displayRank} by affinity`}
      >
        {displayRank}
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 min-w-[1.75rem] items-center justify-center text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
      {displayRank}
    </span>
  );
}

function AffinityTrend({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
        up ? "text-emerald-600" : "text-red-600"
      }`}
      title={up ? `Up ${delta} vs prior period` : `Down ${Math.abs(delta)} vs prior period`}
    >
      {up ? <TrendingUp size={11} strokeWidth={2.5} aria-hidden /> : <TrendingDown size={11} strokeWidth={2.5} aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
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

function CompetitorRowView({ c }: { c: CompetitorLeaderboardRow }) {
  if (c.is_own) {
    return (
      <div
        className="grid grid-cols-12 gap-2 items-center my-1.5 py-2.5 px-3 rounded-2xl bg-emerald-600 text-white overflow-hidden shadow-sm"
        aria-label={`Your store rank ${c.display_rank}, affinity ${c.affinity_pct.toFixed(1)} percent`}
      >
        <div className="col-span-8 flex items-center gap-2 min-w-0">
          <RankBadge displayRank={c.display_rank} own />
          {c.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.logo_url}
              alt=""
              className="h-7 w-7 rounded-full object-cover shrink-0 ring-2 ring-white/40 bg-white/20"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
              {c.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight">{c.name}</p>
            <p className="text-[10px] text-emerald-100/90 font-medium">Your store</p>
          </div>
        </div>
        <div className="col-span-4 text-right">
          <span className="text-sm font-bold tabular-nums">{c.affinity_pct.toFixed(1)}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2.5">
      <div className="col-span-8 flex items-center gap-2 min-w-0">
        <RankBadge displayRank={c.display_rank} />
        {c.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 bg-slate-100" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
            {c.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="text-sm text-slate-800 font-medium truncate" title={c.name}>
          {c.name}
        </span>
        <AffinityTrend delta={c.rank_delta} />
      </div>
      <div className="col-span-4 text-right">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{c.affinity_pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/** storeId = merchant_stores internal id (dashboard route param). */
export function MerchantMarketInsightsCard({
  storeId,
  className = "",
}: {
  storeId: string;
  className?: string;
}) {
  const [matchScope, setMatchScope] = useState<MarketMatchScope>("city");
  const [data, setData] = useState<MerchantMarketInsights | null>(() =>
    readMarketInsightsCache(storeId, "city")
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = readMarketInsightsCache(storeId, matchScope);
    if (cached) setData(cached);
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
      writeMarketInsightsCache(storeId, matchScope, json);
      setData(json);
    } catch (e) {
      if (!cached) {
        setError((e as Error).message);
        setData(null);
      }
    }
  }, [storeId, matchScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const publicStoreId = data?.store_id ?? "";

  const leaderboard = useMemo(() => {
    if (!data || !publicStoreId) return [];
    return buildCompetitorLeaderboard({
      competitors: data.competitors ?? [],
      storeId: publicStoreId,
      ownName: data.store_name || "Your store",
      ownLogoUrl: data.store_logo_url,
      ownAffinityPct: Number(data.your_affinity_pct) || 0,
    }).slice(0, TOP_N);
  }, [data, publicStoreId]);

  const locality = data?.locality;
  const yourRank = locality?.your_area_rank ?? null;
  const placeLabel = displayPlaceLabel(matchScope);
  const hasPeers = leaderboard.some((r) => !r.is_own);

  return (
    <div className={`h-full min-h-0 flex flex-col ${className}`}>
      <div className="flex flex-wrap items-center gap-2 gap-y-2 pb-3 border-b border-slate-200/80">
        <Users className="text-violet-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
        <h2 className="text-sm font-bold text-slate-900 tracking-tight">Competitors</h2>
        <span
          className="text-slate-400"
          title="Peers ranked by customer affinity. Your area rank (trophy) is by 90-day orders."
        >
          <Info size={15} strokeWidth={2} aria-hidden />
        </span>
        <div className="w-full sm:w-auto sm:ml-auto">
          <MatchScopeToggle scope={matchScope} onChange={setMatchScope} />
        </div>
      </div>

      {data && yourRank != null ? (
        <div className="flex items-center gap-2 pt-3 pb-1.5 text-sm text-slate-800">
          <Trophy className="text-amber-500 shrink-0" size={16} strokeWidth={2.25} aria-hidden />
          <p className="font-semibold tracking-tight">
            Rank{" "}
            <span className="tabular-nums text-violet-700">{yourRank}</span>
            {locality && locality.stores_in_area > 0 ? (
              <span className="text-slate-500 font-medium"> of {locality.stores_in_area}</span>
            ) : null}{" "}
            in <span className="text-slate-900">{placeLabel}</span>
            <span className="block sm:inline sm:ml-1 text-[11px] font-medium text-slate-400">
              (by orders · last 90 days)
            </span>
          </p>
        </div>
      ) : null}

      {error && !data ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-red-600">{error}</p>
        </div>
      ) : !data ? (
        <div className="divide-y divide-slate-200/70 flex-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center py-2.5">
              <div className="col-span-8 h-4 animate-pulse rounded bg-slate-200/80" />
              <div className="col-span-4 flex justify-end">
                <div className="h-4 w-12 animate-pulse rounded bg-slate-200/80" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {!hasPeers ? (
            <div className="flex flex-1 items-center justify-center px-4 min-h-0 py-6">
              <p className="text-sm text-slate-500 text-center max-w-xs leading-relaxed">
                {matchScope === "locality"
                  ? data.locality?.postal_code
                    ? "No other stores share your locality yet."
                    : "Add a valid postal code on the store profile to match locality peers."
                  : data.locality?.city
                    ? data.locality.stores_in_area <= 1
                      ? "No other stores in your city yet."
                      : "No competitors matched yet. Affinity builds as customers order from multiple stores."
                    : "Set the store city on the profile to match peers."}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-12 gap-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <div className="col-span-8">Competitors</div>
                <div className="col-span-4 text-right">Affinity</div>
              </div>
              <div className="divide-y divide-slate-200/70">
                {leaderboard.map((c) => (
                  <CompetitorRowView key={c.id} c={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
