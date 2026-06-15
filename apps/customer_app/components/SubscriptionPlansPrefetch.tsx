import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { prefetchSubscriptionPlans } from "@/lib/subscriptionCache";

/** Warm subscription plans after login so checkout offers row is instant. */
export function SubscriptionPlansPrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!hydrated || !session) return;
    void prefetchSubscriptionPlans(queryClient);
  }, [hydrated, session, queryClient]);

  return null;
}
