"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import {
  parseNumericRiderIdFromSearch,
  riderSearchMatchesLoadedRider,
  riderSearchNeedsSupabaseResolve,
} from "@/lib/riders/resolve-rider-search";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import Link from "next/link";
import {
  Gift,
  Zap,
  IndianRupee,
  Trophy,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

type LedgerEntry = {
  id: number;
  entryType: string;
  amount: string;
  serviceType: string | null;
  description: string | null;
  ref: string | null;
  refType: string | null;
  createdAt: string;
};

type ProgramProgress = {
  progressId: string;
  programId: string;
  programCode: string | null;
  programName: string | null;
  service: string;
  riderStatus: string;
  completedOrders: number;
  projectedReward: string | null;
  finalReward: string | null;
  payoutStatus: string | null;
  rankPosition: number | null;
  cycleStartAt: string;
  cycleEndAt: string;
  visible: boolean;
  winnerSelected: boolean;
  disqualified: boolean;
  cycleCount?: number;
};

type IncentivesPayload = {
  summary: {
    incentiveTotal: string;
    surgeTotal: string;
    bonusTotal: string;
    referralBonusTotal: string;
    combinedTotal: string;
    entryCount: number;
    programCount: number;
  };
  entries: LedgerEntry[];
  programs: ProgramProgress[];
};

function formatInr(value: string | number): string {
  const n = Number(value);
  const abs = Math.abs(Number.isFinite(n) ? n : 0).toFixed(2);
  if (n < 0) return `−₹${abs}`;
  return `₹${abs}`;
}

function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entryTypeLabel(type: string): string {
  switch (type) {
    case "incentive":
      return "Incentive";
    case "surge":
      return "Surge";
    case "bonus":
      return "Bonus";
    case "referral_bonus":
      return "Referral bonus";
    default:
      return type;
  }
}

function entryTypeClass(type: string): string {
  switch (type) {
    case "incentive":
      return "bg-amber-100 text-amber-800";
    case "surge":
      return "bg-violet-100 text-violet-800";
    case "bonus":
      return "bg-emerald-100 text-emerald-800";
    case "referral_bonus":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("REWARD") || s.includes("WIN")) return "bg-emerald-100 text-emerald-800";
  if (s.includes("DISQUAL") || s.includes("INELIG")) return "bg-red-100 text-red-800";
  if (s.includes("PROGRESS") || s.includes("ELIG")) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

function serviceLabel(svc: string | null | undefined): string {
  if (!svc) return "—";
  const k = svc.toLowerCase();
  if (k === "food") return "Food";
  if (k === "parcel") return "Parcel";
  if (k === "person_ride") return "Person Ride";
  return svc;
}

export function RiderIncentivesClient() {
  const searchParams = useAppSearchParams();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const parsedRiderId = useMemo(
    () => parseNumericRiderIdFromSearch(searchValue),
    [searchValue],
  );

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncentivesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const riderFromContext = useMemo<RiderInfo | null>(() => {
    const info = riderContext?.currentRiderInfo;
    if (!info) return null;
    return { id: info.id, name: info.name, mobile: info.mobile };
  }, [
    riderContext?.currentRiderInfo?.id,
    riderContext?.currentRiderInfo?.name,
    riderContext?.currentRiderInfo?.mobile,
  ]);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data: row, error: e } = await query.limit(1).single();
      if (e || !row) {
        setRider(null);
        setError("No rider found");
        return;
      }
      setRider({ id: row.id, name: row.name, mobile: row.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchValue) {
      if (riderFromContext && riderSearchMatchesLoadedRider(searchValue, riderFromContext)) {
        setRider(riderFromContext);
        setError(null);
      } else if (parsedRiderId != null && riderFromContext?.id === parsedRiderId) {
        setRider(riderFromContext);
        setError(null);
      } else if (riderSearchNeedsSupabaseResolve(searchValue) || parsedRiderId != null) {
        void resolveRider(searchValue);
      }
    } else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setError(null);
    }
  }, [searchValue, parsedRiderId, riderFromContext, resolveRider]);

  const riderId = rider?.id ?? parsedRiderId ?? riderFromContext?.id ?? null;

  const loadIncentives = useCallback(async (id: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/riders/${id}/incentives?limit=50`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load incentives");
      }
      setData(json.data as IncentivesPayload);
    } catch (err: unknown) {
      setData(null);
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (riderId == null) {
      setData(null);
      setLoadError(null);
      return;
    }
    void loadIncentives(riderId);
  }, [riderId, loadIncentives]);

  const hasSearch = searchValue.length > 0;
  const summary = data?.summary;

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Incentives & Surges"
        description=""
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        hideTitle
      />

      {riderId != null ? (
        <>
          <section className="rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Gift className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Earnings summary</h2>
                  <p className="text-xs text-gray-500">From wallet ledger · incentives, surges & bonuses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadIncentives(riderId)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            <div className="px-4 py-4 sm:px-5">
              {loading && !data ? (
                <LoadingSpinner size="sm" text="Loading incentives…" />
              ) : loadError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {loadError}
                </p>
              ) : summary ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <SummaryCard
                    label="Combined"
                    value={summary.combinedTotal}
                    icon={<IndianRupee className="h-4 w-4" />}
                    tone="slate"
                  />
                  <SummaryCard
                    label="Incentives"
                    value={summary.incentiveTotal}
                    icon={<Gift className="h-4 w-4" />}
                    tone="amber"
                  />
                  <SummaryCard
                    label="Surges"
                    value={summary.surgeTotal}
                    icon={<Zap className="h-4 w-4" />}
                    tone="violet"
                  />
                  <SummaryCard
                    label="Bonuses"
                    value={summary.bonusTotal}
                    icon={<Trophy className="h-4 w-4" />}
                    tone="emerald"
                  />
                  <SummaryCard
                    label="Referral bonuses"
                    value={summary.referralBonusTotal}
                    icon={<ArrowUpRight className="h-4 w-4" />}
                    tone="sky"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5">
              <div className="border-b border-gray-100 px-4 py-3.5 sm:px-5">
                <h2 className="text-base font-bold text-gray-900">Incentive programs</h2>
                <p className="text-xs text-gray-500">
                  Progress against active / past programs for this rider
                </p>
              </div>
              <div className="px-4 py-4 sm:px-5">
                {loading && !data ? (
                  <LoadingSpinner size="sm" text="Loading programs…" />
                ) : (data?.programs.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    No program progress found for this rider.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data!.programs.map((p) => (
                      <li
                        key={p.progressId}
                        className="rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {p.programName || p.programCode || "Program"}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {serviceLabel(p.service)}
                              {p.programCode ? ` · ${p.programCode}` : ""}
                              {p.rankPosition != null ? ` · Rank #${p.rankPosition}` : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(p.riderStatus)}`}
                          >
                            {p.riderStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span>
                            Orders: <strong className="text-gray-900">{p.completedOrders}</strong>
                          </span>
                          <span>
                            Projected:{" "}
                            <strong className="text-gray-900">
                              {p.projectedReward != null ? formatInr(p.projectedReward) : "—"}
                            </strong>
                          </span>
                          <span>
                            Final:{" "}
                            <strong className="text-gray-900">
                              {p.finalReward != null ? formatInr(p.finalReward) : "—"}
                            </strong>
                          </span>
                          {p.payoutStatus ? (
                            <span>
                              Payout: <strong className="text-gray-900">{p.payoutStatus}</strong>
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-400">
                          Latest cycle {formatWhen(p.cycleStartAt)} → {formatWhen(p.cycleEndAt)}
                          {(p.cycleCount ?? 1) > 1
                            ? ` · ${p.cycleCount} cycles total (showing latest)`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5">
              <div className="border-b border-gray-100 px-4 py-3.5 sm:px-5">
                <h2 className="text-base font-bold text-gray-900">Recent credits</h2>
                <p className="text-xs text-gray-500">
                  Latest incentive / surge / bonus ledger entries
                  {summary ? ` · ${summary.entryCount} total` : ""}
                </p>
              </div>
              <div className="px-4 py-4 sm:px-5">
                {loading && !data ? (
                  <LoadingSpinner size="sm" text="Loading ledger…" />
                ) : (data?.entries.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    No incentive, surge, or bonus credits yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {data!.entries.map((e) => (
                      <li key={`${e.id}-${e.createdAt}`} className="flex items-start justify-between gap-3 px-3.5 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entryTypeClass(e.entryType)}`}
                            >
                              {entryTypeLabel(e.entryType)}
                            </span>
                            <span className="text-xs text-gray-500">{serviceLabel(e.serviceType)}</span>
                          </div>
                          <p className="mt-1 truncate text-sm text-gray-800">
                            {e.description?.trim() || e.ref || "Wallet credit"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">{formatWhen(e.createdAt)}</p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-bold tabular-nums ${
                            Number(e.amount) < 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {formatInr(e.amount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/dashboard/riders/orders?search=${riderId}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              View Orders
            </Link>
            <Link
              href={`/dashboard/riders/wallet?search=${riderId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Wallet & Earnings
            </Link>
          </div>
        </>
      ) : (
        !resolveLoading &&
        !error && (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
            Search a rider to view incentives and surges.
          </p>
        )
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "slate" | "amber" | "violet" | "emerald" | "sky";
}) {
  const tones = {
    slate: { wrap: "bg-slate-100 text-slate-700", card: "border-slate-200" },
    amber: { wrap: "bg-amber-50 text-amber-700", card: "border-amber-100" },
    violet: { wrap: "bg-violet-50 text-violet-700", card: "border-violet-100" },
    emerald: { wrap: "bg-emerald-50 text-emerald-700", card: "border-emerald-100" },
    sky: { wrap: "bg-sky-50 text-sky-700", card: "border-sky-100" },
  }[tone];

  return (
    <div className={`rounded-xl border bg-white px-3.5 py-3 ${tones.card}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones.wrap}`}>
          {icon}
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums text-gray-900">{formatInr(value)}</p>
    </div>
  );
}
