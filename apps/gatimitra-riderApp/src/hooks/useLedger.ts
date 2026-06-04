import { useInfiniteQuery } from "@tanstack/react-query";
import { riderApi, type RiderLedgerFilters } from "@/src/services/api/riderApi";

export function useLedger(filters: RiderLedgerFilters) {
  return useInfiniteQuery({
    queryKey: ["rider", "ledger", filters],
    queryFn: ({ pageParam = 0 }) =>
      riderApi.getLedger({
        ...filters,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.hasMore ? lastOffset + (filters.limit ?? 50) : undefined,
    staleTime: 20_000,
  });
}
