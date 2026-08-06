/**
 * Order bill breakdown bottom sheet — live tracking "Paid via …" tap.
 */

import type { ReactNode } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderBillBreakdown } from "@/lib/orderBillBreakdown";

const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const LINK_BLUE = "#2563EB";

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

function BillRow({ label, value, valueNode }: { label: string; value?: string; valueNode?: ReactNode }) {
  return (
    <View style={styles.billRow}>
      <CheckoutText style={styles.billLabel}>{label}</CheckoutText>
      {valueNode ?? (value ? <CheckoutText style={styles.billValue}>{value}</CheckoutText> : null)}
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  bill: OrderBillBreakdown;
  /** @deprecated Prefer paymentLines — kept for older call sites. */
  paymentMethodLabel?: string;
  paymentLines?: Array<{ label: string; amount: number }>;
  itemTotalFallback?: number;
};

export function OrderBillBreakdownSheet({
  visible,
  onClose,
  bill,
  paymentMethodLabel = "UPI",
  paymentLines,
  itemTotalFallback = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const itemTotal = bill.itemTotal > 0.005 ? bill.itemTotal : itemTotalFallback;
  const paidRows =
    paymentLines && paymentLines.length > 0
      ? paymentLines
      : [{ label: paymentMethodLabel, amount: bill.paid }];

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.72}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="receipt-outline" size={18} color={MUTED} />
          </View>
          <CheckoutText style={styles.headerTitle}>Bill Summary</CheckoutText>
        </View>

        {itemTotal > 0.005 ? (
          <BillRow label="Item total" value={formatMoney(itemTotal)} />
        ) : null}

        {bill.gstAndPackaging > 0.005 ? (
          <BillRow label="GST & restaurant packaging" value={formatMoney(bill.gstAndPackaging)} />
        ) : null}

        {(bill.deliveryFeeOriginal != null || bill.deliveryFee > 0.005) ? (
          <BillRow
            label="Delivery partner fee"
            valueNode={
              bill.deliveryFeeOriginal != null ? (
                bill.deliveryDisplayFree || bill.deliveryFee <= 0.005 ? (
                  <View style={styles.freeDeliveryWrap}>
                    <CheckoutText style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</CheckoutText>
                    <CheckoutText style={styles.freeText}>FREE</CheckoutText>
                  </View>
                ) : (
                  <View style={styles.freeDeliveryWrap}>
                    <CheckoutText style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</CheckoutText>
                    <CheckoutText style={styles.billValue}>{formatMoney(bill.deliveryFee)}</CheckoutText>
                  </View>
                )
              ) : (
                <CheckoutText style={styles.billValue}>{formatMoney(bill.deliveryFee)}</CheckoutText>
              )
            }
          />
        ) : null}

        {bill.platformFee > 0.005 ? (
          <BillRow label="Platform fee" value={formatMoney(bill.platformFee)} />
        ) : null}

        {bill.donation > 0.005 ? (
          <BillRow label="Feeding India donation" value={formatMoney(bill.donation)} />
        ) : null}

        {bill.tipAmount > 0.005 ? (
          <BillRow label="Tip for delivery partner" value={formatMoney(bill.tipAmount)} />
        ) : null}

        {bill.surgeFee > 0.005 ? (
          <BillRow label="Surge fee" value={formatMoney(bill.surgeFee)} />
        ) : null}

        {bill.smallOrderFee > 0.005 ? (
          <BillRow label="Small order fee" value={formatMoney(bill.smallOrderFee)} />
        ) : null}

        {bill.convenienceFee > 0.005 ? (
          <BillRow label="Convenience fee" value={formatMoney(bill.convenienceFee)} />
        ) : null}

        {bill.miscFee > 0.005 ? (
          <BillRow label="Other charges" value={formatMoney(bill.miscFee)} />
        ) : null}

        {bill.subscriptionFee > 0.005 ? (
          <BillRow
            label={bill.subscriptionLabel ?? "Membership"}
            value={formatMoney(bill.subscriptionFee)}
          />
        ) : null}

        <View style={styles.billDivider} />

        <View style={[styles.billRow, styles.billGrandRow]}>
          <CheckoutText style={styles.billGrandLabel}>Grand total</CheckoutText>
          <CheckoutText style={styles.billGrandValue}>{formatMoney(bill.grandTotal)}</CheckoutText>
        </View>

        {bill.discountLines.length > 0
          ? bill.discountLines.map((line, idx) => (
              <View key={`disc-${line.code ?? line.label}-${idx}`} style={styles.billRow}>
                <CheckoutText style={styles.couponLabel}>{line.label}</CheckoutText>
                <CheckoutText style={styles.couponValue}>- {formatMoney(line.amount)}</CheckoutText>
              </View>
            ))
          : bill.couponDiscount > 0.005 ? (
              <View style={styles.billRow}>
                <CheckoutText style={styles.couponLabel}>
                  Coupon applied{bill.couponCode ? ` - ${bill.couponCode}` : ""}
                </CheckoutText>
                <CheckoutText style={styles.couponValue}>- {formatMoney(bill.couponDiscount)}</CheckoutText>
              </View>
            ) : null}

        {bill.gatiCashApplied > 0.005 ? (
          <View style={styles.billRow}>
            <CheckoutText style={styles.couponLabel}>GatiCash wallet</CheckoutText>
            <CheckoutText style={styles.couponValue}>- {formatMoney(bill.gatiCashApplied)}</CheckoutText>
          </View>
        ) : null}

        {bill.missedOfferDiscount > 0.005 ? (
          <View style={styles.billRow}>
            <CheckoutText style={styles.couponLabel}>Offer unlocked</CheckoutText>
            <CheckoutText style={styles.couponValue}>- {formatMoney(bill.missedOfferDiscount)}</CheckoutText>
          </View>
        ) : null}

        {bill.missedOfferWalletAdd > 0.005 ? (
          <BillRow label="Add to GatiCash wallet" value={`+ ${formatMoney(bill.missedOfferWalletAdd)}`} />
        ) : null}

        <View style={styles.billPaidBlock}>
          {paidRows.map((row, idx) => (
            <View
              key={`paid-${row.label}-${idx}`}
              style={[styles.billRow, idx === 0 ? styles.billPaidRow : styles.billPaidRowFollow]}
            >
              <CheckoutText style={styles.paidLabel}>Paid via {row.label}</CheckoutText>
              <CheckoutText style={styles.paidValue}>{formatMoney(row.amount)}</CheckoutText>
            </View>
          ))}
        </View>

        {bill.totalSavings > 0.005 ? (
          <View style={styles.savingsBanner}>
            <CheckoutText style={styles.savingsText}>
              🎉 You saved {formatMoney(bill.totalSavings)} on this order!
            </CheckoutText>
          </View>
        ) : null}
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: TEXT },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  billLabel: { flex: 1, fontSize: 13, color: MUTED, paddingRight: 8 },
  billValue: { fontSize: 13, fontWeight: "600", color: TEXT },
  freeDeliveryWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  strikePrice: {
    fontSize: 13,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  freeText: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  billDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraColors.border,
    marginVertical: 6,
    marginHorizontal: 16,
  },
  billGrandRow: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  billGrandLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT },
  billGrandValue: { fontSize: 14, fontWeight: "700", color: TEXT },
  couponLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: LINK_BLUE, paddingRight: 8 },
  couponValue: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  billPaidBlock: {
    paddingTop: 4,
  },
  billPaidRow: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  billPaidRowFollow: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  paidLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: TEXT, textTransform: "capitalize" },
  paidValue: { fontSize: 15, fontWeight: "800", color: TEXT },
  savingsBanner: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: "#EBF5FF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  savingsText: { fontSize: 13, fontWeight: "600", color: LINK_BLUE, textAlign: "center" },
});
