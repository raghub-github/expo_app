/**
 * Horizontal “lower prices” tag above classic store titles (reference layout).
 */

import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";

type Props = {
  /** e.g. "20% LOWER PRICES" — defaults to everyday copy. */
  label?: string;
};

export function ClassicLowerPriceTag({ label = "LOWER PRICES EVERYDAY" }: Props) {
  return (
    <View style={styles.tag} pointerEvents="none">
      <AppText style={styles.text} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function classicLowerPriceTagLabel(
  items: { price: number; basePrice?: number | null }[]
): string {
  let bestPct = 0;
  for (const item of items) {
    const base = item.basePrice;
    if (base == null || !Number.isFinite(base) || base <= item.price) continue;
    const pct = Math.round((1 - item.price / base) * 100);
    if (pct > bestPct) bestPct = pct;
  }
  if (bestPct >= 8) return `${bestPct}% LOWER PRICES`;
  return "LOWER PRICES EVERYDAY";
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    marginBottom: 4,
    paddingHorizontal: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: "#166534",
    textTransform: "uppercase",
  },
});
