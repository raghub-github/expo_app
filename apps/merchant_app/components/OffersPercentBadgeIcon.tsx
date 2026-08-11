import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/components/AppText";

/** Circular outline with % centered — tab bar & profile grid. */
export function OffersPercentBadgeIcon({
  size = 22,
  color = "#111827",
  filled = false,
}: {
  size?: number;
  color?: string;
  /** When true, solid fill (e.g. active tab on green pill). */
  filled?: boolean;
}) {
  const fontSize = Math.max(9, Math.round(size * 0.46));
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        filled && { backgroundColor: "rgba(255,255,255,0.18)" },
      ]}
    >
      <Text style={[styles.pct, { fontSize, color }]}>%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 1.6,
    alignItems: "center",
    justifyContent: "center",
  },
  pct: {
    fontWeight: "800",
    includeFontPadding: false,
    textAlign: "center",
    lineHeight: undefined,
  },
});
