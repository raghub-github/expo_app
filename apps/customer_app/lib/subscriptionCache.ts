import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import {
  fetchActiveSubscriptionPlans,
  fetchCurrentSubscription,
  type SubscriptionPlan,
} from "@/services/subscription.service";

export const ACTIVE_PLANS_QUERY_KEY = ["subscription-plans", "active"] as const;
export const CURRENT_SUBSCRIPTION_QUERY_KEY = ["subscription", "current"] as const;

export const SUBSCRIPTION_PLANS_STALE_MS = 10 * 60 * 1000;
export const SUBSCRIPTION_PLANS_GC_MS = 30 * 60 * 1000;

export const ACTIVE_PLANS_QUERY_OPTIONS = {
  queryKey: ACTIVE_PLANS_QUERY_KEY,
  staleTime: SUBSCRIPTION_PLANS_STALE_MS,
  gcTime: SUBSCRIPTION_PLANS_GC_MS,
  retry: 1,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  placeholderData: (prev: SubscriptionPlan[] | undefined) => prev,
};

export async function readCachedSubscriptionPlans(): Promise<SubscriptionPlan[] | undefined> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_PLANS_CACHE);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SubscriptionPlan[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCachedSubscriptionPlans(plans: SubscriptionPlan[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_PLANS_CACHE, JSON.stringify(plans));
  } catch {
    // Non-blocking — React Query memory cache still works.
  }
}

export async function hydrateSubscriptionPlansCache(
  queryClient: QueryClient
): Promise<SubscriptionPlan[] | undefined> {
  const cached = await readCachedSubscriptionPlans();
  if (cached && cached.length > 0) {
    queryClient.setQueryData(ACTIVE_PLANS_QUERY_KEY, cached);
  }
  return cached;
}

export async function fetchActivePlansWithCache(): Promise<SubscriptionPlan[]> {
  const plans = await fetchActiveSubscriptionPlans();
  if (plans.length > 0) {
    await writeCachedSubscriptionPlans(plans);
  }
  return plans;
}

/** Warm subscription plans + current membership for instant checkout paint. */
export async function prefetchSubscriptionPlans(queryClient: QueryClient): Promise<void> {
  await hydrateSubscriptionPlansCache(queryClient);
  await Promise.all([
    queryClient.prefetchQuery({
      ...ACTIVE_PLANS_QUERY_OPTIONS,
      queryFn: fetchActivePlansWithCache,
    }),
    queryClient.prefetchQuery({
      queryKey: CURRENT_SUBSCRIPTION_QUERY_KEY,
      queryFn: fetchCurrentSubscription,
      staleTime: 60 * 1000,
      gcTime: SUBSCRIPTION_PLANS_GC_MS,
      retry: 1,
      refetchOnMount: false,
    }),
  ]);
}
