import React from "react";
import { View, Image, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  imageUrl?: string | null;
};

/** Reference-style destination callout: framed thumbnail + pointer tail. */
export function NavDestinationCalloutMarker({ imageUrl }: Props) {
  const hasImage = Boolean(imageUrl?.trim());

  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.frame}>
        {hasImage ? (
          <Image source={{ uri: imageUrl! }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="storefront" size={24} color="#4B5563" />
          </View>
        )}
      </View>
      <View style={styles.pointerBorder} />
      <View style={styles.pointerFill} />
    </View>
  );
}

export const NAV_DEST_CALLOUT_W = 58;
export const NAV_DEST_CALLOUT_H = 52;

const styles = StyleSheet.create({
  wrap: {
    width: NAV_DEST_CALLOUT_W,
    height: NAV_DEST_CALLOUT_H,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  frame: {
    width: 52,
    height: 38,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: "#1F2937",
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  pointerBorder: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1F2937",
    marginTop: -1,
  },
  pointerFill: {
    position: "absolute",
    bottom: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#E5E7EB",
  },
});
