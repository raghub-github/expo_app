"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Pencil,
  Copy,
  MoreHorizontal,
  Search,
  Layers,
  Users,
  IndianRupee,
  TrendingUp,
  Crown,
  Info,
  X,
  Check,
} from "lucide-react";
import { SubscriptionPlanCardSkeleton } from "@/components/ui/SkeletonLoader";
import { RiderSubscriptionPlanForm } from "./RiderSubscriptionPlanForm";
import {
  invalidateSubscriptionPlans,
  useRiderSubscriptionPlansQuery,
} from "@/hooks/queries/useSubscriptionPlansQuery";

export type SubscriptionPlanPrice = {
  id?: number;
  billingCycle: string;
  amount: number;
  gstPercent?: number;
  gstAmount?: number;
  totalAmount?: number;
  autoWalletDeduction: boolean;
  isActive?: boolean;
};

export type SubscriptionPlanBenefit = {
  id?: number;
  benefitKey: string;
  benefitValue: string;
  displayLabel: string | null;
  displayOrder: number;
};

export type RiderSubscriptionPlan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  badgeText: string | null;
  badgeColor: string;
  headline: string | null;
  ctaLabel: string;
  isActive: boolean;
  displayOrder: number;
  defaultBillingCycle?: string;
  prices: SubscriptionPlanPrice[];
  benefits: SubscriptionPlanBenefit[];
  createdAt?: string | null;
};

type FilterTab = "all" | "active" | "inactive";
type SortKey = "latest" | "name" | "order";

