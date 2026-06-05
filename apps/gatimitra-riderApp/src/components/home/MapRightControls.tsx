import React from "react";
import { View, StyleSheet } from "react-native";
import { MapRecenterFab } from "@/src/components/home/HomeAlertBanners";
import { ActiveOrderFloatingCardHost } from "@/src/components/orders/ActiveOrderFloatingCardHost";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";
import {
  MAP_FLOATING_EDGE,
  MAP_FLOATING_STACK_GAP,
  mapRightControlsBottomInset,
} from "@/src/components/home/map-controls-layout";

type Props = {
  onRecenter: () => void;
  showOffDutyBanner?: boolean;
  hasActiveRideDock?: boolean;
};

/**
 * Right-side floating control stack — Active Order card above Locate Me.
 * Single anchor eliminates positioning conflicts between independent absolute elements.
 */
export function MapRightControls({
  onRecenter,
  showOffDutyBanner = false,
  hasActiveRideDock = false,
}: Props) {
  const { data: active = [] } = useActiveOrders();
  const hasActiveOrder = active.some(isActiveRiderOrder);

  const bottom = mapRightControlsBottomInset({ showOffDutyBanner, hasActiveRideDock });

  return (
    <View style={[styles.column, { bottom }]} pointerEvents="box-none">
      {hasActiveOrder ? (
        <>
          <ActiveOrderFloatingCardHost />
          <View style={styles.gap} pointerEvents="none" />
        </>
      ) : null}
      <MapRecenterFab embedded onPress={onRecenter} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: "absolute",
    right: MAP_FLOATING_EDGE,
    zIndex: 15,
    alignItems: "flex-end",
    overflow: "visible",
  },
  gap: {
    height: MAP_FLOATING_STACK_GAP,
  },
});
