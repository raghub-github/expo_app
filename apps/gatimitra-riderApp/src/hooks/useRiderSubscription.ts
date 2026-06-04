import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson, postJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type BillingCycle = "daily" | "monthly" | "semi_yearly" | "yearly";

export type PlanPrice = {
  id: number;
  billingCycle: BillingCycle;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  autoWalletDeduction: boolean;
  cycleLabel: string;
};

export type FeaturedPrice = {
  billingCycle: BillingCycle;
  cycleLabel: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
};

export type RiderSubscriptionPlan = {
  id: number;
  code: string;
  planName: string;
  planCode: string;
  description: string | null;
  badgeText: string;
  badgeColor: string;
  headline: string;
  tagline: string;
  ctaLabel: string;
  defaultBillingCycle: BillingCycle;
  benefits: string[];
  prices: PlanPrice[];
  featuredPrice: FeaturedPrice | null;
};

export type RiderSubscriptionStatus = {
  active: boolean;
  plan: {
    planId: number;
    planName: string;
    planCode: string;
    billingCycle: string;
    subscriptionStatus: string;
    autoWalletDeduction: boolean;
    startDate: string;
    expiryDate: string;
  } | null;
};

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function useRiderSubscriptionPlans() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "subscription", "plans"],
    queryFn: async () => {
      const json = await getJson<{ success: boolean; plans: RiderSubscriptionPlan[] }>(
        `${API_BASE()}/v1/rider/subscription/plans`,
        session?.accessToken ? { headers: authHeaders(session.accessToken) } : undefined
      );
      return json.plans ?? [];
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 60_000,
    retry: 2,
  });
}

export function useRiderSubscriptionStatus() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "subscription", "status"],
    queryFn: async () => {
      const json = await getJson<{ success: boolean; active: boolean; plan: RiderSubscriptionStatus["plan"] }>(
        `${API_BASE()}/v1/rider/subscription/status`,
        { headers: authHeaders(session!.accessToken) }
      );
      return { active: json.active, plan: json.plan };
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: 2,
  });
}

export function pickFeaturedPlan(plans: RiderSubscriptionPlan[]): RiderSubscriptionPlan | null {
  if (!plans.length) return null;
  return plans.find((p) => p.code === "GMITRA_MAX") ?? plans[0] ?? null;
}

export function billingCycleLabel(cycle: BillingCycle): string {
  switch (cycle) {
    case "daily":
      return "Daily";
    case "monthly":
      return "Monthly";
    case "semi_yearly":
      return "Semi-Yearly";
    case "yearly":
      return "Yearly";
    default:
      return cycle;
  }
}

export function useRiderSubscriptionPayment() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
  };

  const createOrder = useMutation({
    mutationFn: async (payload: { planId: number; billingCycle?: BillingCycle }) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{
        success: boolean;
        orderId: string;
        keyId: string;
        amount: number;
        gstPercent?: number;
        currency: string;
        skipPayment?: boolean;
        subscriptionId?: number;
      }>(
        `${API_BASE()}/v1/rider/subscription/create-payment-order`,
        payload,
        { headers: authHeaders(session.accessToken) }
      );
    },
    onSuccess: invalidate,
  });

  const verifyPayment = useMutation({
    mutationFn: async (payload: {
      planId: number;
      billingCycle?: BillingCycle;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{ success: boolean }>(
        `${API_BASE()}/v1/rider/subscription/verify-payment`,
        payload,
        { headers: authHeaders(session.accessToken) }
      );
    },
    onSuccess: invalidate,
  });

  return { createOrder, verifyPayment };
}
