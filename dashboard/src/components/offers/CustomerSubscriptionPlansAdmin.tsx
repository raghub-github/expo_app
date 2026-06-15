"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Pencil,
  Copy,
  MoreHorizontal,
  Gift,
  Star,
  Check,
  Info,
  X,
  Layers,
  Users,
  IndianRupee,
  TrendingUp,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Percent,
  Headphones,
  Wallet,
  Calendar,
  Clock,
} from "lucide-react";
import { CustomerSubscriptionPlanForm } from "./CustomerSubscriptionPlanForm";
import {
  invalidateSubscriptionPlans,
  useCustomerSubscriptionPlansQuery,
  type CustomerSubscriptionPlanStats,
} from "@/hooks/queries/useSubscriptionPlansQuery";

export type CustomerSubscriptionPlanPrice = {
  id?: number;
  billingCycle: string;
  amount: number;
  gstPercent?: number;
  gstAmount?: number;
  totalAmount?: number;
  isActive?: boolean;
};

export type CustomerSubscriptionPlanBenefit = {
  id?: number;
  benefitKey: string;
  benefitValue: string;
  displayLabel: string | null;
  displayOrder: number;
};

export type CustomerSubscriptionPlan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  badgeText: string | null;
  badgeColor: string;
  headline: string | null;
  ctaLabel: string;
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
  defaultBillingCycle?: string;
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  discountPercentage: number | null;
  cashbackEnabled: boolean;
  cashbackPercentage: number | null;
  prioritySupport: boolean;
  prices: CustomerSubscriptionPlanPrice[];
  benefits: CustomerSubscriptionPlanBenefit[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

const CYCLE_ORDER = ["monthly", "yearly", "weekly"] as const;

function formatCycleLabel(cycle: string) {
  return cycle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-[11px] font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {pct}% this month
    </span>
  );
}

function PlanToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-gray-200"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function StatCard({
  label,
  value,
  sub,
  growth,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  sub?: string;
  growth?: number | null;
  icon: typeof Layers;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
      <div className={`p-2 rounded-lg ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        {growth != null ? <GrowthBadge pct={growth} /> : sub ? <p className="text-[11px] text-gray-400">{sub}</p> : null}
      </div>
    </div>
  );
}

function PlanListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
            <div className="h-6 w-11 bg-gray-200 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function cycleSortIndex(cycle: string) {
  const idx = CYCLE_ORDER.indexOf(cycle as (typeof CYCLE_ORDER)[number]);
  return idx === -1 ? CYCLE_ORDER.length : idx;
}

function getActivePrices(plan: CustomerSubscriptionPlan) {
  return plan.prices
    .filter((p) => p.isActive !== false && p.amount >= 0)
    .sort((a, b) => cycleSortIndex(a.billingCycle) - cycleSortIndex(b.billingCycle));
}

function getFromPriceLabel(plan: CustomerSubscriptionPlan) {
  const active = getActivePrices(plan).filter((p) => p.amount > 0);
  if (active.length === 0) {
    const zero = getActivePrices(plan)[0];
    const gst = zero?.gstPercent ?? 18;
    return `From ₹0 + ${gst}% GST`;
  }
  const min = active.reduce((a, b) => (a.amount < b.amount ? a : b));
  return `From ₹${min.amount} + ${min.gstPercent ?? 18}% GST`;
}

export function CustomerSubscriptionPlansAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useCustomerSubscriptionPlansQuery();
  const plans = data?.plans ?? [];
  const stats = data?.stats ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<CustomerSubscriptionPlan | null>(null);
  const [cloneFrom, setCloneFrom] = useState<CustomerSubscriptionPlan | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const activeCount = plans.filter((p) => p.isActive).length;
  const showInitialLoader = isLoading && plans.length === 0;

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) ||
          (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) ||
          a.displayOrder - b.displayOrder
      ),
    [plans]
  );

  const defaultExpandedId = useMemo(() => {
    const featured = sortedPlans.find((p) => p.isFeatured);
    if (featured) return featured.id;
    const active = sortedPlans.find((p) => p.isActive);
    return active?.id ?? sortedPlans[0]?.id ?? null;
  }, [sortedPlans]);

  useEffect(() => {
    if (defaultExpandedId != null && expandedIds.size === 0 && !isLoading) {
      setExpandedIds(new Set([defaultExpandedId]));
    }
  }, [defaultExpandedId, expandedIds.size, isLoading]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditPlan(null);
    setCloneFrom(null);
    setFormOpen(true);
  };

  const openEdit = (plan: CustomerSubscriptionPlan) => {
    setEditPlan(plan);
    setCloneFrom(null);
    setFormOpen(true);
  };

  const openClone = (plan: CustomerSubscriptionPlan) => {
    setEditPlan(null);
    setCloneFrom(plan);
    setFormOpen(true);
  };

  const toggleActive = async (plan: CustomerSubscriptionPlan, next: boolean) => {
    setTogglingId(plan.id);
    try {
      const res = await fetch(`/api/customer-subscription-plans/${plan.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update plan");
      invalidateSubscriptionPlans(qc, "CUSTOMER");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setTogglingId(null);
      setMenuOpenId(null);
    }
  };

  const setFeatured = async (plan: CustomerSubscriptionPlan) => {
    setTogglingId(plan.id);
    try {
      const res = await fetch(`/api/customer-subscription-plans/${plan.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: true, isActive: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to set featured");
      invalidateSubscriptionPlans(qc, "CUSTOMER");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setTogglingId(null);
      setMenuOpenId(null);
    }
  };

  const statCards = useMemo(() => {
    const s = stats as CustomerSubscriptionPlanStats | null;
    return [
      {
        label: "Active Plans",
        value: `${s?.activePlans ?? activeCount} of ${s?.totalPlans ?? plans.length} total plans`,
        icon: Layers,
        iconBg: "bg-violet-100",
        iconColor: "text-violet-600",
      },
      {
        label: "Total Subscribers",
        value: String(s?.totalSubscribers ?? 0),
        growth: s?.subscriberGrowthPct ?? null,
        icon: Users,
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
      },
      {
        label: "Total Revenue (MRR)",
        value: formatInr(s?.monthlyRevenueInr ?? 0),
        growth: s?.revenueGrowthPct ?? null,
        icon: IndianRupee,
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
      },
      {
        label: "Conversion Rate",
        value: s?.conversionRatePct != null ? `${s.conversionRatePct}%` : "—",
        growth: s?.conversionGrowthPct ?? null,
        sub: s?.conversionRatePct == null ? "Analytics coming soon" : undefined,
        icon: TrendingUp,
        iconBg: "bg-orange-100",
        iconColor: "text-orange-600",
      },
    ];
  }, [stats, activeCount, plans.length]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isFetching && plans.length > 0 ? (
          <span className="text-[10px] text-gray-400 animate-pulse mr-auto">Updating…</span>
        ) : null}
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Add Customer Plan
        </button>
      </div>

      {/* Plans list */}
      {showInitialLoader ? (
        <PlanListSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700 font-medium">Failed to load plans</p>
          <button
            type="button"
            onClick={() => {
              invalidateSubscriptionPlans(qc, "CUSTOMER");
              void refetch();
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : sortedPlans.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 px-6 py-14 text-center">
          <Gift className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-700">No customer plans yet</p>
          <p className="text-sm text-gray-500 mt-1">Create a plan for checkout & profile</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg"
          >
            <Plus className="h-4 w-4" /> Add Customer Plan
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPlans.map((plan) => {
            const expanded = expandedIds.has(plan.id);
            const activePrices = getActivePrices(plan);
            const sortedBenefits = [...plan.benefits].sort((a, b) => a.displayOrder - b.displayOrder);

            if (!expanded) {
              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm flex items-center gap-2 px-3 py-2.5"
                >
                  <GripVertical className="h-4 w-4 text-gray-300 shrink-0 cursor-grab" aria-hidden />
                  <button
                    type="button"
                    onClick={() => toggleExpand(plan.id)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{plan.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{plan.code}</span>
                        {plan.badgeText ? (
                          <span
                            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                            style={{ backgroundColor: plan.badgeColor || "#7C3AED" }}
                          >
                            {plan.badgeText}
                          </span>
                        ) : null}
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            plan.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {plan.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 hidden sm:block">{getFromPriceLabel(plan)}</span>
                  </button>
                  <PlanToggle
                    checked={plan.isActive}
                    disabled={togglingId === plan.id}
                    onChange={(next) => void toggleActive(plan, next)}
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === plan.id ? null : plan.id)}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-600" />
                    </button>
                    {menuOpenId === plan.id ? (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                          <button type="button" onClick={() => openEdit(plan)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            Edit plan
                          </button>
                          <button type="button" onClick={() => openClone(plan)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            Duplicate
                          </button>
                          {!plan.isFeatured ? (
                            <button type="button" onClick={() => void setFeatured(plan)} className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                              Set as featured
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => toggleExpand(plan.id)} className="p-1 rounded-lg hover:bg-gray-50">
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
                  plan.isFeatured ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200"
                }`}
              >
                {/* Expanded header */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-gray-100">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {plan.isFeatured ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <Star className="h-3 w-3 fill-current" /> Featured
                        </span>
                      ) : null}
                      {plan.badgeText ? (
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: plan.badgeColor || "#7C3AED" }}
                        >
                          {plan.badgeText}
                        </span>
                      ) : null}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          plan.isActive ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {plan.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{plan.code}</p>
                    {plan.headline ? (
                      <p className="text-sm text-emerald-700 font-medium mt-1">{plan.headline}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(plan)}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openClone(plan)}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <PlanToggle
                      checked={plan.isActive}
                      disabled={togglingId === plan.id}
                      onChange={(next) => void toggleActive(plan, next)}
                    />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuOpenId(menuOpenId === plan.id ? null : plan.id)}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-600" />
                      </button>
                      {menuOpenId === plan.id ? (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                            {!plan.isFeatured ? (
                              <button type="button" onClick={() => void setFeatured(plan)} className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                                Set as featured
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void toggleActive(plan, false)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Deactivate
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => toggleExpand(plan.id)} className="p-2 rounded-lg hover:bg-gray-50">
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* Three columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                  {/* Pricing */}
                  <div className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pricing</p>
                    {activePrices.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No pricing cycles configured</p>
                    ) : (
                      <div className="space-y-2">
                        {activePrices.map((p) => (
                          <div key={p.billingCycle} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold text-gray-800 capitalize">{formatCycleLabel(p.billingCycle)}</span>
                            <span className="text-gray-600">
                              ₹{p.amount} + {p.gstPercent ?? 18}% GST
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Benefits */}
                  <div className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Benefits</p>
                    <ul className="space-y-1.5">
                      {sortedBenefits.map((b) => (
                        <li key={b.benefitKey} className="flex items-start gap-2 text-sm text-gray-700">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{b.displayLabel || b.benefitKey}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.freeDeliveryEnabled ? (
                      <span className="inline-flex mt-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                        Free delivery within {plan.maxFreeDeliveryRadiusKm} KM
                      </span>
                    ) : null}
                  </div>

                  {/* Configuration */}
                  <div className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Configuration</p>
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="flex items-center gap-1.5 text-gray-600">
                          <Percent className="h-3.5 w-3.5 text-gray-400" /> Discount
                        </dt>
                        <dd className="font-semibold text-emerald-600">
                          {plan.discountPercentage != null ? `${plan.discountPercentage}%` : "—"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="flex items-center gap-1.5 text-gray-600">
                          <Headphones className="h-3.5 w-3.5 text-gray-400" /> Priority support
                        </dt>
                        <dd>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              plan.prioritySupport ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {plan.prioritySupport ? "Enabled" : "Disabled"}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="flex items-center gap-1.5 text-gray-600">
                          <Wallet className="h-3.5 w-3.5 text-gray-400" /> Cashback
                        </dt>
                        <dd>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              plan.cashbackEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {plan.cashbackEnabled
                              ? plan.cashbackPercentage != null
                                ? `${plan.cashbackPercentage}%`
                                : "Enabled"
                              : "Disabled"}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                        <dt className="flex items-center gap-1.5 text-gray-500 text-xs">
                          <Calendar className="h-3.5 w-3.5" /> Created At
                        </dt>
                        <dd className="text-xs text-gray-600">{formatDateTime(plan.createdAt)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="flex items-center gap-1.5 text-gray-500 text-xs">
                          <Clock className="h-3.5 w-3.5" /> Updated At
                        </dt>
                        <dd className="text-xs text-gray-600">{formatDateTime(plan.updatedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInfoBanner ? (
        <div className="flex items-center gap-2 rounded-lg bg-violet-600 text-white px-4 py-2.5 text-sm">
          <Info className="h-4 w-4 shrink-0 opacity-90" />
          <p className="flex-1 leading-snug">
            Only active plans with at least one pricing cycle will be shown to customers in the app.
          </p>
          <button type="button" onClick={() => setShowInfoBanner(false)} className="p-0.5 rounded hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <CustomerSubscriptionPlanForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditPlan(null);
          setCloneFrom(null);
        }}
        onSuccess={() => invalidateSubscriptionPlans(qc, "CUSTOMER")}
        editPlan={editPlan}
        cloneFrom={cloneFrom}
      />
    </div>
  );
}
