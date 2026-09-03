/**
 * Backend-authoritative onboarding + eligibility summary (Phase D). Powers the onboarding
 * service-impact notice, the payment-gate message (§7), and Profile → Documents. Refetches
 * on focus so a document verified elsewhere (Cashfree callback / agent) upgrades eligibility
 * in near real-time (§21). The app only RENDERS this — it never computes eligibility.
 */
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { riderApi, type RiderOnboardingSummary } from "@/src/services/api/riderApi";

export const RIDER_ONBOARDING_SUMMARY_QUERY_KEY = ["rider", "onboarding", "summary"] as const;

export function useRiderOnboardingSummary(opts?: { enabled?: boolean }) {
  const session = useSessionStore((s) => s.session);
  const authed = Boolean(session?.accessToken);

  const query = useQuery<RiderOnboardingSummary>({
    queryKey: RIDER_ONBOARDING_SUMMARY_QUERY_KEY,
    queryFn: () => riderApi.getOnboardingSummary(),
    enabled: authed && opts?.enabled !== false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    summary: query.data ?? null,
    onboarding: query.data?.onboarding ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
