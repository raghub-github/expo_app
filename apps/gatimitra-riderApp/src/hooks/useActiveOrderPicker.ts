import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  RIDER_ORDER_DETAIL_QUERY_KEY,
  seedRiderOrderDetailCache,
  useActiveOrders,
} from "@/src/hooks/useOrders";
import {
  isActiveRiderOrder,
  openActiveOrder,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";

export function useActiveOrderPicker() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: active = [] } = useActiveOrders();
  const activeOrders = active.filter(isActiveRiderOrder);
  const primary = pickPrimaryActiveOrder(activeOrders);

  const warmAndOpen = useCallback(
    (order: RiderOrderSummary) => {
      seedRiderOrderDetailCache(queryClient, order, [order.id]);
      void queryClient.prefetchQuery({
        queryKey: RIDER_ORDER_DETAIL_QUERY_KEY(order.id),
        queryFn: () => riderApi.getRideOrder(order.id),
        staleTime: 5000,
      });
      openActiveOrder(order);
    },
    [queryClient]
  );

  const openOrderNavigation = useCallback(
    (order: RiderOrderSummary) => {
      setSheetOpen(false);
      warmAndOpen(order);
    },
    [warmAndOpen]
  );

  const handleActiveOrderPress = useCallback(() => {
    if (activeOrders.length > 1) {
      setSheetOpen(true);
      return;
    }
    if (primary) {
      warmAndOpen(primary);
    }
  }, [activeOrders.length, primary, warmAndOpen]);

  return {
    activeOrders,
    primary,
    sheetOpen,
    setSheetOpen,
    handleActiveOrderPress,
    openOrderNavigation,
  };
}
