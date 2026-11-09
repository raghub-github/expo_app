import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";

export const RIDER_ORDER_SETTLEMENT_QUERY_KEY = (orderId: string) =>
  ["rider", "orders", "settlement", orderId] as const;

/**
 * Server settlement for a completed Ride/Parcel (cash vs earning vs wallet).
 * Polls while the settlement is not posted yet (payment still being confirmed),
 * then stops — a posted settlement never changes.
 */
export function useOrderSettlement(orderId: string | undefined) {
  return useQuery({
    queryKey: RIDER_ORDER_SETTLEMENT_QUERY_KEY(orderId ?? ""),
    queryFn: () => riderApi.getOrderSettlement(orderId!),
    enabled: !!orderId,
    staleTime: 15_000,
    retry: 1,
    // ~2 minutes of polling at most; the screen also refetches on focus.
    refetchInterval: (query) =>
      query.state.data?.settlement || query.state.dataUpdateCount >= 24 ? false : 5_000,
    refetchIntervalInBackground: false,
  });
}
