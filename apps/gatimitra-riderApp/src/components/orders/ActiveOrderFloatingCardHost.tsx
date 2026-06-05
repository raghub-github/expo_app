import React from "react";
import { useActiveOrderPicker } from "@/src/hooks/useActiveOrderPicker";
import { ActiveOrderFloatingCard } from "@/src/components/orders/ActiveOrderFloatingCard";
import { ActiveOrderPickerSheet } from "@/src/components/orders/ActiveOrderPickerSheet";

/** Active-order pill for MapRightControls stack — no independent positioning. */
export function ActiveOrderFloatingCardHost() {
  const {
    activeOrders,
    primary,
    sheetOpen,
    setSheetOpen,
    handleActiveOrderPress,
    openOrderNavigation,
  } = useActiveOrderPicker();

  if (!primary) return null;

  return (
    <>
      <ActiveOrderFloatingCard
        order={primary}
        count={activeOrders.length}
        onPress={handleActiveOrderPress}
      />
      <ActiveOrderPickerSheet
        visible={sheetOpen}
        orders={activeOrders}
        onDismiss={() => setSheetOpen(false)}
        onSelect={openOrderNavigation}
      />
    </>
  );
}
