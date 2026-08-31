/**
 * Post-ride success screen — shown when a live ride completes (not from order history).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { useFocusEffect, useRouter } from "expo-router";
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Platform, Image as RNImage } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { ReceiptTornEdge } from "@/components/orders/ReceiptTornEdge";
import { FoodOrderTipSheet } from "@/components/orders/FoodOrderTipSheet";
import { DeliveryPartnerTrackingCard } from "@/components/orders/DeliveryPartnerTrackingCard";
import { DeliveryPartnerSafetyBottomSheet } from "@/components/orders/DeliveryPartnerSafetyBottomSheet";
import { RideCaptainRatingSheet } from "@/components/ride/RideCaptainRatingSheet";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import {
  formatRideFare,
  formatRideHistoryDateTime,
  formatRideTripStats,
  getRideServiceLabel,
  parseRideDeliveredBill,
  buildRidePaymentFareBreakdown,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";
import type { RideCaptainRatingSubmitPayload } from "@/components/ride/RideCaptainRatingSheet";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const MINT_LIGHT = GatiMitraColors.deepMintEnd;
const PAGE_BG = GatiMitraColors.softBackground;
const CARD = GatiMitraColors.cardSurface;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const ROLLER_MINT = GatiMitraColors.mintHighlight;
const ROLLER_WHITE = "#FFFFFF";

const CONFETTI_DOTS = [
  { top: 2, left: 14, color: "#22C55E", size: 7 },
  { top: 10, right: 18, color: "#3B82F6", size: 8 },
  { top: 0, right: 62, color: "#EC4899", size: 6 },
  { top: 28, left: 48, color: "#8B5CF6", size: 7 },
  { top: 42, right: 40, color: "#F59E0B", size: 6 },
] as const;

type Props = {
  order: OrderDetail;
  onBack: () => void;
  onOpenHelp: () => void;
};

function getDeliveredAtIso(order: OrderDetail): string | null {
  const fromHistory = order.statusHistory
    ?.slice()
    .reverse()
    .find((entry) => entry.status === "DELIVERED")?.at;
  return fromHistory ?? null;
}

function formatDeliveredTime(iso: string | undefined | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function InlineStars({
  value,
  onPress,
  disabled,
}: {
  value: number;
  onPress: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.inlineStars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onPress(n)}
          hitSlop={6}
          disabled={disabled}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={28}
            color={n <= value ? "#F59E0B" : "#C4C4C4"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RouteStop({
  variant,
  address,
  isLast,
}: {
  variant: "pickup" | "drop";
  address: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.routeStopRow}>
      <View style={styles.routeRailCol}>
        <View
          style={[
            styles.routeDot,
            variant === "pickup" ? styles.routeDotPickup : styles.routeDotDrop,
          ]}
        />
        {!isLast ? <View style={styles.routeRail} /> : null}
      </View>
      <AppText style={styles.routeAddress}>{address}</AppText>
    </View>
  );
}

export function RideOrderDeliveredScreen({ order, onBack, onOpenHelp }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: chatUnreadData } = usePartnerChatUnread(order.orderId, Boolean(order.rider));
  const chatUnreadCount = chatUnreadData?.unreadCount ?? 0;
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(MINT_DARK, "light");
      return () => resetStatusBarBackground();
    }, [setStatusBarBackground, resetStatusBarBackground])
  );

  const rideLabel = getRideServiceLabel(order.rideType);
  const vehicleImage = resolveRideVehicleImage(order.rideType);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const pickupAddress = order.merchantAddress?.trim() || "Pickup location";
  const dropAddress = order.deliveryAddress?.trim() || "Drop location";
  const dropTitle = getCompactAddressLine(order.deliveryAddress) || "your destination";
  const deliveredBill = useMemo(() => parseRideDeliveredBill(order), [order]);
  const fareBreakdown = useMemo(() => buildRidePaymentFareBreakdown(order), [order]);
  const fareLineItems = useMemo(
    () => fareBreakdown.lines.filter((line) => !line.emphasis),
    [fareBreakdown.lines]
  );
  const tripStats = formatRideTripStats(deliveredBill.distanceKm, order.rideDurationMinutes);
  const deliveredAtIso = getDeliveredAtIso(order);
  const deliveredTime = formatDeliveredTime(deliveredAtIso);

  const riderName = order.rider?.name?.trim() || "Captain";
  const riderFirstName = riderName.split(/\s+/)[0] || "Captain";
  const riderPhotoUri = toAbsoluteImageUrl(order.rider?.photoUrl);
  const riderRating = (() => {
    const raw = order.rider?.rating;
    if (raw == null) return null;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw.toFixed(1);
    return null;
  })();
  const existingTip = Math.max(0, deliveredBill.tip);

  const serverDeliveryRating = order.deliveryRating ?? 0;
  const deliveryRatedOnServer =
    order.storeRatingSubmitted === true && serverDeliveryRating >= 1;

  const [localRating, setLocalRating] = useState(serverDeliveryRating);
  const [selectedTags, setSelectedTags] = useState<string[]>(order.riderReviewTags ?? []);
  const [reviewNote, setReviewNote] = useState(order.riderReviewText?.trim() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [safetySheetVisible, setSafetySheetVisible] = useState(false);
  const [ratingSheetVisible, setRatingSheetVisible] = useState(false);
  const [sheetInitialRating, setSheetInitialRating] = useState(0);
  const [ratingSubmittedLocal, setRatingSubmittedLocal] = useState(false);

  useEffect(() => {
    setLocalRating(serverDeliveryRating);
    setSelectedTags(order.riderReviewTags ?? []);
    setReviewNote(order.riderReviewText?.trim() ?? "");
    setRatingSubmittedLocal(false);
  }, [order.orderId, serverDeliveryRating, order.riderReviewTags, order.riderReviewText]);

  const scale = useSharedValue(0.65);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 420 });
  }, [scale, opacity]);

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const paymentMethodLabel = deliveredBill.paymentMethodLabel;

  const persistRating = useCallback(
    async (payload: {
      deliveryRating: number;
      riderReviewTags?: string[];
      riderReviewText?: string;
    }) => {
      if (deliveryRatedOnServer) return;
      setSubmitting(true);
      try {
        await orderService.submitStoreRating(order.orderId, {
          deliveryRating: payload.deliveryRating,
          riderReviewTags: payload.riderReviewTags ?? selectedTags,
          riderReviewText: (payload.riderReviewText ?? reviewNote.trim()) || null,
        });
        await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
        await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not submit rating. Please try again.";
        Alert.alert("Rating failed", msg);
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [deliveryRatedOnServer, order.orderId, queryClient, reviewNote, selectedTags]
  );

  const handleOpenRatingSheet = useCallback(
    (stars?: number) => {
      if (deliveryRatedOnServer || ratingSubmittedLocal || submitting) return;
      setSheetInitialRating(stars && stars >= 1 ? stars : localRating > 0 ? localRating : 0);
      setRatingSheetVisible(true);
    },
    [deliveryRatedOnServer, ratingSubmittedLocal, submitting, localRating]
  );

  const handleRatingSheetSubmit = useCallback(
    async (payload: RideCaptainRatingSubmitPayload) => {
      if (deliveryRatedOnServer || ratingSubmittedLocal) return;
      try {
        await persistRating({
          deliveryRating: payload.deliveryRating,
          riderReviewTags: payload.riderReviewTags,
          riderReviewText: payload.riderReviewText ?? undefined,
        });
        setLocalRating(payload.deliveryRating);
        setSelectedTags(payload.riderReviewTags);
        setReviewNote(payload.riderReviewText?.trim() ?? "");
        setRatingSubmittedLocal(true);
        setRatingSheetVisible(false);
      } catch {
        /* persistRating shows alert */
      }
    },
    [deliveryRatedOnServer, ratingSubmittedLocal, persistRating]
  );

  const normalizeRiderPhone = useCallback(() => {
    const phone = order.rider?.phone?.replace(/\D/g, "");
    if (!phone) return null;
    return phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
  }, [order.rider?.phone]);

  const handleCallRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Captain contact is not available.");
      return;
    }
    Linking.openURL(`tel:${normalized}`).catch(() => {});
  }, [normalizeRiderPhone]);

  const handleTipPaid = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
  }, [queryClient, order.orderId]);

  const handleMessageRider = useCallback(() => {
    router.push({
      pathname: "/orders/partner-chat",
      params: { orderId: order.orderId },
    });
  }, [router, order.orderId]);

  const showRatedThankYou = deliveryRatedOnServer || ratingSubmittedLocal;
  const displayRating = showRatedThankYou
    ? ratingSubmittedLocal
      ? localRating
      : serverDeliveryRating
    : localRating;

  const captainRatingSection = showRatedThankYou ? (
    <View style={styles.rateDoneRow}>
      <Ionicons name="hand-left-outline" size={18} color={MUTED} />
      <View style={styles.rateDoneText}>
        <AppText style={styles.rateDoneTitle}>Thank you for rating!</AppText>
        <AppText style={styles.rateDoneSub}>You rated {displayRating} ★</AppText>
      </View>
    </View>
  ) : (
    <View style={styles.rateBlock}>
      <AppText style={styles.rateTitle}>Rate {riderFirstName}</AppText>
      <InlineStars
        value={localRating}
        onPress={(n) => handleOpenRatingSheet(n)}
        disabled={submitting}
      />
      <TouchableOpacity onPress={() => handleOpenRatingSheet()} activeOpacity={0.85}>
        <AppText style={styles.rateSheetHint}>Tap a star to rate your captain</AppText>
      </TouchableOpacity>
    </View>
  );

  const footerBottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 8);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={MINT_DARK} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: footerBottomPad + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[MINT_DARK, MINT, MINT_LIGHT, PAGE_BG]}
          locations={[0, 0.14, 0.42, 0.92]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.heroBg, { paddingTop: STATUS_BAR_TO_HEADER_GAP }]}
        >
          <View style={styles.heroTopRow}>
            <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.heroSideBtnLeft}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <AppText style={styles.heroTitle} numberOfLines={1}>
              {rideLabel}
            </AppText>
            <View style={styles.heroSideBtnRight} />
          </View>

          <Animated.View style={[styles.checkHeroWrap, heroAnimStyle]}>
            <View style={styles.checkWrap}>
              {CONFETTI_DOTS.map((dot, i) => (
                <View
                  key={i}
                  style={[
                    styles.confettiDot,
                    {
                      backgroundColor: dot.color,
                      width: dot.size,
                      height: dot.size,
                      borderRadius: dot.size / 2,
                      top: dot.top,
                      left: "left" in dot ? dot.left : undefined,
                      right: "right" in dot ? dot.right : undefined,
                    },
                  ]}
                />
              ))}
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={34} color="#fff" />
              </View>
            </View>
          </Animated.View>

          <View style={styles.receiptSlotOuter}>
            <View style={styles.receiptRollerWrap} pointerEvents="none">
              <View style={styles.receiptRollerOuter}>
                <View style={styles.receiptRollerInner} />
              </View>
            </View>
            <View style={styles.receiptCard}>
              <AppText style={styles.receiptTitle}>
                Ride completed at{" "}
                <AppText style={styles.receiptTitleBold}>{dropTitle}</AppText>
              </AppText>
              {deliveredTime ? (
                <AppText style={styles.receiptSub}>Completed at {deliveredTime}</AppText>
              ) : (
                <AppText style={styles.receiptSub}>{formatRideHistoryDateTime(order.createdAt)}</AppText>
              )}
              {vehicleImage ? (
                <RNImage source={vehicleImage} style={styles.vehicleHero} resizeMode="contain" />
              ) : null}
              <AppText style={styles.fareAmount}>
                {formatRideFare(fareBreakdown.total)}
                <AppText style={styles.estTag}> (.est)</AppText>
              </AppText>
              {tripStats ? <AppText style={styles.tripStatsHero}>{tripStats}</AppText> : null}
            </View>
            <ReceiptTornEdge />
          </View>
        </LinearGradient>

        <View style={styles.bodyPad}>
          {order.rider ? (
            <DeliveryPartnerTrackingCard
              mode="delivered"
              partnerKind="ride"
              style={styles.riderCard}
              riderName={riderName}
              riderFirstName={riderFirstName}
              riderPhotoUri={riderPhotoUri}
              riderRating={riderRating}
              deliveredOrdersCount={order.rider.deliveredOrdersCount}
              chatUnreadCount={chatUnreadCount}
              existingTipAmount={existingTip}
              onMessage={handleMessageRider}
              onCall={handleCallRider}
              onTipPreset={() => setTipSheetVisible(true)}
              onSafetyPress={() => setSafetySheetVisible(true)}
              extraSection={captainRatingSection}
            />
          ) : null}

          <View style={styles.mainCard}>
            <AppText style={styles.sectionLabel}>TRIP SUMMARY</AppText>
            <AppText style={styles.rideIdText}>Ride ID #{displayOrderId}</AppText>
            <RouteStop variant="pickup" address={pickupAddress} />
            <RouteStop variant="drop" address={dropAddress} isLast />
            {tripStats ? (
              <AppText style={styles.tripStatsLine}>{tripStats}</AppText>
            ) : null}
            {fareLineItems.map((line) => (
              <View key={`${line.label}-${line.amount}`} style={styles.fareRow}>
                <AppText style={styles.fareRowLabel}>{line.label}</AppText>
                <AppText style={styles.fareRowValue}>{formatRideFare(line.amount)}</AppText>
              </View>
            ))}
            <View style={[styles.fareRow, styles.fareRowTotal]}>
              <AppText style={styles.fareTotalLabel}>Total</AppText>
              <AppText style={styles.fareTotalValue}>{formatRideFare(fareBreakdown.total)}</AppText>
            </View>
          </View>

          <TouchableOpacity style={styles.helpCard} onPress={onOpenHelp} activeOpacity={0.85}>
            <AppAssetImage assetKey={CX.orders.support} style={styles.helpImage} contentFit="contain" />
            <View style={styles.helpTextWrap}>
              <AppText style={styles.helpTitle}>Need help with your ride?</AppText>
              <AppText style={styles.helpSub}>Get help & support</AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DeliveryPartnerSafetyBottomSheet
        visible={safetySheetVisible}
        onClose={() => setSafetySheetVisible(false)}
      />

      {order.rider && !showRatedThankYou ? (
        <RideCaptainRatingSheet
          visible={ratingSheetVisible}
          captainName={riderName}
          captainPhotoUri={riderPhotoUri}
          initialRating={sheetInitialRating}
          initialTags={selectedTags}
          initialReviewText={reviewNote}
          submitting={submitting}
          onClose={() => setRatingSheetVisible(false)}
          onSubmit={(payload) => void handleRatingSheetSubmit(payload)}
        />
      ) : null}

      {order.rider && existingTip <= 0 ? (
        <FoodOrderTipSheet
          visible={tipSheetVisible}
          orderId={order.orderId}
          partnerName={riderName}
          partnerPhotoUri={riderPhotoUri}
          paymentMethodLabel={paymentMethodLabel}
          existingTipAmount={existingTip}
          onClose={() => setTipSheetVisible(false)}
          onTipPaid={handleTipPaid}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  heroBg: { paddingHorizontal: 16, paddingBottom: 12, overflow: "visible" },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    position: "relative",
    marginBottom: 6,
  },
  heroSideBtnLeft: {
    position: "absolute",
    left: 0,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSideBtnRight: { position: "absolute", right: 0, width: 36, height: 36 },
  heroTitle: {
    maxWidth: "72%",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    paddingHorizontal: 8,
  },
  checkHeroWrap: { alignItems: "center", marginBottom: 8 },
  checkWrap: { width: 88, height: 72, alignItems: "center", justifyContent: "center" },
  confettiDot: { position: "absolute" },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: MINT_DARK,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
    ...GatiMitraColors.elevationShadow,
  },
  receiptSlotOuter: { marginTop: 2, marginBottom: 0, overflow: "visible" },
  receiptRollerWrap: {
    marginHorizontal: -6,
    zIndex: 3,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  receiptRollerOuter: {
    height: 22,
    borderRadius: 14,
    backgroundColor: ROLLER_WHITE,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  receiptRollerInner: { flex: 1, borderRadius: 10, backgroundColor: ROLLER_MINT },
  receiptCard: {
    backgroundColor: "#fff",
    marginHorizontal: 8,
    marginTop: -9,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    alignItems: "center",
    zIndex: 2,
    ...GatiMitraColors.elevationShadow,
  },
  receiptTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: TEXT,
    textAlign: "center",
    lineHeight: 26,
  },
  receiptTitleBold: { fontWeight: "800" },
  receiptSub: { fontSize: 13, color: MUTED, marginTop: 6, fontWeight: "500" },
  vehicleHero: { width: 120, height: 80, marginTop: 10, marginBottom: 6 },
  fareAmount: { fontSize: 32, fontWeight: "800", color: TEXT, marginTop: 4 },
  estTag: { fontSize: 14, fontWeight: "500", color: MUTED },
  tripStatsHero: { fontSize: 13, color: MUTED, marginTop: 4, fontWeight: "500" },
  bodyPad: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  riderCard: { marginTop: 0, marginBottom: 0 },
  mainCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginTop: 0,
    marginBottom: 0,
    ...GatiMitraColors.elevationShadow,
  },
  tripStatsLine: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
    marginBottom: 10,
  },
  paymentCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...GatiMitraColors.elevationShadow,
  },
  paymentMethodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
  },
  paymentMethodTextCol: { flex: 1 },
  paymentMethodTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
  },
  paymentMethodSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    lineHeight: 17,
    fontWeight: "500",
  },
  captainRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  captainAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  captainAvatarImg: { width: 48, height: 48 },
  captainInitial: { fontSize: 18, fontWeight: "800", color: MINT_DARK },
  captainInfo: { flex: 1 },
  captainName: { fontSize: 16, fontWeight: "700", color: TEXT },
  captainSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  rateBlock: { gap: 8, marginBottom: 0 },
  rateTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  rateSheetHint: { fontSize: 12, color: MUTED, fontWeight: "500", marginTop: 2 },
  inlineStars: { flexDirection: "row", gap: 4 },
  rateDoneRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 0 },
  rateDoneText: { flex: 1 },
  rateDoneTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  rateDoneSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
  tipCta: {
    backgroundColor: MINT,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  tipCtaText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  tipDone: { fontSize: 13, color: MUTED, textAlign: "center", fontWeight: "500" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  rideIdText: { fontSize: 12, color: MUTED, marginBottom: 12, fontWeight: "500" },
  routeStopRow: { flexDirection: "row", gap: 10, minHeight: 36 },
  routeRailCol: { width: 14, alignItems: "center" },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeDotPickup: { backgroundColor: MINT },
  routeDotDrop: { backgroundColor: "#EF4444" },
  routeRail: {
    flex: 1,
    width: 2,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginVertical: 2,
  },
  routeAddress: { flex: 1, fontSize: 14, color: TEXT, fontWeight: "500", lineHeight: 20, paddingBottom: 10 },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  fareRowLabel: { fontSize: 14, color: MUTED, fontWeight: "500" },
  fareRowValue: { fontSize: 14, color: TEXT, fontWeight: "600" },
  fareRowTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
    paddingTop: 10,
  },
  fareTotalLabel: { fontSize: 15, fontWeight: "700", color: TEXT },
  fareTotalValue: { fontSize: 16, fontWeight: "800", color: TEXT },
  helpCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  helpImage: { width: 44, height: 44 },
  helpTextWrap: { flex: 1 },
  helpTitle: { fontSize: 14, fontWeight: "700", color: "#2563EB" },
  helpSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "500" },
  payFareBtn: {
    marginTop: 14,
    backgroundColor: MINT_DARK,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  payFareBtnDisabled: { opacity: 0.7 },
  payFareBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  dummyPayOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dummyPayCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  dummyPayTitle: { fontSize: 17, fontWeight: "800", color: TEXT, textAlign: "center" },
  dummyPaySub: { fontSize: 13, color: MUTED, textAlign: "center" },
  dummyPayCancel: { alignItems: "center", paddingVertical: 8 },
  dummyPayCancelText: { fontSize: 14, color: MUTED, fontWeight: "600" },
});
