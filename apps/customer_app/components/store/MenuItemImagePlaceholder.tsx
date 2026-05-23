import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

/** Zomato-style grey cloche placeholder when a menu item has no photo. */
export function MenuItemImagePlaceholder({ size = "md" }: { size?: "xs" | "sm" | "md" | "lg" }) {
  const iconSize = size === "xs" ? 14 : size === "sm" ? 22 : size === "lg" ? 36 : 28;
  return (
    <View
      style={[
        styles.wrap,
        size === "xs" && styles.wrapXs,
        size === "sm" && styles.wrapSm,
        size === "lg" && styles.wrapLg,
        size === "sm" && styles.wrapSmFixed,
      ]}
    >
      <MaterialCommunityIcons name="room-service-outline" size={iconSize} color="#C8C8C8" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F2",
    borderRadius: 12,
  },
  /** Fixed footprint inside customization rows (no flex growth). */
  wrapSmFixed: {
    flex: 0,
    width: "100%",
    height: "100%",
  },
  wrapSm: {
    borderRadius: 10,
  },
  wrapXs: {
    borderRadius: 14,
  },
  wrapLg: {
    borderRadius: 8,
  },
});
