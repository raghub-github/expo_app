import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const ICON_GREY = "#D1D5DB";
const ICON_GREY_SOFT = "#E5E7EB";

/** Zomato-style grey image card placeholder — cloche + cutlery when a menu item has no photo. */
export function MenuItemImagePlaceholder({
  size = "md",
  fill = false,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  /** Stretch to the parent image slot (grid-first menu item look). */
  fill?: boolean;
}) {
  const metrics =
    size === "xs"
      ? { cloche: 16, cutlery: 10, gap: 2 }
      : size === "sm"
        ? { cloche: 24, cutlery: 14, gap: 3 }
        : size === "lg"
          ? { cloche: 40, cutlery: 22, gap: 5 }
          : { cloche: 30, cutlery: 17, gap: 4 };

  return (
    <View
      style={[
        styles.wrap,
        size === "xs" && styles.wrapXs,
        size === "sm" && styles.wrapSm,
        size === "lg" && styles.wrapLg,
        size === "sm" && styles.wrapSmFixed,
        fill && styles.wrapFill,
      ]}
    >
      <View style={[styles.iconCluster, { gap: metrics.gap }]}>
        <MaterialCommunityIcons
          name="room-service-outline"
          size={metrics.cloche}
          color={ICON_GREY}
        />
        <MaterialCommunityIcons
          name="silverware-fork-knife"
          size={metrics.cutlery}
          color={ICON_GREY_SOFT}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
    borderRadius: 12,
  },
  iconCluster: {
    alignItems: "center",
    justifyContent: "center",
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
  wrapFill: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
  },
});
