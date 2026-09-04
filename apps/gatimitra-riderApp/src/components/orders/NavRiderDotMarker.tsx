import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import {
  NAV_RIDER_DOT_BORDER,
  NAV_RIDER_DOT_FILL,
  NAV_RIDER_DOT_HALO,
  NAV_RIDER_DOT_HALO_SIZE,
  NAV_RIDER_DOT_SIZE,
} from "@gatimitra/map-tracking-engine";

type Props = {
  /** Degrees clockwise from north (travel direction). */
  headingDeg?: number;
  /** Current map camera heading; arrow points travel-relative on the map. */
  mapHeadingDeg?: number;
};

/** Mint live-location disc with forward arrow + drop shadow (nav maps). */
export function NavRiderDotMarker({ headingDeg = 0, mapHeadingDeg = 0 }: Props) {
  const rotation = ((headingDeg - mapHeadingDeg) % 360 + 360) % 360;

  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.shadowDisc} />
      <View style={styles.halo} />
      <View style={styles.dot}>
        <View style={[styles.arrowWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
          <View style={styles.arrow} />
        </View>
      </View>
    </View>
  );
}

export { NAV_RIDER_DOT_SIZE };

const styles = StyleSheet.create({
  wrap: {
    width: NAV_RIDER_DOT_HALO_SIZE + 8,
    height: NAV_RIDER_DOT_HALO_SIZE + 8,
    alignItems: "center",
    justifyContent: "center",
  },
  shadowDisc: {
    position: "absolute",
    width: NAV_RIDER_DOT_SIZE + 6,
    height: NAV_RIDER_DOT_SIZE + 6,
    borderRadius: (NAV_RIDER_DOT_SIZE + 6) / 2,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    transform: [{ translateY: 2 }],
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
      },
      android: { elevation: 9 },
      default: {},
    }),
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
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  arrowWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
    marginTop: -1,
  },
});
