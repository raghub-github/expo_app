import { useQuery } from "@tanstack/react-query";
import {
  fetchCurrentSubscription,
  pickCheckoutPlan,
  pickDefaultPrice,
  type SubscriptionPlan,
} from "@/services/subscription.service";
import {
  ACTIVE_PLANS_QUERY_OPTIONS,
  CURRENT_SUBSCRIPTION_QUERY_KEY,
  fetchActivePlansWithCache,
  SUBSCRIPTION_PLANS_GC_MS,
} from "@/lib/subscriptionCache";

export function useActiveSubscriptionPlans() {
  return useQuery({
    ...ACTIVE_PLANS_QUERY_OPTIONS,
    queryFn: fetchActivePlansWithCache,
  });
}

export function useCurrentSubscription(enabled = true) {
  return useQuery({
    queryKey: CURRENT_SUBSCRIPTION_QUERY_KEY,
    queryFn: fetchCurrentSubscription,
    enabled,
    staleTime: 30 * 1000,
    gcTime: SUBSCRIPTION_PLANS_GC_MS,
    retry: 1,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
}

export function useCheckoutSubscriptionPlan() {
  const query = useActiveSubscriptionPlans();
  const plans = query.data ?? [];
  const checkoutPlan = pickCheckoutPlan(plans);
  const defaultPrice = checkoutPlan ? pickDefaultPrice(checkoutPlan) : null;
  const hasCachedPlans = plans.length > 0;
  return {
    ...query,
    checkoutPlan,
    defaultPrice,
    hasPlans: hasCachedPlans,
    /** True only when no cached plans exist yet — do not block billing UI on this. */
    plansInitialLoading: query.isLoading && !hasCachedPlans,
  };
}

export type { SubscriptionPlan };
