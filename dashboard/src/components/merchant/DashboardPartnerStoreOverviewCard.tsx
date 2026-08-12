"use client";

import { LayoutGrid, Wallet } from "lucide-react";
import {
  PARTNER_DASHBOARD_METRIC_BOX_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "@/components/merchant/partner-dashboard-card-styles";

type Props = {
  totalProducts?: number;
  outOfStock?: number;
  pendingOrders?: number;
  walletAvailable?: number | null;
  walletToday?: number;
  walletYesterday?: number;
  walletPending?: number;
  walletLoading?: boolean;
};

function formatInr(amount: number) {
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Partnersite-matched Store overview + wallet card for control-dashboard store home. */
export function DashboardPartnerStoreOverviewCard({
  totalProducts = 0,
  outOfStock = 0,
  pendingOrders = 0,
  walletAvailable = 0,
  walletToday = 0,
  walletYesterday = 0,
  walletPending = 0,
  walletLoading,
}: Props) {
  return (
    <div className={PARTNER_DASHBOARD_TOP_CARD_CLASS}>
      <div className="flex items-center gap-2.5 mb-3 shrink-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-bold text-slate-900 tracking-tight">Store overview</h2>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Total products</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{totalProducts}</p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Out of stock</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-orange-600">{outOfStock}</p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending orders</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{pendingOrders}</p>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-3 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
            <Wallet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Wallet &amp; earnings
            </h3>
            <p className="text-[10px] text-slate-400">Balances at a glance</p>
          </div>
        </div>
        {walletLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[58px] rounded-lg bg-slate-100/90 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Available</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                {formatInr(Number(walletAvailable ?? 0))}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Today</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-orange-600">
                {formatInr(walletToday)}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Yesterday</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-800">
                {formatInr(walletYesterday)}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-violet-600">
                {formatInr(walletPending)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