function formatCycleLabel(cycle: string) {
  return cycle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatInrCompact(amount: number) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount)}`;
}

export function RiderSubscriptionPlansAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useRiderSubscriptionPlansQuery();
  const plans = data?.plans ?? [];
  const stats = data?.stats ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<RiderSubscriptionPlan | null>(null);
  const [cloneFrom, setCloneFrom] = useState<RiderSubscriptionPlan | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("latest");
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const activeCount = plans.filter((p) => p.isActive).length;
  const showInitialLoader = isLoading && plans.length === 0;

  const filteredPlans = useMemo(() => {
    let list = [...plans];
    if (filterTab === "active") list = list.filter((p) => p.isActive);
    if (filterTab === "inactive") list = list.filter((p) => !p.isActive);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "order") return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      const da = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
      return db - da;
    });
    return list;
  }, [plans, filterTab, search, sortBy]);

  const handleRefresh = () => {
    invalidateSubscriptionPlans(qc, "RIDER");
    void refetch();
  };

  const openCreate = () => {
    setEditPlan(null);
    setCloneFrom(null);
    setFormOpen(true);
  };

  const toggleActive = async (plan: RiderSubscriptionPlan) => {
    if (plan.isActive) return;
    setTogglingId(plan.id);
    try {
      const res = await fetch(`/api/subscription-plans/${plan.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to activate");
      invalidateSubscriptionPlans(qc, "RIDER");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setTogglingId(null);
      setMenuOpenId(null);
    }
  };

  const deactivatePlan = async (plan: RiderSubscriptionPlan) => {
    setTogglingId(plan.id);
    try {
      const res = await fetch(`/api/subscription-plans/${plan.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to deactivate");
      invalidateSubscriptionPlans(qc, "RIDER");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setTogglingId(null);
      setMenuOpenId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Stats — top row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { label: "Active Plans", value: `${stats?.activePlans ?? activeCount} / ${stats?.totalPlans ?? plans.length}`, icon: Layers, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
          { label: "Subscribed Riders", value: String(stats?.subscribedRiders ?? 0), sub: "Live count", icon: Users, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
          { label: "Total Collected Amount", value: formatInrCompact(stats?.totalCollectedInr ?? 0), icon: IndianRupee, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
          {
            label: "Renewal Rate",
            value: stats?.renewalRatePct != null ? `${stats.renewalRatePct}%` : "—",
            sub:
              (stats?.totalEverSubscribed ?? 0) > 0
                ? `${stats?.ridersRenewed ?? 0} of ${stats?.totalEverSubscribed ?? 0} riders renewed`
                : "No subscriptions yet",
            icon: TrendingUp,
            iconBg: "bg-orange-100",
            iconColor: "text-orange-600",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 flex items-center gap-3 shadow-sm">
            <div className={`p-2 rounded-lg ${s.iconBg}`}>
              <s.icon className={`h-5 w-5 ${s.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
              <p className="text-base font-bold text-gray-900 leading-tight">{s.value}</p>
              {s.sub ? <p className="text-[10px] text-gray-400">{s.sub}</p> : null}
            </div>
          </div>
        ))}
      </div>

      {/* Filters + create */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
          {(
            [
              { key: "all" as const, label: `All (${plans.length})` },
              { key: "active" as const, label: `Active (${activeCount})` },
              { key: "inactive" as const, label: `Inactive (${plans.length - activeCount})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTab(key)}
              className={`px-2 py-1 text-xs font-medium rounded ${filterTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plan…"
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="latest">Latest</option>
          <option value="name">Name</option>
          <option value="order">Order</option>
        </select>
        {isFetching && plans.length > 0 ? (
          <span className="text-[10px] text-gray-400 animate-pulse ml-auto">Updating…</span>
        ) : null}
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Create Plan
        </button>
      </div>

      {showInitialLoader ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SubscriptionPlanCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-700 font-medium">Failed to load plans</p>
          <button type="button" onClick={handleRefresh} className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/30 px-4 py-10 text-center">
          <Crown className="h-10 w-10 text-violet-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">No rider plans</p>
          <button type="button" onClick={openCreate} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-md">
            <Plus className="h-3.5 w-3.5" /> Create Plan
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPlans.map((plan) => {
            const defaultCycle = plan.defaultBillingCycle ?? "daily";
            const activePrices = plan.prices.filter((p) => p.isActive !== false && p.amount > 0);
            const accentColor = plan.badgeColor || "#7C3AED";

            return (
              <div
                key={plan.id}
                className={`rounded-lg border bg-white shadow-sm overflow-hidden ${
                  plan.isActive ? "border-violet-200" : "border-gray-200"
                }`}
              >
                <div className="px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: `${accentColor}18` }}>
                      <Crown className="h-4 w-4" style={{ color: accentColor }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900">{plan.name}</h3>
                        {plan.badgeText ? (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-900 text-white">
                            {plan.badgeText}
                          </span>
                        ) : null}
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            plan.isActive ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {plan.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono">{plan.code}</p>
                      {plan.headline ? (
                        <p className="text-[11px] font-medium mt-0.5 italic leading-snug" style={{ color: accentColor }}>
                          {plan.headline}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Pricing · {formatCycleLabel(defaultCycle)}
                      </p>
                      <div className="space-y-0.5">
                        {activePrices.map((p) => (
                          <div key={p.billingCycle} className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
                            <span className="font-semibold text-gray-800 capitalize">{formatCycleLabel(p.billingCycle)}</span>
                            <span className="text-gray-600 text-right">
                              ₹{p.amount} + {p.gstPercent ?? 18}% = ₹{p.totalAmount ?? p.amount}
                              {p.autoWalletDeduction ? " · w" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Benefits</p>
                      <ul className="space-y-0.5">
                        {plan.benefits.slice(0, 5).map((b) => (
                          <li key={b.benefitKey} className="flex items-start gap-1 text-[11px] text-gray-700 leading-tight">
                            <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-px" />
                            <span className="line-clamp-1">{b.displayLabel || b.benefitKey}</span>
                          </li>
                        ))}
                        {plan.benefits.length > 5 ? (
                          <li className="text-[10px] text-gray-400 pl-4">+{plan.benefits.length - 5} more</li>
                        ) : null}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/40 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setEditPlan(plan); setCloneFrom(null); setFormOpen(true); }}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditPlan(null); setCloneFrom(plan); setFormOpen(true); }}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </button>
                  <div className="relative ml-auto">
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === plan.id ? null : plan.id)}
                      className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-600" />
                    </button>
                    {menuOpenId === plan.id ? (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 bottom-full mb-1 z-20 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                          {!plan.isActive ? (
                            <button type="button" disabled={togglingId === plan.id} onClick={() => void toggleActive(plan)} className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                              Set as active
                            </button>
                          ) : (
                            <button type="button" disabled={togglingId === plan.id} onClick={() => void deactivatePlan(plan)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Deactivate
                            </button>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInfoBanner ? (
        <div className="flex items-center gap-2 rounded-lg bg-violet-600 text-white px-3 py-2 text-xs">
          <Info className="h-4 w-4 shrink-0 opacity-90" />
          <p className="flex-1 leading-snug">Only one plan can be active at a time — activating a new plan deactivates the current one.</p>
          <button type="button" onClick={() => setShowInfoBanner(false)} className="p-0.5 rounded hover:bg-white/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <RiderSubscriptionPlanForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditPlan(null); setCloneFrom(null); }}
        onSuccess={() => invalidateSubscriptionPlans(qc, "RIDER")}
        editPlan={editPlan}
        cloneFrom={cloneFrom}
      />
    </div>
  );
}
