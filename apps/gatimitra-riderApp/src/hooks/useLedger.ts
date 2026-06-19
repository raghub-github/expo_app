import {
  keepPreviousData,
  useInfiniteQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { riderApi, type RiderLedgerFilters } from "@/src/services/api/riderApi";

export const DEFAULT_LEDGER_FILTERS: Required<
  Pick<RiderLedgerFilters, "segment" | "period" | "limit">
> = {
  segment: "all",
  period: "this_month",
  limit: 50,
};

export function ledgerQueryKey(filters: RiderLedgerFilters) {
  return ["rider", "ledger", filters] as const;
}

function fetchLedgerPage(filters: RiderLedgerFilters, pageParam: number) {
  return riderApi.getLedger({
    ...filters,
    offset: pageParam,
  });
}

export function useLedger(filters: RiderLedgerFilters) {
  return useInfiniteQuery({
    queryKey: ledgerQueryKey(filters),
    queryFn: ({ pageParam = 0 }) => fetchLedgerPage(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.hasMore ? lastOffset + (filters.limit ?? 50) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function prefetchLedger(
  queryClient: QueryClient,
  filters: RiderLedgerFilters = DEFAULT_LEDGER_FILTERS
) {
  return queryClient.prefetchInfiniteQuery({
    queryKey: ledgerQueryKey(filters),
    queryFn: ({ pageParam = 0 }) => fetchLedgerPage(filters, pageParam),
    initialPageParam: 0,
    staleTime: 60_000,
  });
}
