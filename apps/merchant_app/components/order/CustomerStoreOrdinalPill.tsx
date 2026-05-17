import { View, Text, StyleSheet } from "react-native";
import { formatCustomerOrderOrdinalWithYou } from "@/components/order/orderFormatters";

type Props = {
  ordinal?: number | null;
  /** inline = list card right text; chip = compact pill; banner = detail hero badge */
  variant?: "inline" | "chip" | "banner";
};

export function CustomerStoreOrdinalPill({ ordinal, variant = "banner" }: Props) {
  const label = formatCustomerOrderOrdinalWithYou(ordinal);
  if (!label) return null;

  if (variant === "inline") {
    return (
      <Text style={styles.inlineText} numberOfLines={2}>
        {label}
      </Text>
    );
  }

  if (variant === "chip") {
    return (
      <View style={styles.chip}>
        <Text style={styles.chipText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "right",
    flexShrink: 0,
    maxWidth: "44%",
    lineHeight: 15,
  },
  banner: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
});
