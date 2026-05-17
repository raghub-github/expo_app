"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import {
  useStoreStatsQuery,
  useStoreWalletQuery,
  useStoreOperationsQuery,
  useInvalidateMerchantStoreQueries,
} from "@/hooks/queries/useMerchantStoreQueries";
import { StoreDashboardSkeleton } from "./StoreDashboardSkeleton";
import {
  Truck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  Wallet,
  BarChart3,
  Store,
  Star,
  Info,
  Table2,
  LineChart as LucideLineChart,
  Download,
  Funnel,
  ChevronDown,
  Check,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { MerchantStoreStatusCard } from "@/components/merchant/MerchantStoreStatusCard";
import { MerchantStoreOperationsModals } from "@/components/merchant/MerchantStoreOperationsModals";
import { useMerchantStoreOperations } from "@/hooks/useMerchantStoreOperations";
import { useStoreStatusCardModel, type StoreOperationsSnapshot } from "@/hooks/useStoreStatusCardModel";

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

export function StoreFullDashboard({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { store: storeFromHook, isLoading: storeLoading } = useStore(storeId);
  const [store, setStore] = useState<{ store_id: string; name: string; approval_status?: string; approval_reason?: string } | null>(null);
  const [statsDate, setStatsDate] = useState("");
  const invalidateStoreQueries = useInvalidateMerchantStoreQueries();
  const operationsQuery = useStoreOperationsQuery(storeId);
  const storeOps = useMerchantStoreOperations({ storeId, poll: true, syncEngine: false });
  const {
    showClosePopup,
    closeConfirmLoading,
    toggleClosureType,
    setToggleClosureType,
    closureDate,
    setClosureDate,
    closureTime,
    setClosureTime,
    closeReason,
    setCloseReason,
    closeReasonOther,
    setCloseReasonOther,
    showToggleOnWarning,
    setShowToggleOnWarning,
    toggleOnLoading,
    handleStoreToggle,
    handleConfirmToggleOn,
    handleClosePopupConfirm,
    handleCancelClosePopup,
    saveManualActivationLock,
  } = storeOps;
  const walletQuery = useStoreWalletQuery(storeId);
  const statsQuery = useStoreStatsQuery(storeId, statsDate || undefined, { refetchInterval: 60000 });

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ status: string; reason?: string }>({ status: "", reason: "" });
  const [hasMounted, setHasMounted] = useState(false);

  const [deliveredToday, setDeliveredToday] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [insightsTab, setInsightsTab] = useState<"live" | "reports">("live");
  const [reportsSubview, setReportsSubview] = useState<"table" | "chart">("table");
  const [selfDeliveryRiders, setSelfDeliveryRiders] = useState<{ id: unknown; rider_name: string; rider_mobile: string }[]>([]);
  const [selfDeliveryRidersLoading, setSelfDeliveryRidersLoading] = useState(false);

  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const [walletTodayEarning, setWalletTodayEarning] = useState(0);
  const [walletYesterdayEarning, setWalletYesterdayEarning] = useState(0);
  const [walletPendingBalance, setWalletPendingBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [mxDeliveryEnabled, setMxDeliveryEnabled] = useState(false);

  useEffect(() => {
    if (statsDate === "" && typeof window !== "undefined") {
      setStatsDate(new Date().toISOString().slice(0, 10));
    }
  }, [statsDate]);

  // Sync store from React Query (primed by layout or fetched by hook) for modal and display
  useEffect(() => {
    if (!storeFromHook) return;
    setStore(storeFromHook);
    const statusUpper = (storeFromHook.approval_status || "").toUpperCase();
    if (statusUpper && statusUpper !== "APPROVED" && statusUpper !== "DELISTED") {
      setModalStatus({
        status: storeFromHook.approval_status ?? "",
        reason: (storeFromHook as { approval_reason?: string }).approval_reason ?? "",
      });
      setShowStatusModal(true);
    }
  }, [storeFromHook]);

  const isDelisted = ((storeFromHook?.approval_status ?? store?.approval_status) || "").toUpperCase() === "DELISTED";

  const statusCard = useStoreStatusCardModel(operationsQuery.data as StoreOperationsSnapshot | undefined, {
    storeTimezone: (storeFromHook as { timezone?: string | null } | null)?.timezone,
    storeIdLabel: storeFromHook?.store_id ?? null,
    onCountdownExpired: () => invalidateStoreQueries(storeId),
  });



  // Sync wallet from shared React Query cache
  useEffect(() => {
    const data = walletQuery.data;
    if (!data) return;
    const d = data as { available_balance?: number; today_earning?: number; yesterday_earning?: number; pending_balance?: number };
    setWalletAvailableBalance(d.available_balance ?? null);
    setWalletTodayEarning(d.today_earning ?? 0);
    setWalletYesterdayEarning(d.yesterday_earning ?? 0);
    setWalletPendingBalance(d.pending_balance ?? 0);
  }, [walletQuery.data]);
  useEffect(() => {
    setWalletLoading(walletQuery.isLoading);
  }, [walletQuery.isLoading]);

  // Sync stats from shared React Query cache (for Live preview figures)
  useEffect(() => {
    const data = statsQuery.data;
    if (!data) return;
    const d = data as {
      deliveredTodayCount?: number;
      totalRevenueToday?: number;
    };
    setDeliveredToday(d.deliveredTodayCount ?? 0);
    setRevenueToday(d.totalRevenueToday ?? 0);
  }, [statsQuery.data]);


  const isLoading = storeLoading;

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-settings`, { credentials: "include" });
        const data = (await res.json().catch(() => null)) as { success?: boolean; self_delivery?: boolean } | null;
        if (!cancelled && data?.success && typeof data.self_delivery === "boolean") {
          setMxDeliveryEnabled(data.self_delivery);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !mxDeliveryEnabled) {
      setSelfDeliveryRiders([]);
      return;
    }
    let cancelled = false;
    setSelfDeliveryRidersLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/self-delivery-riders`, { credentials: "include" });
        const data = (await res.json().catch(() => null)) as { success?: boolean; riders?: { id: unknown; rider_name: string; rider_mobile: string }[] } | null;
        if (!cancelled && data?.success && Array.isArray(data.riders)) {
          setSelfDeliveryRiders(data.riders);
        }
      } catch {
        if (!cancelled) setSelfDeliveryRiders([]);
      } finally {
        if (!cancelled) setSelfDeliveryRidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, mxDeliveryEnabled]);

  const handleMXDeliveryToggle = useCallback(async () => {
    if (!mxDeliveryEnabled) {
      toast("Self delivery cannot be turned on from the dashboard. Contact support if you need it enabled.");
      return;
    }
    setMxDeliveryEnabled(false);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform_delivery: true, self_delivery: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { success?: boolean }).success === false) {
        throw new Error("Failed");
      }
      invalidateStoreQueries(storeId);
      toast("Switched to GatiMitra platform riders");
    } catch {
      setMxDeliveryEnabled(true);
      toast("Failed to update delivery mode");
    }
  }, [storeId, mxDeliveryEnabled, invalidateStoreQueries, toast]);

  const aovDisplay = useMemo(() => {
    if (deliveredToday > 0 && revenueToday > 0) {
      return Math.round(revenueToday / deliveredToday);
    }
    return 318;
  }, [deliveredToday, revenueToday]);

  // Avoid hydration mismatch: server and first client render have no query cache,
  // so server renders skeleton. Defer showing real content until after client mount.
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted || isLoading) {
    return <StoreDashboardSkeleton />;
  }
  if (!storeFromHook) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
        <p className="text-gray-500">Store not found.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/merchants")}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Go to Merchants
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Status modal (non-APPROVED store) */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Store Status</h2>
            <p className="text-sm text-gray-600 mb-6">{modalStatus.reason || modalStatus.status}</p>
            <button
              onClick={() => { setShowStatusModal(false); router.push("/dashboard/merchants"); }}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700"
            >
              Back to Merchants
            </button>
          </div>
        </div>
      )}

      <MerchantStoreOperationsModals
        isDelisted={isDelisted}
        showClosePopup={showClosePopup}
        closeConfirmLoading={closeConfirmLoading}
        toggleClosureType={toggleClosureType}
        setToggleClosureType={setToggleClosureType}
        closureDate={closureDate}
        setClosureDate={setClosureDate}
        closureTime={closureTime}
        setClosureTime={setClosureTime}
        closeReason={closeReason}
        setCloseReason={setCloseReason}
        closeReasonOther={closeReasonOther}
        setCloseReasonOther={setCloseReasonOther}
        showToggleOnWarning={showToggleOnWarning}
        setShowToggleOnWarning={setShowToggleOnWarning}
        toggleOnLoading={toggleOnLoading}
        handleConfirmToggleOn={handleConfirmToggleOn}
        handleClosePopupConfirm={handleClosePopupConfirm}
        handleCancelClosePopup={handleCancelClosePopup}
      />

      <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Wallet | Store | Delivery — partnersite-style */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch pb-1">
              <section className="min-w-0 flex flex-col h-full">
                <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                  <div className="flex items-start gap-2 mb-3 shrink-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.08] text-emerald-600 ring-1 ring-emerald-500/15">
                      <Wallet className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Wallet &amp; earnings</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Balances at a glance</p>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-h-0">
                    {walletLoading ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-9 rounded-md bg-slate-200/50 animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Available</p>
                          <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-emerald-700">
                            ₹{walletAvailableBalance != null ? Number(walletAvailableBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Today</p>
                          <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums tracking-tight text-orange-600">
                            ₹{Number(walletTodayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Yesterday</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
                            ₹{Number(walletYesterdayEarning).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-violet-600">
                            ₹{Number(walletPendingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="min-w-0 flex flex-col h-full">
                <MerchantStoreStatusCard
                  isStoreOpen={statusCard.isStoreOpen}
                  restrictionType={statusCard.restrictionType}
                  storeStatusBadge={statusCard.storeStatusBadge}
                  cardDisplaySlots={statusCard.cardDisplaySlots}
                  cardBreakGapLabel={statusCard.cardBreakGapLabel}
                  scheduledTimeOffs={statusCard.scheduledTimeOffs}
                  activeRush={statusCard.activeRush}
                  formatScheduledTimeOffWindow={statusCard.formatScheduledTimeOffWindow}
                  isTodayScheduledClosed={statusCard.isTodayScheduledClosed}
                  scheduleStatusLabel={statusCard.scheduleStatusLabel}
                  schedulePhase={statusCard.schedulePhase}
                  showScheduleCountdown={statusCard.showScheduleCountdown}
                  activeCountdownAt={statusCard.activeCountdownAt}
                  countdownTick={statusCard.countdownTick}
                  opensCountdownLabel={statusCard.opensCountdownLabel}
                  countdownKind={statusCard.countdownKind}
                  countdownSubtitleWallLabel={statusCard.countdownSubtitleWallLabel}
                  closeReasonDisplay={statusCard.closeReasonDisplay}
                  lastToggledByName={statusCard.lastToggledByName}
                  lastToggleBy={statusCard.lastToggleBy}
                  lastToggleType={statusCard.lastToggleType}
                  lastToggledAt={statusCard.lastToggledAt}
                  storeIdLabel={storeFromHook?.store_id ?? null}
                  manualActivationLock={statusCard.manualActivationLock}
                  showScheduledOffStartsCountdown={statusCard.showScheduledOffStartsCountdown}
                  scheduledOffStartsInMs={statusCard.scheduledOffStartsInMs}
                  onStoreToggle={() => handleStoreToggle({ isDelisted })}
                  onManualLockChange={(enabled) => {
                    statusCard.setManualActivationLock(enabled);
                    void saveManualActivationLock(enabled);
                  }}
                  storeInternalId={storeId}
                  onOperationsRefresh={() => storeOps.refreshOperations()}
                />
              </section>

              <section className="min-w-0 flex flex-col h-full">
                <div className="flex flex-1 flex-col min-h-[240px] sm:min-h-[252px] rounded-xl border-2 border-teal-500 bg-white/40 p-3 sm:p-3.5">
                  <div className="flex items-start gap-2 mb-2 shrink-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/[0.08] text-orange-600 ring-1 ring-orange-500/15">
                      <Truck className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery mode</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">{mxDeliveryEnabled ? "Your riders" : "Platform riders"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold transition-colors ${!mxDeliveryEnabled ? "text-violet-700" : "text-slate-400"}`}>GatiMitra</span>
                    <button
                      type="button"
                      disabled={!mxDeliveryEnabled}
                      title={
                        mxDeliveryEnabled
                          ? "Switch to GatiMitra platform riders"
                          : "Self delivery cannot be turned on here. Contact support."
                      }
                      onClick={() => void handleMXDeliveryToggle()}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${mxDeliveryEnabled ? "bg-orange-500" : "bg-slate-300"}`}
                      aria-label={mxDeliveryEnabled ? "Switch to GatiMitra delivery" : "Self delivery cannot be enabled from here"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${mxDeliveryEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                    </button>
                    <span className={`text-xs font-semibold transition-colors ${mxDeliveryEnabled ? "text-orange-600" : "text-slate-400"}`}>Self</span>
                  </div>
                  <div className="mt-3 flex min-h-[120px] flex-1 flex-col border-t border-slate-200/80 pt-2.5">
                    {mxDeliveryEnabled ? (
                      <>
                        {selfDeliveryRidersLoading ? (
                          <p className="text-[11px] text-slate-500">Loading riders…</p>
                        ) : selfDeliveryRiders.length === 0 ? (
                          <div className="flex flex-1 flex-col gap-2 justify-center">
                            <p className="text-xs text-amber-800 leading-snug">No self-delivery riders yet. Add riders in store settings.</p>
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/store-settings`}
                              className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                            >
                              Add riders in Settings →
                            </Link>
                          </div>
                        ) : (
                          <div className="flex flex-1 min-h-0 flex-col gap-2">
                            <ul className="space-y-1.5">
                              {selfDeliveryRiders.slice(0, 2).map((r) => (
                                <li
                                  key={String(r.id)}
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-800"
                                >
                                  <span className="font-mono text-[10px] font-medium text-slate-400 tabular-nums">#{String(r.id)}</span>
                                  <span className="font-semibold text-slate-900">{r.rider_name}</span>
                                  <span className="text-slate-500 tabular-nums">{r.rider_mobile}</span>
                                </li>
                              ))}
                            </ul>
                            {selfDeliveryRiders.length > 2 && (
                              <p className="text-[11px] text-slate-500">+{selfDeliveryRiders.length - 2} more</p>
                            )}
                            <Link
                              href={`/dashboard/merchants/stores/${storeId}/store-settings`}
                              className="inline-flex items-center text-xs font-semibold text-orange-600 hover:text-orange-700 mt-auto"
                            >
                              Manage all riders →
                            </Link>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 min-h-[1px]" aria-hidden />
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Partner site copy — directly under the three summary cards */}
            <div className="mt-6 sm:mt-8 max-w-3xl">
              <p className="text-[11px] sm:text-sm text-slate-600 leading-relaxed">
                See how your store is performing today and how it stacks up against recent periods—so you can spot trends early and act quickly.
              </p>
            </div>

            {/* Insights — Live preview / Business reports (partnersite) */}
            <div className="mt-8 pt-6 border-t border-slate-200/90">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit" role="tablist" aria-label="Dashboard view">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightsTab === "live"}
                      onClick={() => setInsightsTab("live")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        insightsTab === "live" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Live preview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightsTab === "reports"}
                      onClick={() => setInsightsTab("reports")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        insightsTab === "reports" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Business reports
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end shrink-0 min-w-0">
                  <div
                    className="min-w-0 max-w-[min(100%,320px)] text-xs font-medium text-slate-800 border border-slate-200/90 rounded-lg px-3 py-2 bg-white/80 truncate"
                    title={storeFromHook?.name ?? "Store"}
                  >
                    {storeFromHook?.name ?? "Store"}
                  </div>
                </div>
              </div>

              {insightsTab === "reports" && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 sm:mt-8 mb-4 pb-3 border-b border-slate-200/70">
                  <div className="inline-flex rounded-lg border border-slate-200/90 p-0.5 bg-slate-100/40 w-fit" role="tablist" aria-label="Report layout">
                    <button
                      type="button"
                      aria-selected={reportsSubview === "table"}
                      onClick={() => setReportsSubview("table")}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        reportsSubview === "table" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Table2 size={14} aria-hidden />
                      Table
                    </button>
                    <button
                      type="button"
                      aria-selected={reportsSubview === "chart"}
                      onClick={() => setReportsSubview("chart")}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        reportsSubview === "chart" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <LucideLineChart size={14} aria-hidden />
                      Charts
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="Export coming soon"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 border border-dashed border-slate-200 rounded-lg px-3 py-2 cursor-not-allowed opacity-80"
                  >
                    <Download size={14} aria-hidden />
                    Generate report
                  </button>
                </div>
              )}

              {insightsTab === "live" && (
                <>
                  <div className="mt-6 sm:mt-8 mb-10">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                      <BarChart3 className="text-emerald-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Sales overview</h2>
                      <span className="text-slate-400" title="Info">
                        <Info size={15} strokeWidth={2} aria-hidden />
                      </span>
                      <Link
                        href={`/dashboard/merchants/stores/${storeId}/payments`}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        View details
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Sales</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[42, 55, 48, 62, 58, 45, 38, 33, 28, 25]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {walletLoading ? "…" : `₹${Number(walletTodayEarning).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                          </span>
                          <DeltaBadge pct={-12} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Delivered orders</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[18, 22, 20, 24, 21, 19, 16, 14, 12, 11]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">{deliveredToday}</span>
                          <DeltaBadge pct={-8} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">AOV</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[280, 295, 288, 310, 305, 298, 292, 285, 278, 272]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">₹{aovDisplay}</span>
                          <DeltaBadge pct={-5} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-10">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                      <Star className="text-amber-500 shrink-0" size={18} strokeWidth={2} aria-hidden />
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer experience</h2>
                      <span className="text-slate-400">
                        <Info size={15} strokeWidth={2} aria-hidden />
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Ratings</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[4.1, 4.0, 4.05, 3.95, 3.9, 3.88, 3.85, 3.82, 3.8, 3.78]} />
                        </div>
                        <div className="sm:col-span-4 flex justify-start sm:justify-end">
                          <Link href={`/dashboard/merchants/stores/${storeId}/user-insights`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            View business reports
                          </Link>
                        </div>
                      </div>
                      <div className="py-2">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 pl-0.5">Bad orders</p>
                        <div className="divide-y divide-slate-200/60">
                          {[
                            { label: "Rejected orders", v: [0.2, 0.1, 0.15, 0.1, 0.08, 0.05, 0.04, 0.03, 0.02, 0] },
                            { label: "Delayed orders", v: [1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] },
                            { label: "Poor rated orders", v: [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.08] },
                          ].map((row) => (
                            <div
                              key={row.label}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-2.5 pl-2 sm:pl-3 border-l-2 border-slate-200/80"
                            >
                              <div className="sm:col-span-3 text-xs sm:text-sm text-slate-600">{row.label}</div>
                              <div className="sm:col-span-5 flex justify-start sm:justify-center">
                                <MiniSparkline values={row.v} />
                              </div>
                              <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                                <span className="text-xs text-slate-500 tabular-nums">0.0%</span>
                                <span className="text-[11px] font-medium tabular-nums text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-full">0%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Total complaints</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[2, 1, 2, 1, 1, 0, 1, 0, 0, 0]} />
                        </div>
                        <div className="sm:col-span-4 flex justify-start sm:justify-end">
                          <Link href={`/dashboard/merchants/stores/${storeId}/user-insights`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            View business reports
                          </Link>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Lost sales</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} />
                        </div>
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">₹0</span>
                          <span className="text-[11px] font-medium tabular-nums text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-full">0%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                        <div className="sm:col-span-3 text-sm text-slate-700 font-medium">Online %</div>
                        <div className="sm:col-span-5 flex justify-start sm:justify-center">
                          <MiniSparkline values={[98, 97, 99, 98, 96, 95, 97, 98, 99, 97]} />
                        </div>
                        <div className="sm:col-span-4 flex justify-start sm:justify-end">
                          <Link href={`/dashboard/merchants/stores/${storeId}/user-insights`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            View business reports
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pb-4">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1 pb-3 border-b border-slate-200/80">
                      <Funnel className="text-violet-600 shrink-0" size={18} strokeWidth={2} aria-hidden />
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Customer funnel</h2>
                      <span className="text-slate-400">
                        <Info size={15} strokeWidth={2} aria-hidden />
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200/70">
                      {[
                        { label: "Impressions", icon: ChevronDown, spark: [120, 132, 128, 140, 135, 118, 105, 92, 78, 65], val: "48", pct: -18 },
                        { label: "Impressions to menu", icon: ChevronDown, spark: [45, 48, 44, 50, 46, 40, 35, 30, 26, 22], val: "8.3%", pct: -12 },
                        { label: "Menu to cart", icon: ChevronDown, spark: [22, 24, 21, 23, 22, 19, 17, 15, 13, 11], val: "25.0%", pct: -9 },
                        { label: "Cart to order", icon: Check, spark: [8, 9, 8, 9, 8, 7, 6, 5, 4, 3], val: "0.0%", pct: -22 },
                      ].map((row, idx) => {
                        const StageIcon = row.icon;
                        return (
                          <div key={row.label} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                            <div className="sm:col-span-3 flex items-center gap-2 text-sm text-slate-700 font-medium">
                              <span className="flex w-6 shrink-0 flex-col items-center text-slate-400" aria-hidden>
                                <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 0 ? 0 : 1 }} />
                                <StageIcon size={14} className="text-blue-600 my-0.5" strokeWidth={2.5} />
                                <span className="h-2 w-px bg-slate-300" style={{ opacity: idx === 3 ? 0 : 1 }} />
                              </span>
                              {row.label}
                            </div>
                            <div className="sm:col-span-5 flex justify-start sm:justify-center">
                              <MiniSparkline values={row.spark} />
                            </div>
                            <div className="sm:col-span-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                              <span className="text-sm font-semibold tabular-nums text-slate-900">{row.val}</span>
                              <DeltaBadge pct={row.pct} />
                            </div>
                          </div>
                        );
                      })}
                      {(["New users", "Repeat users", "Lapsed users"] as const).map((label) => (
                        <div key={label} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
                          <div className="sm:col-span-3 text-sm text-slate-700 font-medium">{label}</div>
                          <div className="sm:col-span-5 flex justify-start sm:justify-center">
                            <MiniSparkline values={[40, 42, 41, 44, 43, 40, 38, 36, 35, 34]} />
                          </div>
                          <div className="sm:col-span-4 flex justify-start sm:justify-end">
                            <Link href={`/dashboard/merchants/stores/${storeId}/user-insights`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                              View business reports
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}

              {insightsTab === "reports" && reportsSubview === "table" && (
                <div className="mt-2 pb-8">
                  <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
                    <table className="min-w-full text-xs text-slate-800">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/80 text-left text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2.5 font-semibold">Metric</th>
                          <th className="px-3 py-2.5 font-semibold">Trend</th>
                          <th className="px-3 py-2.5 font-semibold tabular-nums">This week</th>
                          <th className="px-3 py-2.5 font-semibold tabular-nums">Last week</th>
                          <th className="px-3 py-2.5 font-semibold">vs prior</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { m: "Gross sales", tw: revenueToday || 0, lw: Math.max(0, revenueToday * 0.92), spark: [42, 55, 48, 62, 58, 45, 38, 33, 28, 25] as const },
                          { m: "Orders", tw: deliveredToday, lw: Math.max(0, Math.floor(deliveredToday * 0.95)), spark: [18, 22, 20, 24, 21, 19, 16, 14, 12, 11] as const },
                          { m: "AOV", tw: aovDisplay, lw: aovDisplay, spark: [280, 295, 288, 310, 305, 298, 292, 285, 278, 272] as const },
                        ].map((row) => {
                          const pct = row.lw ? Math.round(((row.tw - row.lw) / (row.lw || 1)) * 100) : 0;
                          return (
                            <tr key={row.m}>
                              <td className="px-3 py-2.5 font-medium text-slate-900">{row.m}</td>
                              <td className="px-3 py-2.5">
                                <MiniSparkline values={[...row.spark]} />
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold">
                                {row.m === "Gross sales" ? `₹${row.tw.toLocaleString("en-IN")}` : row.tw}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-slate-600">
                                {row.m === "Gross sales" ? `₹${Math.round(row.lw).toLocaleString("en-IN")}` : row.lw}
                              </td>
                              <td className="px-3 py-2.5">
                                <DeltaBadge pct={pct} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">Figures use today&apos;s snapshot where available; full analytics on the dedicated reports page.</p>
                </div>
              )}

              {insightsTab === "reports" && reportsSubview === "chart" && (
                <div className="mt-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: "Gross sales", bars: [42, 55, 48, 62, 58, 45, 38] as const },
                    { title: "Orders", bars: [18, 22, 20, 24, 21, 19, 16] as const },
                    { title: "AOV", bars: [72, 78, 75, 82, 80, 76, 70] as const },
                    { title: "Repeat rate", bars: [55, 58, 56, 60, 59, 57, 54] as const },
                  ].map((block) => (
                    <div key={block.title} className="rounded-lg border border-slate-200/80 bg-white/70 p-4">
                      <p className="text-xs font-semibold text-slate-900 mb-3">{block.title}</p>
                      <div className="flex items-end gap-1.5 h-28">
                        {block.bars.map((h, i) => (
                          <div key={i} className="flex-1 min-w-[6px] rounded-t-md bg-blue-600/85" style={{ height: `${Math.max(12, h)}%` }} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="sm:col-span-2 text-[11px] text-slate-500 leading-relaxed">Chart preview layout; connect reporting endpoints for live series.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
