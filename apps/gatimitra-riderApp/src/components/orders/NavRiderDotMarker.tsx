import React from "react";
import { View, StyleSheet, Platform } from "react-native";

/** Google Maps–style rider position dot on navigation map. */
export function NavRiderDotMarker() {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.halo} />
      <View style={styles.dot} />
    </View>
  );
}

export const NAV_RIDER_DOT_SIZE = 18;

const styles = StyleSheet.create({
  wrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(26, 115, 232, 0.22)",
  },
  dot: {
    width: NAV_RIDER_DOT_SIZE,
    height: NAV_RIDER_DOT_SIZE,
    borderRadius: NAV_RIDER_DOT_SIZE / 2,
    backgroundColor: "#1A73E8",
    borderWidth: 3,
    borderColor: "#ffffff",
    ...Platform.select({
      ios: {
        shadowColor: "#1A73E8",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
});
