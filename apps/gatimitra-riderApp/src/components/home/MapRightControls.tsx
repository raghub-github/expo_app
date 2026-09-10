import React from "react";
import { View, StyleSheet } from "react-native";
import { MapRecenterFab } from "@/src/components/home/HomeAlertBanners";
import { ActiveOrderFloatingCardHost } from "@/src/components/orders/ActiveOrderFloatingCardHost";
import {
  MAP_FLOATING_EDGE,
  MAP_FLOATING_STACK_GAP,
} from "@/src/components/home/map-controls-layout";
import { floatingControlsBottomInMap } from "@/src/lib/rider-bottom-dock";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Props = {
  onRecenter: () => void;
  showOffDutyBanner?: boolean;
  hasDemandZonesDock?: boolean;
  /** Measured height of bottom dock (demand / off-duty banner). */
  dockHeight?: number;
  /** State-driven: only while ON duty with an accepted active order. */
  showActiveRideFab?: boolean;
};

/**
 * Right-side floating control stack — Active Order card (conditional) above Locate Me.
 * Bottom inset from measured dock height via Bottom Dock System.
 */
export function MapRightControls({
  onRecenter,
  showOffDutyBanner = false,
  hasDemandZonesDock = false,
  dockHeight,
  showActiveRideFab = false,
}: Props) {
  const { rs } = useResponsiveLayout();
  const edge = rs(MAP_FLOATING_EDGE);
  const panelHeight =
    dockHeight && dockHeight > 0
      ? dockHeight
      : hasDemandZonesDock || showOffDutyBanner
        ? 62
        : 0;
  const bottom = floatingControlsBottomInMap({
    panelHeight,
    offDuty: showOffDutyBanner,
    edge,
  });

  return (
    <View style={[styles.column, { bottom, right: edge }]} pointerEvents="box-none">
      {showActiveRideFab ? (
        <>
          <ActiveOrderFloatingCardHost />
          <View style={[styles.gap, { height: rs(MAP_FLOATING_STACK_GAP) }]} pointerEvents="none" />
        </>
      ) : null}
      <MapRecenterFab embedded onPress={onRecenter} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: "absolute",
    zIndex: 15,
    alignItems: "flex-end",
    overflow: "visible",
  },
  gap: {
    width: 1,
  },
});
