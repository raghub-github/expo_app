import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import type { MerchantBillParts } from "@/lib/resolveMerchantOrderTotal";

type Props = {
  bill: MerchantBillParts;
  itemCount: number;
  /** Prepaid orders show the PAID badge next to the total (partnersite parity). */
  paid?: boolean;
  /**
   * `summary` — always a single Bill / total row (tap opens breakdown sheet).
   * `full` — full line items (used inside the breakdown bottom sheet).
   */
  mode?: "summary" | "full";
  onPress?: () => void;
  style?: object;
};

/**
 * How the merchant's payable total is made up: item nets + packaging − precision
 * discount. Shown on the incoming order sheet so the headline figure is never a
 * number the merchant has to take on trust.
 */
export function MerchantIncomingBillCard({
  bill,
  itemCount,
  paid,
  mode = "full",
  onPress,
  style,
}: Props) {
  if (mode === "summary") {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.summaryCard, style, pressed && onPress && styles.pressed]}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`Bill total ${formatMerchantRs(bill.total)}. Open breakdown.`}
      >
        <Text style={styles.summaryLabel}>Bill</Text>
        <View style={styles.summaryRight}>
          {paid ? (
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>PAID</Text>
            </View>
          ) : null}
          <Text style={styles.summaryTotal} numberOfLines={1}>
            {formatMerchantRs(bill.total)}
          </Text>
          {onPress ? (
            <Ionicons name="chevron-forward" size={16} color={GatiMitraMerchant.textSecondary} />
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Text style={styles.label}>
          Item subtotal ({itemCount} item{itemCount === 1 ? "" : "s"})
        </Text>
        <Text style={styles.amount}>{formatMerchantRs(bill.itemsSubtotal)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Restaurant packaging charges</Text>
        <Text style={styles.amount}>{formatMerchantRs(bill.packaging)}</Text>
      </View>

      {bill.discount > 0.005 ? (
        <View style={styles.row}>
          <Text style={styles.label}>Merchant Precision Discount</Text>
          <Text style={[styles.amount, styles.discount]}>
            −{formatMerchantRs(bill.discount)}
          </Text>
        </View>
      ) : null}

      <View style={styles.totalRow}>
        <View style={styles.totalLabelWrap}>
          <Text style={styles.totalLabel}>Total</Text>
          {paid ? (
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>PAID</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.totalAmount}>{formatMerchantRs(bill.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pressed: { opacity: 0.88 },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: GatiMitraMerchant.textSecondary,
  },
  summaryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  summaryTotal: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  card: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  amount: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  discount: { color: "#15803D" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.divider,
  },
  totalLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  paidBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  paidBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#166534",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
