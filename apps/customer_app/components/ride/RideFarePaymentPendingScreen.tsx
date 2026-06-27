/**
 * Post-ride payment pending — summary only; Pay opens full ride checkout.
 */

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ImageBackground,
  type ImageStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, resolveTabBarBottomInset } from "@/constants/layout";
import type { OrderDetail } from "@/services/order.service";
import {
  formatRideFare,
  getRideServiceLabel,
  parseRideDeliveredBill,
  buildRidePaymentFareBreakdown,
} from "@/lib/ride-order-display";
import { RideTollNoticeBanner, RideTollNoticeSheet } from "@/components/ride/RideTollNoticeSheet";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import {
  resolveRideTypeForTollNotice,
  shouldShowRideTollNotice,
} from "@/lib/ride-toll-notice";

const MINT_DARK = GatiMitraColors.deepMintStart;
const PENDING_HERO_DELAY_MS = 3 * 60 * 1000;

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const deliveredBill = parseRideDeliveredBill(order);
  const fareBreakdown = useMemo(() => buildRidePaymentFareBreakdown(order), [order]);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const rideLabel = getRideServiceLabel(order.rideType);
  const vehicleType = rideLabel.replace(/\s*ride$/i, "").trim().toLowerCase() || "ride";
  const showTollNotice = shouldShowRideTollNotice(resolveRideTypeForTollNotice(order));
  const deliveredAtIso = useMemo(() => getDeliveredAtIso(order), [order]);
  const { show: showWaitingHero, clear: heroImageClear } = useWaitingHeroPhase(deliveredAtIso);
  const waitingHero = useAppAssetSource(CX.ride.waitingHero);

  const [tollSheetVisible, setTollSheetVisible] = useState(false);
  const bottomPad = Math.max(resolveTabBarBottomInset(insets.bottom), 6);
  const scrollBottomPad = bottomPad + 96;

  useEffect(() => {
    setTollSheetVisible(showTollNotice);
  }, [order.orderId, showTollNotice]);

  const openCheckout = () => {
    router.push({
      pathname: "/checkout/ride-fare",
      params: { orderId: order.orderId },
    });
  };

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
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {showWaitingHero && waitingHero ? (
          <ImageBackground
            source={waitingHero}
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
          <Text style={styles.statusLine}>
            Your {vehicleType} ride is completed order id {displayOrderId}
          </Text>
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

        {showTollNotice ? (
          <RideTollNoticeBanner onPress={() => setTollSheetVisible(true)} />
        ) : null}

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color="#4F46E5" />
          <Text style={styles.infoBannerText}>
            Your captain receives earnings after payment is confirmed. You cannot book another ride
            until this fare is cleared.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          style={styles.payBtn}
          onPress={openCheckout}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payBtnGradient}
          >
            <Ionicons name="lock-closed" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Proceed to Payment</Text>
            <View style={styles.payBtnChevron}>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={GatiMitraColors.textSecondary} />
          <Text style={styles.secureText}>100% Secure Payments</Text>
        </View>
      </View>

      {showTollNotice ? (
        <RideTollNoticeSheet
          visible={tollSheetVisible}
          onClose={() => setTollSheetVisible(false)}
        />
      ) : null}

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
  heroImageInner: { borderRadius: 18 },
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
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  statusLine: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    lineHeight: 20,
  },
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
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FDE047",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCoinText: { fontSize: 10, fontWeight: "900", color: "#854D0E" },
  routeDivider: { height: 1, backgroundColor: GatiMitraColors.border },
  routeBlock: { flexDirection: "row", gap: 12 },
  routeRailCol: { alignItems: "center", width: 14, paddingTop: 4 },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT_DARK,
  },
  routeRail: { flex: 1, width: 2, backgroundColor: "#CBD5E1", marginVertical: 4 },
  routeDotDrop: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#EF4444",
  },
  routeTextCol: { flex: 1, gap: 14 },
  routeText: { fontSize: 13, color: GatiMitraColors.textPrimary, fontWeight: "600", lineHeight: 18 },
  routeTextDrop: { color: GatiMitraColors.textSecondary },
  infoBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#4338CA",
    lineHeight: 18,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.cardBg,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  payBtn: { borderRadius: 14, overflow: "hidden" },
  payBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  payBtnText: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: "#fff" },
  payBtnChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 0,
    marginBottom: 0,
  },
  secureText: { fontSize: 11, color: GatiMitraColors.textSecondary, fontWeight: "600" },
});
