"use client";

import React from "react";
import { LayoutGrid, Wallet } from "lucide-react";
import type { WalletSummary } from "@/hooks/useMerchantApi";
import {
  readDashboardStoreOverviewCache,
  writeDashboardStoreOverviewCache,
  type DashboardStoreOverview,
} from "@/lib/partner-dashboard-cache";
import {
  PARTNER_DASHBOARD_METRIC_BOX_CLASS,
  PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "./partner-dashboard-card-styles";
import { PartnerDashboardStoreOverviewSkeleton } from "./PartnerDashboardCardSkeletons";

const EMPTY_OVERVIEW: DashboardStoreOverview = {
  total_products: 0,
  out_of_stock: 0,
  pending_orders: 0,
};

type Props = {
  storeId: string | null;
  wallet?: WalletSummary | null;
  walletLoading?: boolean;
};

function formatInr(amount: number) {
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function MetricBoxSkeleton() {
  return (
    <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} h-[58px] px-2 py-2`}>
      <div className="h-2 w-12 rounded bg-slate-200/80" />
      <div className="mt-2 h-4 w-8 rounded bg-slate-200/70" />
    </div>
  );
}

export function PartnerDashboardStoreOverviewCard({ storeId, wallet, walletLoading }: Props) {
  const [data, setData] = React.useState<DashboardStoreOverview>(EMPTY_OVERVIEW);
  const [hydratedFromCache, setHydratedFromCache] = React.useState(false);

  React.useEffect(() => {
    if (!storeId) {
      setData(EMPTY_OVERVIEW);
      setHydratedFromCache(false);
      return;
    }

    const cached = readDashboardStoreOverviewCache(storeId);
    if (cached) {
      setData(cached);
      setHydratedFromCache(true);
    } else {
      setData(EMPTY_OVERVIEW);
      setHydratedFromCache(false);
    }

    let cancelled = false;
    void fetch(`/api/merchant/store-overview?store_id=${encodeURIComponent(storeId)}`, {
      credentials: "include",
    })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) {
          const next: DashboardStoreOverview = {
            total_products: Number(body.total_products) || 0,
            out_of_stock: Number(body.out_of_stock) || 0,
            pending_orders: Number(body.pending_orders) || 0,
          };
          setData(next);
          writeDashboardStoreOverviewCache(storeId, next);
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
      <div className="h-full">
        <PartnerDashboardStoreOverviewSkeleton />
      </div>
    );
  }

  const showPlaceholderPulse = !hydratedFromCache;
  const showWalletSkeleton = walletLoading && !wallet;

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
          <p
            className={`mt-1 text-lg font-bold tabular-nums text-slate-900 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {data.total_products}
          </p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Out of stock</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums text-orange-600 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {data.out_of_stock}
          </p>
        </div>
        <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending orders</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums text-slate-900 ${showPlaceholderPulse ? "animate-pulse opacity-70" : ""}`}
          >
            {data.pending_orders}
          </p>
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
        {showWalletSkeleton ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricBoxSkeleton />
            <MetricBoxSkeleton />
            <MetricBoxSkeleton />
            <MetricBoxSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Available</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                {formatInr(wallet?.withdrawable_balance ?? Number(wallet?.available_balance ?? 0))}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Today</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-orange-600">
                {formatInr(wallet?.today_earning ?? 0)}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Yesterday</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-800">
                {formatInr(wallet?.yesterday_earning ?? 0)}
              </p>
            </div>
            <div className={PARTNER_DASHBOARD_METRIC_BOX_CLASS}>
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-violet-600">
                {formatInr(wallet?.pending_balance ?? 0)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
