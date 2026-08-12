"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BarChart3,
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
import { MerchantMarketInsightsCard } from "@/components/merchant/MerchantMarketInsightsCard";
import { LivePreviewInsightsPanel } from "@/components/merchant/LivePreviewInsightsPanel";
import { BusinessReportsPanel } from "@/components/merchant/BusinessReportsPanel";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { DashboardPartnerDeliveryCard } from "@/components/merchant/DashboardPartnerDeliveryCard";
import { DashboardPartnerStoreOverviewCard } from "@/components/merchant/DashboardPartnerStoreOverviewCard";
import {
  PartnerDashboardDeliveryCardSkeleton,
  PartnerDashboardStoreOverviewSkeleton,
  PartnerDashboardStoreStatusSkeleton,
} from "@/components/merchant/PartnerDashboardCardSkeletons";
import { PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS } from "@/components/merchant/partner-dashboard-card-styles";
import { useLocalStoreStatusEngineStore } from "@/lib/localStoreStatusEngineStore";

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
  const { canOperateStore, isViewOnly } = useMerchantDashboardAccess();
  const canToggleDelivery = canOperateStore && !isViewOnly;
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

  const opsReady = Boolean(
    operationsQuery.data &&
      (operationsQuery.data as { operational_status?: unknown }).operational_status !== undefined
  );
  const showTopCardSkeletons = !opsReady;

  // Instant local engine hydrate + sync when network ops arrive (partnersite pattern).
  useEffect(() => {
    if (!storeId) return;
    useLocalStoreStatusEngineStore.getState().hydrate(storeId);
  }, [storeId]);

  useEffect(() => {
    if (!opsReady || !operationsQuery.data) return;
    const d = operationsQuery.data as {
      operational_status?: string;
      manual_close_until?: string | null;
      close_reason?: string | null;
    };
    useLocalStoreStatusEngineStore.getState().syncFromStoreOperations({
      operationalOpen: String(d.operational_status || "").toUpperCase() === "OPEN",
      manualCloseUntil: d.manual_close_until ?? null,
      manualCloseReason: d.close_reason ?? null,
    });
  }, [opsReady, operationsQuery.data]);

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
    if (!canToggleDelivery) {
      toast("View-only access — delivery mode cannot be changed");
      return;
    }
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
  }, [storeId, mxDeliveryEnabled, canToggleDelivery, invalidateStoreQueries, toast]);

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

      <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden bg-[#f8fafc]">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 sm:px-6 lg:px-8 pt-5 pb-4">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Store status | Delivery | Store overview — exact partnersite order & layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch pb-1">
              <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                {showTopCardSkeletons ? (
                  <PartnerDashboardStoreStatusSkeleton />
                ) : (
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
                  canToggleStore={canOperateStore}
                  onStoreToggle={() => handleStoreToggle({ isDelisted })}
                  onManualLockChange={(enabled) => {
                    statusCard.setManualActivationLock(enabled);
                    void saveManualActivationLock(enabled);
                  }}
                  storeInternalId={storeId}
                  onOperationsRefresh={() => storeOps.refreshOperations()}
                />
                )}
              </section>

              <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                {showTopCardSkeletons && !statsQuery.data ? (
                  <PartnerDashboardDeliveryCardSkeleton />
                ) : (
                <DashboardPartnerDeliveryCard
                  mxDeliveryEnabled={mxDeliveryEnabled}
                  onToggle={() => void handleMXDeliveryToggle()}
                  toggleLocked={!canToggleDelivery}
                  showViewRiders={mxDeliveryEnabled && canToggleDelivery}
                  onViewRiders={() => {
                    router.push(`/dashboard/merchants/stores/${storeId}/store-settings`);
                  }}
                  stats={{
                    activeOrders:
                      Number((statsQuery.data as { pendingCount?: number } | undefined)?.pendingCount ?? 0) +
                      Number((statsQuery.data as { preparingCount?: number } | undefined)?.preparingCount ?? 0) +
                      Number((statsQuery.data as { outForDeliveryCount?: number } | undefined)?.outForDeliveryCount ?? 0),
                    avgPreparationTimeMinutes: Number(
                      (statsQuery.data as { avgPreparationTimeMinutes?: number } | undefined)
                        ?.avgPreparationTimeMinutes ?? 0
                    ),
                    completionRatePercent: Number(
                      (statsQuery.data as { acceptanceRatePercent?: number } | undefined)
                        ?.acceptanceRatePercent ?? 0
                    ),
                    deliveredTodayCount: deliveredToday,
                    cancelledTodayCount: Number(
                      (statsQuery.data as { cancelledTodayCount?: number } | undefined)
                        ?.cancelledTodayCount ?? 0
                    ),
                    rtoTodayCount: 0,
                  }}
                />
                )}
              </section>

              <section className={PARTNER_DASHBOARD_TOP_CARD_SECTION_CLASS}>
                {showTopCardSkeletons && walletLoading && walletAvailableBalance == null ? (
                  <PartnerDashboardStoreOverviewSkeleton />
                ) : (
                <DashboardPartnerStoreOverviewCard
                  totalProducts={Number(
                    (statsQuery.data as { totalProducts?: number } | undefined)?.totalProducts ?? 0
                  )}
                  outOfStock={Number(
                    (statsQuery.data as { outOfStockCount?: number } | undefined)?.outOfStockCount ?? 0
                  )}
                  pendingOrders={Number(
                    (statsQuery.data as { pendingCount?: number } | undefined)?.pendingCount ?? 0
                  )}
                  walletAvailable={walletAvailableBalance}
                  walletToday={walletTodayEarning}
                  walletYesterday={walletYesterdayEarning}
                  walletPending={walletPendingBalance}
                  walletLoading={walletLoading}
                />
                )}
              </section>
            </div>

            {/* Insights — Live preview / Business reports (partnersite order) */}
            <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-slate-200/90">
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
                  <p className="text-[11px] sm:text-xs text-slate-600 max-w-2xl leading-relaxed">
                    See how your store is performing today and how it stacks up against recent periods—so you can spot trends early and act quickly.
                  </p>
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
                <div className="mt-6 sm:mt-8">
                  <LivePreviewInsightsPanel
                    storeInternalId={Number(storeId)}
                    periodPreset="today"
                    marketStoreId={Number(storeId)}
                  />
                </div>
              )}

              {insightsTab === "reports" && (
                <BusinessReportsPanel storeInternalId={Number(storeId)} periodPreset="this_week" subview={reportsSubview} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
