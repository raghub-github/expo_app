"use client";

import React from "react";
import { Truck } from "lucide-react";
import {
  readDashboardDeliveryStatsCache,
  writeDashboardDeliveryStatsCache,
  type DashboardDeliveryStats,
} from "@/lib/partner-dashboard-cache";
import {
  PARTNER_DASHBOARD_METRIC_BOX_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "./partner-dashboard-card-styles";
import { PartnerDashboardDeliveryCardSkeleton } from "./PartnerDashboardCardSkeletons";

const EMPTY_STATS: DashboardDeliveryStats = {
  activeOrders: 0,
  avgPreparationTimeMinutes: 0,
  completionRatePercent: 0,
  deliveredTodayCount: 0,
  cancelledTodayCount: 0,
  rtoTodayCount: 0,
};

type Props = {
  storeId: string | null;
  mxDeliveryEnabled: boolean;
  onToggle: () => void;
  toggleLoading?: boolean;
  showViewRiders?: boolean;
  onViewRiders?: () => void;
  locked?: boolean;
  overlay?: React.ReactNode;
};

export function PartnerDashboardDeliveryCard({
  storeId,
  mxDeliveryEnabled,
  onToggle,
  toggleLoading,
  showViewRiders,
  onViewRiders,
  locked,
  overlay,
}: Props) {
  const [stats, setStats] = React.useState<DashboardDeliveryStats>(EMPTY_STATS);
  const [hydratedFromCache, setHydratedFromCache] = React.useState(false);

  React.useEffect(() => {
    if (!storeId) {
      setStats(EMPTY_STATS);
      setHydratedFromCache(false);
      return;
    }

    const cached = readDashboardDeliveryStatsCache(storeId);
    if (cached) {
      setStats(cached);
      setHydratedFromCache(true);
    } else {
      setStats(EMPTY_STATS);
      setHydratedFromCache(false);
    }

    let cancelled = false;
    void fetch(`/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`, {
      credentials: "include",
    })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) {
          const next: DashboardDeliveryStats = {
            activeOrders: Number(body.activeOrders) || 0,
            avgPreparationTimeMinutes: Number(body.avgPreparationTimeMinutes) || 0,
            completionRatePercent: Number(body.completionRatePercent) || 0,
            deliveredTodayCount: Number(body.deliveredTodayCount) || 0,
            cancelledTodayCount: Number(body.cancelledTodayCount) || 0,
            rtoTodayCount: Number(body.returnFailedTodayCount ?? body.rtoTodayCount) || 0,
          };
          setStats(next);
          writeDashboardDeliveryStatsCache(storeId, next);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydratedFromCache(true);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (!storeId) {
    return (
      <div className="relative h-full">
        {overlay}
        <PartnerDashboardDeliveryCardSkeleton />
      </div>
    );
  }

  const showPlaceholderPulse = !hydratedFromCache;

  return (
    <div className={`${PARTNER_DASHBOARD_TOP_CARD_CLASS} relative`}>
      {overlay}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Truck className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery mode</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {mxDeliveryEnabled ? "Self delivery" : "Platform riders"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold ${!mxDeliveryEnabled ? "text-violet-700" : "text-slate-400"}`}>
              GatiMitra
            </span>
            <button
              type="button"
              onClick={onToggle}
              disabled={locked || toggleLoading}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:opacity-50 ${mxDeliveryEnabled ? "bg-orange-500" : "bg-slate-300"}`}
              aria-label={mxDeliveryEnabled ? "Switch to GatiMitra delivery" : "Switch to Self delivery"}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${mxDeliveryEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`}
              />
            </button>
            <span className={`text-xs font-semibold ${mxDeliveryEnabled ? "text-orange-600" : "text-slate-400"}`}>
              Self
            </span>
          </div>
          {showViewRiders && onViewRiders ? (
            <button
              type="button"
              onClick={onViewRiders}
              className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 hover:underline"
            >
              View riders
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2 shrink-0">
        <div className={`relative ${PARTNER_DASHBOARD_METRIC_BOX_CLASS}`}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Active orders</p>
          <p
            className={`mt-0.5 text-base font-bold tabular-nums text-slate-900 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {stats.activeOrders}
          </p>
          <span className="absolute bottom-1.5 right-1.5 text-[9px] font-semibold text-emerald-600 uppercase">
            Live
          </span>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Avg prep time</p>
          <p
            className={`mt-0.5 text-base font-bold tabular-nums text-slate-900 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {stats.avgPreparationTimeMinutes > 0 ? `${stats.avgPreparationTimeMinutes} min` : "—"}
          </p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Completion</p>
          <p
            className={`mt-0.5 text-base font-bold tabular-nums text-slate-900 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {stats.completionRatePercent}%
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
          Delivery performance
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">T - Completed</p>
            <p
              className={`mt-0.5 text-base font-bold tabular-nums text-emerald-600 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
            >
              {stats.deliveredTodayCount}
            </p>
          </div>
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">T - Cancelled</p>
            <p
              className={`mt-0.5 text-base font-bold tabular-nums text-red-600 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
            >
              {stats.cancelledTodayCount}
            </p>
          </div>
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">T - RTO</p>
            <p
              className={`mt-0.5 text-base font-bold tabular-nums text-orange-600 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
            >
              {stats.rtoTodayCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
