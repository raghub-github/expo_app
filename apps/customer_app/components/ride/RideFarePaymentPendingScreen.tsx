/**
 * Dedicated ride fare payment screen — shown before the post-ride success summary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  ImageBackground,
  type ImageStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP } from "@/constants/layout";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "@/components/RazorpayCheckoutModal";
import { paymentService } from "@/services/payment.service";
import { useProfile } from "@/hooks/useProfile";
import {
  formatRideFare,
  getRideServiceLabel,
  parseRideDeliveredBill,
  buildRidePaymentFareBreakdown,
} from "@/lib/ride-order-display";

const MINT_DARK = GatiMitraColors.deepMintStart;
const PENDING_HERO_DELAY_MS = 3 * 60 * 1000;
const WAITING_HERO_NATIVE = require("../../public/img/waiting.png");

function waitingHeroSource() {
  if (Platform.OS === "web") {
    return { uri: "/img/waiting.png" };
  }
  return WAITING_HERO_NATIVE;
}

type Props = {
  order: OrderDetail;
  onBack: () => void;
};

function getDeliveredAtIso(order: OrderDetail): string | null {
  const fromHistory = order.statusHistory
    ?.slice()
    .reverse()
    .find((entry) => entry.status === "DELIVERED")?.at;
  if (fromHistory) return fromHistory;
  const snap = order.billingSnapshot as Record<string, unknown> | null | undefined;
  const fromSnap =
    typeof snap?.ride_completed_at === "string"
      ? snap.ride_completed_at
      : typeof snap?.delivered_at === "string"
        ? snap.delivered_at
        : null;
  return fromSnap;
}

function useWaitingHeroPhase(deliveredAtIso: string | null): { show: boolean; clear: boolean } {
  const [phase, setPhase] = useState({ show: false, clear: false });

  useEffect(() => {
    const evaluate = () => {
      if (!deliveredAtIso) {
        setPhase({ show: false, clear: false });
        return;
      }
      const deliveredMs = Date.parse(deliveredAtIso);
      if (!Number.isFinite(deliveredMs)) {
        setPhase({ show: false, clear: false });
        return;
      }
      const elapsed = Date.now() - deliveredMs;
      setPhase({ show: true, clear: elapsed >= PENDING_HERO_DELAY_MS });
    };

    evaluate();
    const timer = setInterval(evaluate, 10_000);
    return () => clearInterval(timer);
  }, [deliveredAtIso]);

  return phase;
}

export function RideFarePaymentPendingScreen({ order, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const deliveredBill = parseRideDeliveredBill(order);
  const fareBreakdown = useMemo(() => buildRidePaymentFareBreakdown(order), [order]);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const rideLabel = getRideServiceLabel(order.rideType);
  const deliveredAtIso = useMemo(() => getDeliveredAtIso(order), [order]);
  const { show: showWaitingHero, clear: heroImageClear } = useWaitingHeroPhase(deliveredAtIso);

  const [payingFare, setPayingFare] = useState(false);
  const [razorpayVisible, setRazorpayVisible] = useState(false);
  const [razorpayParams, setRazorpayParams] = useState<{
    orderId: string;
    keyId: string;
    amount: number;
  } | null>(null);
  const [simulatedPayment, setSimulatedPayment] = useState<{
    orderId: string;
    amount: number;
  } | null>(null);
  const { data: profile } = useProfile();

  const finalizeRidePayment = useCallback(
    async (result: RazorpayPaymentResult) => {
      setPayingFare(true);
      try {
        await orderService.payRideFare(order.orderId, {
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        });
        await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
        await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        await queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Payment could not be confirmed. Please try again.";
        Alert.alert("Payment failed", msg);
        throw e;
      } finally {
        setPayingFare(false);
        setRazorpayVisible(false);
        setRazorpayParams(null);
        setSimulatedPayment(null);
      }
    },
    [order.orderId, queryClient]
  );

  const handlePayRideFare = useCallback(async () => {
    if (payingFare) return;
    const amountPaise = Math.round(fareBreakdown.total * 100);
    if (amountPaise <= 0) {
      Alert.alert("Unavailable", "Ride fare amount is not available.");
      return;
    }
    setPayingFare(true);
    try {
      const rz = await paymentService.createRazorpayOrder({
        amountPaise,
        receipt: `ride_${order.orderId}`,
      });
      setRazorpayParams({
        orderId: rz.orderId,
        keyId: rz.keyId,
        amount: rz.amount,
      });
      if (rz.keyId === "dummy_key") {
        setSimulatedPayment({ orderId: rz.orderId, amount: rz.amount });
      } else {
        setRazorpayVisible(true);
      }
    } catch {
      Alert.alert("Payment unavailable", "Could not start payment. Please try again.");
    } finally {
      setPayingFare(false);
    }
  }, [payingFare, fareBreakdown.total, order.orderId]);

  const handleSimulatedPaySuccess = useCallback(() => {
    if (!simulatedPayment) return;
    void finalizeRidePayment({
      razorpayOrderId: simulatedPayment.orderId,
      razorpayPaymentId: `pay_${simulatedPayment.orderId}`,
      razorpaySignature: "simulated_signature",
    });
  }, [simulatedPayment, finalizeRidePayment]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP }]}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Pending</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {showWaitingHero ? (
          <ImageBackground
            source={waitingHeroSource()}
            style={styles.heroImageWrap}
            imageStyle={[
              styles.heroImageInner,
              heroImageClear
                ? undefined
                : Platform.OS === "web"
                  ? ({ filter: "blur(12px)", transform: [{ scale: 1.12 }] } as ImageStyle)
                  : { transform: [{ scale: 1.08 }] },
            ]}
            resizeMode="cover"
            blurRadius={heroImageClear ? 0 : Platform.OS === "android" || Platform.OS === "ios" ? 14 : 0}
          >
            <LinearGradient
              colors={
                heroImageClear
                  ? ["rgba(15,23,42,0.06)", "rgba(15,23,42,0.22)"]
                  : ["rgba(15,23,42,0.2)", "rgba(15,23,42,0.58)"]
              }
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroMessageBox}>
              <Text style={styles.heroMessageTitle}>
                Every delay impacts a rider&apos;s{" "}
                <Text style={styles.heroMessageHighlight}>earnings</Text>.
              </Text>
              <Text style={styles.heroMessageSub}>Please complete your payment.</Text>
            </View>
          </ImageBackground>
        ) : null}

        <View style={styles.statusCard}>
          <View style={styles.statusIconWrap}>
            <Ionicons name="time-outline" size={22} color={MINT_DARK} />
          </View>
          <View style={styles.statusBody}>
            <Text style={styles.statusTitle}>Complete your ride payment</Text>
            <Text style={styles.statusSub}>
              Your {rideLabel.toLowerCase()} is complete. Pay the fare to unlock your receipt and
              book your next ride.
            </Text>
            <View style={styles.rideIdPill}>
              <Text style={styles.rideIdPillText}>Ride ID: {displayOrderId}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.fareTopRow}>
            <View style={styles.fareTopLeft}>
              <Text style={styles.sectionLabel}>FARE DUE</Text>
              <Text style={styles.amount}>{formatRideFare(fareBreakdown.total)}</Text>
              <Text style={styles.methodLine}>Pay via {deliveredBill.paymentMethodLabel}</Text>
            </View>
            <View style={styles.walletArt}>
              <Ionicons name="wallet" size={28} color={MINT_DARK} />
              <View style={styles.walletCoin}>
                <Text style={styles.walletCoinText}>₹</Text>
              </View>
            </View>
          </View>

          <View style={styles.routeDivider} />

          <View style={styles.breakdownBlock}>
            <Text style={styles.breakdownTitle}>Fare breakdown</Text>
            {fareBreakdown.lines.map((line) => (
              <View
                key={line.label}
                style={[styles.breakdownRow, line.emphasis && styles.breakdownRowTotal]}
              >
                <Text
                  style={[styles.breakdownLabel, line.emphasis && styles.breakdownLabelTotal]}
                >
                  {line.label}
                </Text>
                <Text
                  style={[styles.breakdownValue, line.emphasis && styles.breakdownValueTotal]}
                >
                  {formatRideFare(line.amount)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.routeDivider} />

          <View style={styles.routeBlock}>
            <View style={styles.routeRailCol}>
              <View style={styles.routeDotPickup} />
              <View style={styles.routeRail} />
              <View style={styles.routeDotDrop} />
            </View>
            <View style={styles.routeTextCol}>
              <Text style={styles.routeText} numberOfLines={2}>
                {order.merchantAddress?.trim() || "Pickup"}
              </Text>
              <Text style={[styles.routeText, styles.routeTextDrop]} numberOfLines={2}>
                {order.deliveryAddress?.trim() || "Drop"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color="#4F46E5" />
          <Text style={styles.infoBannerText}>
            Your captain receives earnings after payment is confirmed. You cannot book another ride
            until this fare is cleared.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.payBtn, payingFare && styles.payBtnDisabled]}
          onPress={() => void handlePayRideFare()}
          disabled={payingFare}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payBtnGradient}
          >
            {payingFare ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.payBtnText}>Pay {formatRideFare(fareBreakdown.total)}</Text>
                <View style={styles.payBtnChevron}>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={GatiMitraColors.textSecondary} />
          <Text style={styles.secureText}>100% Secure Payments</Text>
        </View>
      </View>

      <RazorpayCheckoutModal
        visible={razorpayVisible}
        orderParams={razorpayParams}
        prefill={{
          name: profile?.full_name ?? undefined,
          email: profile?.email ?? undefined,
          contact: profile?.mobile_number ?? undefined,
        }}
        themeColor={MINT_DARK}
        onSuccess={(result) => void finalizeRidePayment(result)}
        onCancel={() => {
          setRazorpayVisible(false);
          setRazorpayParams(null);
        }}
      />

      <Modal visible={simulatedPayment != null} transparent animationType="fade">
        <View style={styles.simOverlay}>
          <View style={styles.simCard}>
            <Text style={styles.simTitle}>Simulate payment</Text>
            <Text style={styles.simSub}>Dev mode — mark ride fare as paid.</Text>
            <TouchableOpacity style={styles.simBtn} onPress={handleSimulatedPaySuccess}>
              <Text style={styles.simBtnText}>Mark paid</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSimulatedPayment(null)}>
              <Text style={styles.simCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: GatiMitraColors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginRight: 32,
  },
  headerSpacer: { width: 0 },
  scroll: { padding: 16, gap: 14 },
  heroImageWrap: {
    height: 188,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    justifyContent: "flex-end",
  },
  heroImageInner: {
    borderRadius: 18,
  },
  heroMessageBox: {
    margin: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.72)",
    gap: 4,
    maxWidth: "78%",
  },
  heroMessageTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F8FAFC",
    lineHeight: 20,
  },
  heroMessageHighlight: { color: "#FDE047", fontWeight: "800" },
  heroMessageSub: { fontSize: 12, color: "#CBD5E1", fontWeight: "500" },
  statusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBody: { flex: 1, gap: 6 },
  statusTitle: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  statusSub: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 19,
    fontWeight: "500",
  },
  rideIdPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#ECFDF5",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rideIdPillText: { fontSize: 11, fontWeight: "700", color: MINT_DARK },
  summaryCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 12,
  },
  fareTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fareTopLeft: { flex: 1, gap: 4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.6,
  },
  amount: { fontSize: 34, fontWeight: "900", color: GatiMitraColors.textPrimary },
  methodLine: { fontSize: 13, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  walletArt: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCoin: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCoinText: { fontSize: 9, fontWeight: "800", color: "#B45309" },
  breakdownBlock: { gap: 8 },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  breakdownRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
  },
  breakdownLabel: { fontSize: 13, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  breakdownLabelTotal: { fontSize: 14, color: GatiMitraColors.textPrimary, fontWeight: "800" },
  breakdownValue: { fontSize: 13, color: GatiMitraColors.textPrimary, fontWeight: "700" },
  breakdownValueTotal: { fontSize: 15, color: GatiMitraColors.textPrimary, fontWeight: "900" },
  routeDivider: { height: 1, backgroundColor: GatiMitraColors.border },
  routeBlock: { flexDirection: "row", gap: 12, paddingTop: 2 },
  routeRailCol: { alignItems: "center", width: 14, paddingTop: 4 },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT_DARK,
  },
  routeRail: {
    flex: 1,
    width: 2,
    minHeight: 28,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  routeDotDrop: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#E23744",
  },
  routeTextCol: { flex: 1, justifyContent: "space-between", gap: 18 },
  routeText: { fontSize: 13, color: GatiMitraColors.textPrimary, lineHeight: 18, fontWeight: "600" },
  routeTextDrop: { color: "#334155" },
  infoBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  infoBannerText: { flex: 1, fontSize: 12, color: "#4338CA", lineHeight: 17, fontWeight: "500" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: GatiMitraColors.cardBg,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    gap: 8,
  },
  payBtn: { borderRadius: 16, overflow: "hidden" },
  payBtnDisabled: { opacity: 0.7 },
  payBtnGradient: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  payBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", flex: 1, textAlign: "center" },
  payBtnChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 2,
  },
  secureText: { fontSize: 12, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  simOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  simCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 10,
  },
  simTitle: { fontSize: 17, fontWeight: "800" },
  simSub: { fontSize: 13, color: GatiMitraColors.textSecondary, textAlign: "center" },
  simBtn: {
    marginTop: 8,
    backgroundColor: MINT_DARK,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  simBtnText: { color: "#fff", fontWeight: "800" },
  simCancel: { marginTop: 8, color: GatiMitraColors.textSecondary, fontWeight: "600" },
});
