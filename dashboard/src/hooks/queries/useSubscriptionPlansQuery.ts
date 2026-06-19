"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RiderSubscriptionPlan } from "@/components/offers/RiderSubscriptionPlansAdmin";
import type { CustomerSubscriptionPlan } from "@/components/offers/CustomerSubscriptionPlansAdmin";

export type SubscriptionPlanStats = {
  activePlans: number;
  totalPlans: number;
  subscribedRiders: number;
  totalCollectedInr: number;
  renewalRatePct: number | null;
  ridersRenewed: number;
  totalEverSubscribed: number;
};

type Audience = "RIDER" | "CUSTOMER";

type RiderPlansResponse = {
  plans: RiderSubscriptionPlan[];
  total: number;
  stats: SubscriptionPlanStats | null;
};

export type CustomerSubscriptionPlanStats = {
  activePlans: number;
  totalPlans: number;
  totalSubscribers: number;
  subscriberGrowthPct: number | null;
  monthlyRevenueInr: number;
  revenueGrowthPct: number | null;
  conversionRatePct: number | null;
  conversionGrowthPct: number | null;
};

type CustomerPlansResponse = {
  plans: CustomerSubscriptionPlan[];
  total: number;
  stats: CustomerSubscriptionPlanStats | null;
};

async function fetchRiderPlans(search?: string): Promise<RiderPlansResponse> {
  const params = new URLSearchParams({ audience: "RIDER", stats: "1" });
  if (search?.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/subscription-plans?${params}`, { credentials: "include" });
  if (res.status === 401) throw new Error("Session expired");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch plans");
  return {
    plans: json.data.plans ?? [],
    total: json.data.total ?? 0,
    stats: json.data.stats ?? null,
  };
}

async function fetchCustomerPlans(search?: string): Promise<CustomerPlansResponse> {
  const params = new URLSearchParams({ stats: "1" });
  if (search?.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/customer-subscription-plans?${params}`, { credentials: "include" });
  if (res.status === 401) throw new Error("Session expired");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch plans");
  return {
    plans: json.data.plans ?? [],
    total: json.data.total ?? 0,
    stats: json.data.stats ?? null,
  };
}

const QUERY_OPTS = {
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  retry: 1,
};

export function useRiderSubscriptionPlansQuery(search?: string) {
  const searchKey = search?.trim() ?? "";
  const fetchPlans = useCallback(() => fetchRiderPlans(searchKey), [searchKey]);

  return useQuery({
    queryKey: ["offers", "subscription-plans", "RIDER", searchKey],
    queryFn: fetchPlans,
    ...QUERY_OPTS,
    placeholderData: (prev: RiderPlansResponse | undefined) => prev,
  });
}

export function useCustomerSubscriptionPlansQuery(search?: string) {
  const searchKey = search?.trim() ?? "";
  const fetchPlans = useCallback(() => fetchCustomerPlans(searchKey), [searchKey]);

  return useQuery({
    queryKey: ["offers", "subscription-plans", "CUSTOMER", searchKey],
    queryFn: fetchPlans,
    ...QUERY_OPTS,
    placeholderData: (prev: CustomerPlansResponse | undefined) => prev,
  });
}

/** Prefetch rider + customer plans as soon as the offers page mounts. */
export function usePrefetchSubscriptionPlans() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.prefetchQuery({
      queryKey: ["offers", "subscription-plans", "RIDER", ""],
      queryFn: () => fetchRiderPlans(""),
      staleTime: QUERY_OPTS.staleTime,
    });
    void qc.prefetchQuery({
      queryKey: ["offers", "subscription-plans", "CUSTOMER", ""],
      queryFn: () => fetchCustomerPlans(""),
      staleTime: QUERY_OPTS.staleTime,
    });
  }, [qc]);
}

export function invalidateSubscriptionPlans(qc: ReturnType<typeof useQueryClient>, audience?: Audience) {
  if (audience) {
    void qc.invalidateQueries({ queryKey: ["offers", "subscription-plans", audience] });
    return;
  }
  void qc.invalidateQueries({ queryKey: ["offers", "subscription-plans"] });
}
