import { View, StyleSheet } from "react-native";
import { resolveItemVegType } from "@/lib/orderItemVeg";

type Props = {
  vegNonveg?: string | null;
  name?: string | null;
  size?: number;
};

/**
 * FSSAI-style diet marks: green = veg, red = non-veg, amber = egg.
 * Always paints a visible box so missing food_type still shows a clear placeholder.
 */
export function ItemVegMark({ vegNonveg, name, size = 14 }: Props) {
  const kind = resolveItemVegType(vegNonveg, name);
  const box = Math.max(14, size);
  const inner = Math.max(5, Math.round(box * 0.42));

  const borderColor =
    kind === "veg" ? "#16A34A" : kind === "non_veg" ? "#DC2626" : kind === "egg" ? "#D97706" : "#94A3B8";
  const fillColor =
    kind === "veg" ? "#16A34A" : kind === "non_veg" ? "#DC2626" : kind === "egg" ? "#F59E0B" : "#CBD5E1";

  const label =
    kind === "veg"
      ? "Vegetarian"
      : kind === "non_veg"
        ? "Non-vegetarian"
        : kind === "egg"
          ? "Contains egg"
          : "Item type unknown";

  return (
    <View
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderColor,
        },
      ]}
      accessibilityLabel={label}
    >
      {kind === "egg" ? (
        <View
          style={[
            styles.egg,
            {
              width: inner * 0.85,
              height: inner * 1.15,
              backgroundColor: fillColor,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.dot,
            {
              width: inner,
              height: inner,
              backgroundColor: fillColor,
              opacity: kind ? 1 : 0.85,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.75,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dot: {
    borderRadius: 999,
  },
  egg: {
    borderRadius: 999,
  },
});
