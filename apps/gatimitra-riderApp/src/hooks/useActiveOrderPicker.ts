import { useCallback, useState } from "react";
import { useActiveOrders } from "@/src/hooks/useOrders";
import {
  isActiveRiderOrder,
  openActiveOrder,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export function useActiveOrderPicker() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: active = [] } = useActiveOrders();
  const activeOrders = active.filter(isActiveRiderOrder);
  const primary = pickPrimaryActiveOrder(activeOrders);

  const openOrderNavigation = useCallback((order: RiderOrderSummary) => {
    setSheetOpen(false);
    openActiveOrder(order);
  }, []);

  const handleActiveOrderPress = useCallback(() => {
    if (activeOrders.length > 1) {
      setSheetOpen(true);
      return;
    }
    if (primary) {
      openActiveOrder(primary);
    }
  }, [activeOrders.length, primary]);

  return {
    activeOrders,
    primary,
    sheetOpen,
    setSheetOpen,
    handleActiveOrderPress,
    openOrderNavigation,
  };
}
