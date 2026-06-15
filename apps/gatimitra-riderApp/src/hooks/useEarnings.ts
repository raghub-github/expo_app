import { useQuery, useQueryClient } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";

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
};

const EARNINGS_QUERY_KEY = ["rider", "earnings", "summary"] as const;

export function useEarningsSummary() {
  return useQuery({
    queryKey: EARNINGS_QUERY_KEY,
    queryFn: () => riderApi.getEarningsSummary(),
    placeholderData: (previous) => previous ?? DEFAULT_EARNINGS_SUMMARY,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 30_000,
    retry: 2,
  });
}

export function prefetchEarningsSummary(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.prefetchQuery({
    queryKey: EARNINGS_QUERY_KEY,
    queryFn: () => riderApi.getEarningsSummary(),
    staleTime: 60_000,
  });
}
