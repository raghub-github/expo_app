import { useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
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

function paymentModeLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  if (!m) return "—";
  const lower = m.toLowerCase();
  if (lower === "cod" || lower === "cash") return "COD";
  if (lower === "online" || lower === "prepaid") return "Online";
  if (lower === "upi") return "UPI";
  if (lower === "card") return "Card";
  return m.replace(/_/g, " ");
}

type Props = {
  order: ApiFoodOrder;
};

export function OrderBillDetails({ order }: Props) {
  const [billOpen, setBillOpen] = useState(false);
  const bill = merchantBillPartsFromOrder({
    pricing: order.pricing,
    grand_total: order.grand_total,
    total_ctm: order.total_ctm ?? null,
    food_items_total_value: order.food_items_total_value ?? null,
    items: order.items,
    billingSnapshot: order.billing_snapshot ?? null,
    merchantPrecisionDiscount: Math.max(0, Number(order.merchant_precision_discount) || 0),
  });
  const showPaid = isPaidOrder(order);
  const paymentMode = paymentModeLabel(order.payment_method);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Bill details</Text>
      <Pressable
        onPress={() => setBillOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel="View bill breakdown"
      >
        <View style={styles.row}>
          <Text style={styles.label}>Item subtotal</Text>
          <Text style={styles.value}>{formatMerchantRs(bill.itemsSubtotal)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Restaurant packaging charges</Text>
          <Text style={styles.value}>{formatMerchantRs(bill.packaging)}</Text>
        </View>
        {bill.discount > 0 ? (
          <View style={styles.row}>
            <Text style={styles.label}>Merchant Precision Discount</Text>
            <Text style={[styles.value, styles.discount]}>
              −{formatMerchantRs(bill.discount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={[styles.label, styles.taxesLabel]}>Taxes</Text>
          <Text style={styles.value}>{formatMerchantRs(bill.taxes)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Payment</Text>
          <Text style={styles.value}>{paymentMode}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>Total bill</Text>
            {showPaid ? (
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>PAID</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.totalAmount}>{formatMerchantRs(bill.total)}</Text>
        </View>
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
    marginTop: 18,
  },
  heading: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: CARD_PADDING,
    ...GatiMitraMerchant.shadowSm,
  },
  cardPressed: {
    opacity: 0.92,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  taxesLabel: {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: "#9CA3AF",
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  discount: {
    color: "#059669",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
    marginBottom: 12,
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
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  paidBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4B5563",
    letterSpacing: 0.4,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
