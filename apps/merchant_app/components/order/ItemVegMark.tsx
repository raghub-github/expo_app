import { View, StyleSheet } from "react-native";
import { resolveItemVegType } from "@/lib/orderItemVeg";

type Props = {
  vegNonveg?: string | null;
  name?: string | null;
  size?: number;
};

/** FSSAI-style diet marks — saturated so they stay crisp on white cards. */
const MARK = {
  veg: { border: "#0B7A3E", fill: "#16A34A" },
  non_veg: { border: "#B91C1C", fill: "#DC2626" },
  egg: { border: "#C2410C", fill: "#EA580C" },
  unknown: { border: "#64748B", fill: "#64748B" },
} as const;

/**
 * FSSAI-style diet marks: green = veg, red = non-veg, amber = egg.
 * Always paints a visible box so missing food_type still shows a clear placeholder.
 */
export function ItemVegMark({ vegNonveg, name, size = 14 }: Props) {
  const kind = resolveItemVegType(vegNonveg, name);
  const box = Math.max(14, size);
  const inner = Math.max(6, Math.round(box * 0.48));
  const colors =
    kind === "veg"
      ? MARK.veg
      : kind === "non_veg"
        ? MARK.non_veg
        : kind === "egg"
          ? MARK.egg
          : MARK.unknown;

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
          borderColor: colors.border,
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
              height: inner * 1.2,
              backgroundColor: colors.fill,
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
              backgroundColor: colors.fill,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 2,
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
