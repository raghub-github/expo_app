import React from "react";
import { View, StyleSheet } from "react-native";
import { ActiveOrderFloatingCardHost } from "@/src/components/orders/ActiveOrderFloatingCardHost";
import { MAP_FLOATING_EDGE } from "@/src/components/home/map-controls-layout";
import { useRiderBottomDock } from "@/src/hooks/useRiderBottomDock";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";

/** Floating active-order pill on non-map tabs — while an active delivery exists. */
export function ActiveOrderTabOverlay() {
  const { data: active = [] } = useActiveOrders();
  const show = active.some(isActiveRiderOrder);
  const { tabBarHeight } = useRiderBottomDock({ tabBarVisible: true });
  const { rs } = useResponsiveLayout();
  const edge = rs(MAP_FLOATING_EDGE);
  const bottom = tabBarHeight + edge;

  if (!show) return null;

  return (
    <View style={[styles.host, { bottom, right: edge }]} pointerEvents="box-none">
      <ActiveOrderFloatingCardHost />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 15,
  },
});
