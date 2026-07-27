import React from "react";
import { View, StyleSheet } from "react-native";
import { MapRecenterFab } from "@/src/components/home/HomeAlertBanners";
import { ActiveOrderFloatingCardHost } from "@/src/components/orders/ActiveOrderFloatingCardHost";
import {
  MAP_FLOATING_EDGE,
  MAP_FLOATING_STACK_GAP,
  mapRightControlsBottomInset,
} from "@/src/components/home/map-controls-layout";

type Props = {
  onRecenter: () => void;
  showOffDutyBanner?: boolean;
  hasDemandZonesDock?: boolean;
  /** State-driven: only while ON duty with an accepted active order. */
  showActiveRideFab?: boolean;
};

/**
 * Right-side floating control stack — Active Order card (conditional) above Locate Me.
 */
export function MapRightControls({
  onRecenter,
  showOffDutyBanner = false,
  hasDemandZonesDock = false,
  showActiveRideFab = false,
}: Props) {
  const bottom = mapRightControlsBottomInset({ showOffDutyBanner, hasDemandZonesDock });

  return (
    <View style={[styles.column, { bottom }]} pointerEvents="box-none">
      {showActiveRideFab ? (
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
