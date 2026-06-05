import React from "react";
import { View, Image, StyleSheet, Platform } from "react-native";
import { MAPBIKE_IMAGE } from "@/src/lib/map-assets";

type Props = {
  headingDeg?: number;
};

/** Bike-only marker for navigation — no "You" pill or circle ring. */
export function NavigateRideRiderMarker({ headingDeg = 0 }: Props) {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={[styles.bikeWrap, { transform: [{ rotate: `${headingDeg}deg` }] }]}>
        <Image source={MAPBIKE_IMAGE} style={styles.bike} resizeMode="contain" />
      </View>
    </View>
  );
}

export const NAV_RIDER_MARKER_W = 40;
export const NAV_RIDER_MARKER_H = 40;

const styles = StyleSheet.create({
  wrap: {
    width: NAV_RIDER_MARKER_W,
    height: NAV_RIDER_MARKER_H,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  bikeWrap: {
    width: NAV_RIDER_MARKER_W,
    height: NAV_RIDER_MARKER_H,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  bike: {
    width: NAV_RIDER_MARKER_W,
    height: NAV_RIDER_MARKER_H,
  },
});
