/**
 * Soft peach tile with faint food icons — used when a menu item has no photo
 * (Swiggy / Zomato-style empty dish card).
 */

import React, { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const BG = "#F6E8DC";
const ICON = "rgba(180, 140, 110, 0.28)";

const ICONS = [
  "pizza",
  "noodles",
  "cup-outline",
  "hamburger",
  "food-apple-outline",
  "coffee-outline",
] as const;

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Icon size; defaults scale with a ~168px classic home card. */
  iconSize?: number;
};

export function ClassicFoodImagePlaceholder({ style, iconSize = 22 }: Props) {
  const cells = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        key: `ph-${i}`,
        name: ICONS[i % ICONS.length]!,
      })),
    []
  );

  return (
    <View style={[styles.wrap, style]} pointerEvents="none" accessibilityElementsHidden>
      <View style={styles.grid}>
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell}>
            <MaterialCommunityIcons name={cell.name} size={iconSize} color={ICON} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    width: "118%",
    height: "118%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    opacity: 0.95,
    transform: [{ rotate: "-8deg" }],
  },
  cell: {
    width: "22%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
