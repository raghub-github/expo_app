/**
 * GatiMitra-style offer line under restaurant name (blue % badge + copy).
 */

import { View, Text, StyleSheet } from "react-native";
import { formatCardOfferLine } from "@/lib/merchantOfferBadge";

type Props = {
  offerText?: string | null;
  compact?: boolean;
};

export function MerchantOfferRow({ offerText, compact = false }: Props) {
  const line = formatCardOfferLine(offerText);
  if (!line) return null;

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconSymbol}>%</Text>
      </View>
      <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={2}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  rowCompact: {
    marginTop: 5,
    gap: 6,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconSymbol: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 15,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    lineHeight: 18,
  },
  textCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
