import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActiveOrderFloatingCardHost } from "@/src/components/orders/ActiveOrderFloatingCardHost";
import { MAP_FLOATING_EDGE } from "@/src/components/home/map-controls-layout";
import { getRiderTabBarTotalHeight } from "@/src/lib/rider-tab-bar-layout";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";

/** Floating active-order pill on non-map tabs — while an active delivery exists. */
export function ActiveOrderTabOverlay() {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { data: active = [] } = useActiveOrders();
  const show = active.some(isActiveRiderOrder);
  const bottom = getRiderTabBarTotalHeight(safeBottom) + MAP_FLOATING_EDGE;

  if (!show) return null;

  return (
    <View style={[styles.host, { bottom }]} pointerEvents="box-none">
      <ActiveOrderFloatingCardHost />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: MAP_FLOATING_EDGE,
    zIndex: 15,
  },
});
