import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import {
  NAV_RIDER_DOT_BORDER,
  NAV_RIDER_DOT_FILL,
  NAV_RIDER_DOT_HALO,
  NAV_RIDER_DOT_HALO_SIZE,
  NAV_RIDER_DOT_SIZE,
} from "@gatimitra/map-tracking-engine";

/** GatiMitra mint-green live-location dot — same as Rider App navigation. */
export function NavRiderDotMarker() {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.halo} />
      <View style={styles.dot} />
    </View>
  );
}

export { NAV_RIDER_DOT_SIZE };

const styles = StyleSheet.create({
  wrap: {
    width: NAV_RIDER_DOT_HALO_SIZE,
    height: NAV_RIDER_DOT_HALO_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: NAV_RIDER_DOT_HALO_SIZE,
    height: NAV_RIDER_DOT_HALO_SIZE,
    borderRadius: NAV_RIDER_DOT_HALO_SIZE / 2,
    backgroundColor: NAV_RIDER_DOT_HALO,
  },
  dot: {
    width: NAV_RIDER_DOT_SIZE,
    height: NAV_RIDER_DOT_SIZE,
    borderRadius: NAV_RIDER_DOT_SIZE / 2,
    backgroundColor: NAV_RIDER_DOT_FILL,
    borderWidth: 3,
    borderColor: NAV_RIDER_DOT_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: NAV_RIDER_DOT_FILL,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
});
