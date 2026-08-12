"use client";

import { Truck } from "lucide-react";
import {
  PARTNER_DASHBOARD_METRIC_BOX_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "@/components/merchant/partner-dashboard-card-styles";

type DeliveryStats = {
  activeOrders?: number;
  avgPreparationTimeMinutes?: number;
  completionRatePercent?: number;
  deliveredTodayCount?: number;
  cancelledTodayCount?: number;
  rtoTodayCount?: number;
};

type Props = {
  mxDeliveryEnabled: boolean;
  onToggle: () => void;
  toggleLocked?: boolean;
  toggleLoading?: boolean;
  stats?: DeliveryStats | null;
  showViewRiders?: boolean;
  onViewRiders?: () => void;
};

/** Partnersite-matched Delivery mode card for control-dashboard store home. */
export function DashboardPartnerDeliveryCard({
  mxDeliveryEnabled,
  onToggle,
  toggleLocked,
  toggleLoading,
  stats,
  showViewRiders,
  onViewRiders,
}: Props) {
  const activeOrders = Number(stats?.activeOrders ?? 0);
  const avgPrep = Number(stats?.avgPreparationTimeMinutes ?? 0);
  const completion = Number(stats?.completionRatePercent ?? 0);
  const completed = Number(stats?.deliveredTodayCount ?? 0);
  const cancelled = Number(stats?.cancelledTodayCount ?? 0);
  const rto = Number(stats?.rtoTodayCount ?? 0);

  return (
    <div className={PARTNER_DASHBOARD_TOP_CARD_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Truck className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Delivery mode
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {mxDeliveryEnabled ? "Self delivery" : "Platform riders"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-semibold ${!mxDeliveryEnabled ? "text-violet-700" : "text-slate-400"}`}
            >
              GatiMitra
            </span>
            <button
              type="button"
              onClick={onToggle}
              disabled={toggleLocked || toggleLoading || !mxDeliveryEnabled}
              title={
                toggleLocked
                  ? "View-only access — delivery mode locked"
                  : mxDeliveryEnabled
                    ? "Switch to GatiMitra platform riders"
                    : "Self delivery cannot be turned on here"
              }
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:opacity-50 ${
                mxDeliveryEnabled ? "bg-orange-500" : "bg-slate-300"
              }`}
              aria-label={
                mxDeliveryEnabled ? "Switch to GatiMitra delivery" : "Self delivery locked"
              }
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  mxDeliveryEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
            <span
              className={`text-xs font-semibold ${mxDeliveryEnabled ? "text-orange-600" : "text-slate-400"}`}
            >
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

      <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
        <div className={`relative ${PARTNER_DASHBOARD_METRIC_BOX_CLASS}`}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Active orders</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{activeOrders}</p>
          <span className="absolute bottom-2 right-2 text-[9px] font-semibold text-emerald-600 uppercase">
            Live
          </span>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Avg prep time</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {avgPrep > 0 ? `${avgPrep} min` : "—"}
          </p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Completion</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{completion}%</p>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-3 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Delivery performance
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
              Completed (today)
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600">{completed}</p>
          </div>
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
              Cancelled (today)
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-red-600">{cancelled}</p>
          </div>
          <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">RTO (today)</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-orange-600">{rto}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
