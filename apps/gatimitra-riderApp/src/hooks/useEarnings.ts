import { useQuery, useQueryClient } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import { isUnauthorizedError } from "@/src/services/http";

export type EarningsSummary = Awaited<ReturnType<typeof riderApi.getEarningsSummary>>;

export const DEFAULT_EARNINGS_SUMMARY: EarningsSummary = {
  totalBalance: 0,
  withdrawable: 0,
  locked: 0,
  subscriptionDebited: 0,
  thisWeek: 0,
  thisMonth: 0,
  hasBankAccount: false,
  breakdown: { food: 0, parcel: 0, ride: 0 },
  isFrozen: false,
  freezeReason: null,
  frozenAt: null,
  accountRestrictions: {
    accountRestricted: false,
    accountRestrictedReason: "none",
    globalWalletBlock: false,
    blacklistBlockedServices: [],
    allServicesBlacklisted: false,
    penaltyDue: 0,
    penaltyDutyStopped: false,
    penaltyEventId: null,
    penaltyTitle: null,
    penaltyFormattedOrderId: null,
  },
};

export const EARNINGS_QUERY_KEY = ["rider", "earnings", "summary"] as const;

export function useEarningsSummary() {
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const accessToken = useSessionStore((s) => s.session?.accessToken);
  const canFetch = sessionHydrated && Boolean(accessToken);

  return useQuery({
    queryKey: EARNINGS_QUERY_KEY,
    queryFn: () => riderApi.getEarningsSummary(),
    enabled: canFetch,
    placeholderData: (previous) => previous ?? DEFAULT_EARNINGS_SUMMARY,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: canFetch ? 60_000 : false,
    retry: (count, error) => {
      if (isUnauthorizedError(error)) return false;
      return count < 2;
    },
  });
}

export function prefetchEarningsSummary(queryClient: ReturnType<typeof useQueryClient>) {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: EARNINGS_QUERY_KEY,
    queryFn: () => riderApi.getEarningsSummary(),
    staleTime: 60_000,
  });
}
