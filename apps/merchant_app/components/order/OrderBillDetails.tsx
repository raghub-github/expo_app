import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder } from "@/services/ordersApi";
import { GatiMitraMerchant, CARD_PADDING, CARD_RADIUS } from "@/constants/theme";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import { merchantBillPartsFromOrder } from "@/lib/resolveMerchantOrderTotal";
import { OrderMerchantBillModal } from "@/components/order/OrderMerchantBillModal";

function isPaidOrder(order: ApiFoodOrder): boolean {
  const st = (order.payment_status ?? "").trim().toUpperCase();
  if (st === "PAID" || st === "COMPLETED" || st === "SUCCESS") return true;
  const method = (order.payment_method ?? "").trim().toLowerCase();
  if (method.includes("cod") || method.includes("cash")) return false;
  return true;
}

type Props = {
  order: ApiFoodOrder;
};

export function OrderBillDetails({ order }: Props) {
  const [billOpen, setBillOpen] = useState(false);
  // Deterministic merchant bill: item subtotal + packaging − frozen precision (once).
  const bill = merchantBillPartsFromOrder({
    pricing: order.pricing,
    grand_total: order.grand_total,
    food_items_total_value: order.food_items_total_value ?? null,
    items: order.items,
    billingSnapshot: order.billing_snapshot ?? null,
    merchantPrecisionDiscount: Math.max(0, Number(order.merchant_precision_discount) || 0),
  });
  const discount = bill.discount;
  const total = bill.total;
  const showPaid = isPaidOrder(order);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name="receipt-outline" size={18} color="#444444" />
        <Text style={styles.sectionHeading}>Total bill</Text>
      </View>
      <Pressable
        onPress={() => setBillOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel="View bill breakdown"
      >
        {discount > 0 ? (
          <Text style={styles.discountNote}>
            Merchant Precision Discount −{formatMerchantRs(discount)} included in total
          </Text>
        ) : null}
        <View style={styles.totalRow}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>Total</Text>
            {showPaid ? (
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>PAID</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.totalAmount}>{formatMerchantRs(total)}</Text>
        </View>
        <Text style={styles.hint}>
          All items (with customizations) + packaging − Merchant Precision Discount · Tap for breakdown
        </Text>
      </Pressable>

      <OrderMerchantBillModal
        visible={billOpen}
        onClose={() => setBillOpen(false)}
        order={order}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionHeading: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: CARD_PADDING,
    ...GatiMitraMerchant.shadowSm,
  },
  cardPressed: {
    opacity: 0.92,
  },
  discountNote: {
    fontSize: 11,
    color: "#059669",
    marginBottom: 10,
    fontWeight: "600",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
  },
  paidBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.4,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 15,
  },
});
