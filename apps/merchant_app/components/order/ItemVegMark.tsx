import { View, StyleSheet } from "react-native";
import { resolveItemVegType } from "@/lib/orderItemVeg";

type Props = {
  vegNonveg?: string | null;
  name?: string | null;
  size?: number;
};

export function ItemVegMark({ vegNonveg, name, size = 14 }: Props) {
  const kind = resolveItemVegType(vegNonveg, name);
  const isVeg = kind === "veg";
  const isNonVeg = kind === "non_veg";
  const borderColor = isVeg ? "#16A34A" : isNonVeg ? "#DC2626" : "#9CA3AF";
  const dotColor = isVeg ? "#16A34A" : isNonVeg ? "#DC2626" : "#E5E7EB";
  const inner = Math.max(4, Math.round(size * 0.45));

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderColor,
        },
      ]}
      accessibilityLabel={isVeg ? "Vegetarian" : isNonVeg ? "Non-vegetarian" : "Item type unknown"}
    >
      <View style={[styles.dot, { width: inner, height: inner, backgroundColor: dotColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dot: {
    borderRadius: 999,
  },
});
