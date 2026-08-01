import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson, patchJson, postJson } from "@/src/services/http";
import {
  getCachedRiderSubscriptionStatus,
  persistRiderSubscriptionStatus,
} from "@/src/lib/rider-subscription-cache";

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

export type RiderSubscriptionAlertBanner = {
  visible: boolean;
  variant: "warning" | "restricted";
  reasonCode:
    | "none"
    | "negative_wallet"
    | "dues_outstanding"
    | "negative_limit"
    | "dispatch_blocked";
  title: string;
  subtitle: string;
  totalDue: number;
  payableNow: number;
  payButtonLabel: string;
  canPayFromWallet: boolean;
  walletBalance: number;
  duesOutstanding: number;
  dispatchBlocked: boolean;
  negativeLimit: number;
  incomeFreezeDays: number;
  penaltyStreakDays?: number;
};

export type RiderSubscriptionDues = {
  totalDue: number;
  duesOutstanding: number;
  walletBalance: number;
  dispatchBlocked: boolean;
  alertBanner?: RiderSubscriptionAlertBanner;
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
    nextRenewalDate?: string | null;
    lastDeductionDate?: string;
    renewalMode?: "on_first_accept" | "schedule";
  } | null;
  dues?: RiderSubscriptionDues;
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
  const cached = getCachedRiderSubscriptionStatus() as RiderSubscriptionStatus | null;

  return useQuery({
    queryKey: ["rider", "subscription", "status"],
    queryFn: async () => {
      const json = await getJson<{
        success: boolean;
        active: boolean;
        plan: RiderSubscriptionStatus["plan"];
        dues?: RiderSubscriptionDues;
      }>(`${API_BASE()}/v1/rider/subscription/status`, {
        headers: authHeaders(session!.accessToken),
      });
      const next = {
        active: json.active,
        plan: json.plan,
        dues: json.dues ?? {
          totalDue: 0,
          duesOutstanding: 0,
          walletBalance: 0,
          dispatchBlocked: false,
          alertBanner: {
            visible: false,
            variant: "warning" as const,
            reasonCode: "none" as const,
            title: "",
            subtitle: "",
            totalDue: 0,
            payableNow: 0,
            payButtonLabel: "",
            canPayFromWallet: false,
            walletBalance: 0,
            duesOutstanding: 0,
            dispatchBlocked: false,
            negativeLimit: 35,
            incomeFreezeDays: 3,
          },
        },
      } satisfies RiderSubscriptionStatus;
      void persistRiderSubscriptionStatus(next);
      return next;
    },
    enabled: Boolean(session?.accessToken),
    // Instant MAX badge from disk/memory; refresh in background.
    initialData: cached ?? undefined,
    staleTime: 60_000,
    refetchOnMount: true,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous ?? cached ?? undefined,
    retry: 2,
  });
}

export function prefetchRiderSubscriptionStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string
) {
  return queryClient.prefetchQuery({
    queryKey: ["rider", "subscription", "status"],
    queryFn: async () => {
      const json = await getJson<{
        success: boolean;
        active: boolean;
        plan: RiderSubscriptionStatus["plan"];
        dues?: RiderSubscriptionDues;
      }>(`${API_BASE()}/v1/rider/subscription/status`, {
        headers: authHeaders(accessToken),
      });
      return {
        active: json.active,
        plan: json.plan,
        dues: json.dues ?? {
          totalDue: 0,
          duesOutstanding: 0,
          walletBalance: 0,
          dispatchBlocked: false,
          alertBanner: {
            visible: false,
            variant: "warning",
            reasonCode: "none",
            title: "",
            subtitle: "",
            totalDue: 0,
            payableNow: 0,
            payButtonLabel: "",
            canPayFromWallet: false,
            walletBalance: 0,
            duesOutstanding: 0,
            dispatchBlocked: false,
            negativeLimit: 35,
            incomeFreezeDays: 3,
          },
        },
      } satisfies RiderSubscriptionStatus;
    },
    staleTime: 60_000,
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

function useInvalidateSubscription() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "ledger"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
  };
}

export function useRiderSubscriptionWallet() {
  const session = useSessionStore((s) => s.session);
  const invalidate = useInvalidateSubscription();

  const subscribeWallet = useMutation({
    mutationFn: async (payload: {
      planId: number;
      billingCycle?: BillingCycle;
      autoWalletDeduction?: boolean;
    }) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{
        success: boolean;
        subscriptionId: number;
        amountPaid: number;
        autoWalletDeduction: boolean;
      }>(`${API_BASE()}/v1/rider/subscription/subscribe-wallet`, payload, {
        headers: authHeaders(session.accessToken),
      });
    },
    onSuccess: invalidate,
  });

  const setAutoRenewal = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return patchJson<{ success: boolean; autoWalletDeduction: boolean; nextRenewalDate: string }>(
        `${API_BASE()}/v1/rider/subscription/auto-renewal`,
        { enabled },
        { headers: authHeaders(session.accessToken) }
      );
    },
    onSuccess: invalidate,
  });

  return { subscribeWallet, setAutoRenewal };
}

export function useRiderSubscriptionPayDues() {
  const session = useSessionStore((s) => s.session);
  const invalidate = useInvalidateSubscription();

  return useMutation({
    mutationFn: async () => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{
        success: boolean;
        paidAmount: number;
        totalDueBefore: number;
        totalDueAfter: number;
      }>(`${API_BASE()}/v1/rider/subscription/pay-dues`, {}, {
        headers: authHeaders(session.accessToken),
      });
    },
    onSuccess: invalidate,
  });
}

/** @deprecated Razorpay flow — wallet subscribe is preferred */
export function useRiderSubscriptionPayment() {
  const session = useSessionStore((s) => s.session);
  const invalidate = useInvalidateSubscription();

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
