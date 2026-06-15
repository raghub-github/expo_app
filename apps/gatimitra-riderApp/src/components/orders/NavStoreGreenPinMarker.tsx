import React from "react";
import { View, StyleSheet, Platform } from "react-native";

const STORE_PIN_GREEN = "#22C55E";
const STORE_PIN_GREEN_DARK = "#16A34A";

/** Reference green teardrop store pin with white center dot. */
export function NavStoreGreenPinMarker() {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.head}>
        <View style={styles.innerDot} />
      </View>
      <View style={styles.tail} />
    </View>
  );
}

export const NAV_STORE_PIN_W = 30;
export const NAV_STORE_PIN_H = 40;

const styles = StyleSheet.create({
  wrap: {
    width: NAV_STORE_PIN_W,
    height: NAV_STORE_PIN_H,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  head: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: STORE_PIN_GREEN,
    borderWidth: 2.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: STORE_PIN_GREEN_DARK,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  innerDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#ffffff",
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 13,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: STORE_PIN_GREEN,
    marginTop: -3,
  },
});
