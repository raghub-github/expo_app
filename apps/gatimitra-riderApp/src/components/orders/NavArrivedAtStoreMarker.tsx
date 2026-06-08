import React from "react";
import { View, StyleSheet } from "react-native";
import { NavigateRideRiderMarker } from "@/src/components/orders/NavigateRideRiderMarker";
import { NavStoreGreenPinMarker } from "@/src/components/orders/NavStoreGreenPinMarker";

type Props = {
  headingDeg?: number;
};

/** Rider reached store — green pin stacked on bike (reference arrival state). */
export function NavArrivedAtStoreMarker({ headingDeg = 0 }: Props) {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.pinLift}>
        <NavStoreGreenPinMarker />
      </View>
      <View style={styles.bikeLift}>
        <NavigateRideRiderMarker headingDeg={headingDeg} />
      </View>
    </View>
  );
}

export const NAV_ARRIVED_MARKER_W = 44;
export const NAV_ARRIVED_MARKER_H = 72;

const styles = StyleSheet.create({
  wrap: {
    width: NAV_ARRIVED_MARKER_W,
    height: NAV_ARRIVED_MARKER_H,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  pinLift: {
    marginBottom: -6,
    zIndex: 3,
  },
  bikeLift: {
    zIndex: 2,
  },
});
