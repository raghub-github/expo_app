"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Pencil, Gift } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RiderSubscriptionPlanForm } from "./RiderSubscriptionPlanForm";

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
};

export function RiderSubscriptionPlansAdmin() {
  const [plans, setPlans] = useState<RiderSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<RiderSubscriptionPlan | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscription-plans", { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load");
      setPlans(json.data.plans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Manage rider membership plans (GMitra Max). All pricing & benefits sync to the rider app.
        </p>
        <button
          type="button"
          onClick={() => {
            setEditPlan(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Add Rider Plan
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 rounded-xl border border-gray-200 bg-gray-50/50">
          <LoadingSpinner />
          <p className="text-sm text-gray-500">Loading rider plans…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
          <button type="button" onClick={() => void fetchPlans()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 px-6 py-16 text-center">
          <Gift className="h-14 w-14 text-violet-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">No rider subscription plans</p>
          <p className="text-sm text-gray-500 mt-1">Run migration 0256 or create GMitra Max plan</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: plan.badgeColor || "#7C3AED" }}
                    >
                      {plan.badgeText || "PLAN"}
                    </span>
                    {!plan.isActive ? (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">Inactive</span>
                    ) : null}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-500">{plan.code}</p>
                  {plan.headline ? <p className="text-sm text-violet-700 mt-1 font-medium">{plan.headline}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditPlan(plan);
                    setFormOpen(true);
                  }}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <Pencil className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Pricing {plan.defaultBillingCycle ? `(app: ${plan.defaultBillingCycle.replace("_", " ")})` : ""}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {plan.prices.map((p) => (
                      <li key={p.billingCycle} className="flex justify-between gap-2">
                        <span className="capitalize text-gray-700">{p.billingCycle.replace("_", " ")}</span>
                        <span className="font-semibold text-right">
                          ₹{p.amount} + {p.gstPercent ?? 18}% GST = ₹{p.totalAmount ?? p.amount}
                          {p.autoWalletDeduction ? " · auto wallet" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Benefits</p>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {plan.benefits.map((b) => (
                      <li key={b.benefitKey}>✓ {b.displayLabel || b.benefitKey}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <RiderSubscriptionPlanForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditPlan(null);
        }}
        onSuccess={() => void fetchPlans()}
        editPlan={editPlan}
      />
    </div>
  );
}
