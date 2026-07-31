/**
 * Ride Cash Payment info screen — shown when a ride is DELIVERED and the
 * customer selected cash. No app-side payment action is needed; the rider
 * collects cash in person and confirms it via their app. This screen only
 * surfaces the fare breakdown + reassuring copy so the customer knows what
 * to hand over.
 */

import { useMemo } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { AppText } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { OrderDetail } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, resolveBottomSafeInset } from "@/constants/layout";
import {
  formatRideFare,
  getRideServiceLabel,
  parseRideDeliveredBill,
} from "@/lib/ride-order-display";
import { RideCheckoutBillSummary } from "@/components/ride/RideCheckoutBillSummary";
import { buildRideCheckoutCompactBill } from "@/lib/ride-fare-bill-display";

type Props = {
  order: OrderDetail;
  onBack: () => void;
};

const MINT_DARK = GatiMitraColors.deepMintStart;

export function RideCashPayScreen({ order, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const deliveredBill = parseRideDeliveredBill(order);
  const compact = useMemo(
    () => buildRideCheckoutCompactBill(deliveredBill),
    [deliveredBill]
  );

  const rideLabel = getRideServiceLabel(order.rideType);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const amount = deliveredBill?.finalAmount ?? Number(order.totalAmount ?? 0);
  const amountLabel = formatRideFare(amount);

  const bottomInset = resolveBottomSafeInset(insets.bottom);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[MINT_DARK, GatiMitraColors.deepMintEnd]}
        style={[styles.hero, { paddingTop: HEADER_PADDING_TOP + insets.top }]}
      >
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <AppText style={styles.heroTitle}>{rideLabel} completed</AppText>
        <AppText style={styles.heroSub}>Cash payment on delivery</AppText>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.amountCard}>
          <View style={styles.amountIconWrap}>
            <Ionicons name="cash" size={26} color={MINT_DARK} />
          </View>
          <AppText style={styles.amountLabel}>Pay to your rider</AppText>
          <AppText style={styles.amountValue}>{amountLabel}</AppText>
          {displayOrderId ? (
            <AppText style={styles.orderRef}>Ride #{displayOrderId}</AppText>
          ) : null}
          <AppText style={styles.amountHint}>
            Hand this amount directly to your rider in cash. Your ride is
            complete once they confirm collection.
          </AppText>
        </View>

        {compact ? (
          <View style={styles.billCard}>
            <AppText style={styles.billTitle}>Fare breakdown</AppText>
            <RideCheckoutBillSummary bill={compact} />
          </View>
        ) : null}

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={20} color={MINT_DARK} />
          <View style={{ flex: 1 }}>
            <AppText style={styles.infoTitle}>
              No online payment required
            </AppText>
            <AppText style={styles.infoSub}>
              This ride was booked with the cash option. You do not need to
              pay through the app — just hand cash to your rider.
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F6FA" },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  body: { flex: 1 },
  amountCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  amountIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  amountLabel: { fontSize: 13, color: "#6B7280", fontWeight: "700" },
  amountValue: { fontSize: 34, fontWeight: "900", color: "#111827" },
  orderRef: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  amountHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  billCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  billTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  infoTitle: { fontSize: 13, fontWeight: "800", color: "#14532D" },
  infoSub: { fontSize: 12, color: "#166534", lineHeight: 17, fontWeight: "500" },
});
