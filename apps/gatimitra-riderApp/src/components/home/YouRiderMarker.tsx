import React from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import { colors } from "@/src/theme";
import { useAppAssetSource } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

const BRAND = colors.primary[500];

/** Pin dimensions — used to position map overlay at lat/lng. */
export const YOU_MARKER_WIDTH = 48;
export const YOU_MARKER_HEIGHT = 56;

type YouRiderMarkerProps = {
  onReady?: () => void;
};

/** Home map rider pin: mint "You" bubble + mapbike (transparent ring, no white fill). */
export function YouRiderMarker({ onReady }: YouRiderMarkerProps) {
  const mapBike = useAppAssetSource(RX.map.bike);
  return (
    <View style={styles.wrap} onLayout={onReady} pointerEvents="none" collapsable={false}>
      <View style={styles.bubble}>
        <Text style={styles.label} allowFontScaling={false}>
          You
        </Text>
      </View>
      <View style={styles.iconRing}>
        {mapBike ? (
          <Image
            source={mapBike}
            style={styles.icon}
            resizeMode="contain"
            onLoad={onReady}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: YOU_MARKER_WIDTH,
    height: YOU_MARKER_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  bubble: {
    backgroundColor: BRAND,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 36,
    alignItems: "center",
    marginBottom: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  label: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 11,
    includeFontPadding: false,
    textAlign: "center",
  },
  iconRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 2.5,
    borderColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  icon: {
    width: 28,
    height: 28,
    backgroundColor: "transparent",
  },
});
