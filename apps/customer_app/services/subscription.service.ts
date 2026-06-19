/**
 * Customer subscription plans — fetched from Super Admin managed backend.
 */

import api from "./api";

export type SubscriptionPlanPrice = {
  id: number;
  billingCycle: string;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  cycleLabel: string;
  isActive?: boolean;
};

export type SubscriptionPlan = {
  id: number;
  code: string;
  planName: string;
  name: string;
  description: string | null;
  badgeText: string | null;
  badgeColor: string | null;
  headline: string | null;
  ctaLabel: string;
  isActive: boolean;
  isFeatured: boolean;
  defaultBillingCycle: string;
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  discountPercentage: number | null;
  cashbackEnabled: boolean;
  cashbackPercentage: number | null;
  prioritySupport: boolean;
  benefits: string[];
  prices: SubscriptionPlanPrice[];
  featuredPrice: {
    billingCycle: string;
    cycleLabel: string;
    subtotal: number;
    gstPercent: number;
    gstAmount: number;
    total: number;
  } | null;
};

export type CurrentSubscription = {
  active: boolean;
  subscription: {
    id: number;
    planId: number;
    planName: string;
    planCode: string;
    billingCycle: string;
    status: string;
    startsAt: string;
    expiresAt: string;
    amountPaid: number | null;
  } | null;
  plan: {
    planId: number;
    planName: string;
    badgeText: string | null;
    freeDeliveryEnabled: boolean;
    maxFreeDeliveryRadiusKm: number;
    discountPercentage: number | null;
    cashbackEnabled: boolean;
    cashbackPercentage: number | null;
    prioritySupport: boolean;
    benefits: string[];
  } | null;
};

export async function fetchActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const res = await api.get<{ success: boolean; plans: SubscriptionPlan[] }>(
    "/v1/subscription-plans/active",
    { headers: { "X-Silent-Error": "1" } }
  );
  return res.data.plans ?? [];
}

export async function fetchCurrentSubscription(): Promise<CurrentSubscription> {
  const res = await api.get<CurrentSubscription>("/v1/subscription/current", {
    headers: { "X-Silent-Error": "1" },
  });
  return res.data;
}

export function formatPlanPriceLine(price: SubscriptionPlanPrice): string {
  return `₹${Math.round(price.amount)} for 1 ${price.cycleLabel}`;
}

export function pickCheckoutPlan(plans: SubscriptionPlan[]): SubscriptionPlan | null {
  if (plans.length === 0) return null;
  return plans.find((p) => p.isFeatured) ?? plans[0] ?? null;
}

export function pickDefaultPrice(plan: SubscriptionPlan): SubscriptionPlanPrice | null {
  const cycle = plan.defaultBillingCycle;
  return (
    plan.prices.find((p) => p.billingCycle === cycle && p.isActive !== false) ??
    plan.prices.find((p) => p.isActive !== false) ??
    plan.prices[0] ??
    null
  );
}

export function buildAddPlanCopy(plan: SubscriptionPlan, price: SubscriptionPlanPrice | null): string {
  if (!price) return `Add ${plan.planName}`;
  return `Add ${plan.planName} at ${formatPlanPriceLine(price)}`;
}
