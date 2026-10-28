/**
 * Parcel / courier live tracking — food-style mint header + map + scroll cards
 * (not Rapido person-ride bottom sheet).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Dimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { LiveTrackingStatusChip } from "@/components/orders/LiveTrackingStatusChip";
import { MapboxWebDeliveryMap } from "@/components/maps/MapboxWebDeliveryMap";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import { DeliveryPartnerTrackingCard } from "@/components/orders/DeliveryPartnerTrackingCard";
import { DeliveryPartnerSafetyBottomSheet } from "@/components/orders/DeliveryPartnerSafetyBottomSheet";
import { RideTripShareSheet } from "@/components/ride/RideTripShareSheet";
import { RideCancelledAckSheet } from "@/components/ride/RideCancelledAckSheet";
import { RideCancelReasonSheet } from "@/features/ride/RideCancelReasonSheet";
import { RideCancelConfirmSheet } from "@/features/ride/RideCancelConfirmSheet";
import { PARCEL_TRACKING_CANCEL_REASONS } from "@/lib/parcel-cancel-reasons";
import type { RideCancelReason } from "@/lib/ride-cancel-reasons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { CX } from "@/lib/appAssetKeys";
import { appAssetSource } from "@/components/AppAssetImage";
import { DEFAULT_STATUS_BAR_HEIGHT, STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import type { OrderDetail, OrderTrackingResponse } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { cancelParcelOrder } from "@/services/parcelBooking.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { resolveOrderTrackingMapSnapshots } from "@/lib/orderTrackingMapSnapshots";
import {
  FOOD_DELIVERY_GEOFENCE_RADIUS_M,
  getFoodDeliveryMapPhase,
  isFoodRiderAssignedForMap,
  shouldHighlightFoodDropZone,
  shouldHighlightFoodPickupZone,
} from "@/lib/food-delivery-map-phase";
import {
  isPersonRideOnDropLeg,
  isRiderAtCustomerStatus,
  isRiderAtStoreStatus,
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
  shouldShowCustomerDeliveryOtp,
  shouldShowCustomerPickupOtp,
} from "@/lib/customer-order-status-display";
import { splitPickupOtpDigits } from "@/lib/ride-tracking-display";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import { useFoodDeliveryRouteProgress } from "@/hooks/useFoodDeliveryRouteProgress";
import { useAppInBackground } from "@/hooks/useAppInBackground";
import { pollIntervalWithBackoff, queryRetryDelay } from "@/lib/query-poll-backoff";
import { seedOrderDetailCache } from "@/lib/orderDetailCache";
import {
  resolveSmoothDurationMs,
  useSmoothedRiderPosition,
} from "@gatimitra/map-tracking-engine";

const HEADER_GREEN = GatiMitraColors.deepMintStart;
const PAGE_BG = GatiMitraColors.softBackground;
const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const MINT = GatiMitraColors.primaryMint;

const { height: SCREEN_H } = Dimensions.get("window");
const MAP_HEIGHT = Math.min(220, Math.round(SCREEN_H * 0.28));

type Props = {
  order: OrderDetail;
  tracking: OrderTrackingResponse | undefined;
  etaMinutes: number | null;
  onBack: () => void;
  onOpenHelp: () => void;
  onOrderCancelled?: () => void;
};

function parcelHeadline(status: string, rideStarted: boolean, hasRider: boolean): string {
  const s = normalizeCustomerOrderStatus(status);
  if (s === "DELIVERED") return "Parcel delivered";
  if (s === "CANCELLED") return "Parcel cancelled";
  if (isRiderAtCustomerStatus(s)) return "Captain is near drop";
  if (rideStarted || s === "OUT_FOR_DELIVERY" || s === "ON_THE_WAY" || s === "IN_TRANSIT") {
    return "Parcel is on the way";
  }
  if (isRiderAtStoreStatus(s)) return "Captain at pickup";
  if (hasRider || s === "RIDER_ASSIGNED" || s === "ASSIGNED") {
    return "Captain is heading to pickup";
  }
  if (s === "ACCEPTED" && hasRider) {
    return "Captain is heading to pickup";
  }
  return "Captain nearby assigning one soon";
}

function OtpBanner({ label, otp }: { label: string; otp: string }) {
  const digits = splitPickupOtpDigits(otp);
  return (
    <View style={styles.otpBanner}>
      <View style={styles.otpLeft}>
        <Ionicons name="shield-checkmark-outline" size={17} color={HEADER_GREEN} />
        <CheckoutText style={styles.otpLabel} numberOfLines={1}>
          {label}
        </CheckoutText>
      </View>
      {digits.length > 0 ? (
        <View style={styles.otpBoxes}>
          {digits.map((d, i) => (
            <View key={`otp-${i}`} style={styles.otpBox}>
              <CheckoutText style={styles.otpDigit}>{d}</CheckoutText>
            </View>
          ))}
        </View>
      ) : (
        <CheckoutText style={styles.otpValue}>{otp}</CheckoutText>
      )}
    </View>
  );
}

export function ParcelLiveTrackingScreen({
  order,
  tracking,
  etaMinutes,
  onBack,
  onOpenHelp,
  onOrderCancelled,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);
  const { data: chatUnread } = usePartnerChatUnread(order.orderId, Boolean(order.rider));

  const [mapRefitNonce, setMapRefitNonce] = useState(0);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [safetySheetVisible, setSafetySheetVisible] = useState(false);
  const [cancelFlowStep, setCancelFlowStep] = useState<"reason" | "confirm" | null>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelledAckVisible, setCancelledAckVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HEADER_GREEN, "light");
      return () => resetStatusBarBackground();
    }, [setStatusBarBackground, resetStatusBarBackground])
  );

  const { data: liveDetail } = useQuery({
    queryKey: ["parcelOrderStatus", order.orderId],
    queryFn: () => orderService.getOrder(order.orderId),
    refetchInterval: (q) => pollIntervalWithBackoff(q, 15_000),
    refetchIntervalInBackground: false,
    staleTime: 8_000,
    retry: 2,
    retryDelay: queryRetryDelay,
  });

  useEffect(() => {
    if (!liveDetail) return;
    seedOrderDetailCache(queryClient, order.orderId, {
      orderId: order.orderId,
      status: liveDetail.status,
      pickupOtp: liveDetail.pickupOtp ?? null,
      deliveryOtp: liveDetail.deliveryOtp ?? null,
      pickupOtpVerifiedAt: liveDetail.pickupOtpVerifiedAt ?? null,
      rideStarted: liveDetail.rideStarted ?? false,
      riderReachedPickupAt: liveDetail.riderReachedPickupAt ?? null,
      rider: liveDetail.rider ?? order.rider,
    });
  }, [liveDetail, order.orderId, order.rider, queryClient]);

  const merged: OrderDetail = {
    ...order,
    ...(liveDetail ?? {}),
    rider: liveDetail?.rider ?? order.rider,
  };

  const orderStatus = normalizeCustomerOrderStatus(merged.status);
  const rideStarted = isPersonRideOnDropLeg({
    status: orderStatus,
    rideStarted: merged.rideStarted ?? false,
  });
  const riderArrived = isRiderAtCustomerStatus(orderStatus);

  const hasTrackingFix =
    tracking?.rider?.latitude != null &&
    tracking?.rider?.longitude != null &&
    Number.isFinite(tracking.rider.latitude) &&
    Number.isFinite(tracking.rider.longitude);

  const hasRider = isFoodRiderAssignedForMap(orderStatus, merged.rider, hasTrackingFix, null);
  const trackingLive = !isTerminalOrderStatus(orderStatus);
  const trackingPaused = useAppInBackground();

  const showPickupOtp = shouldShowCustomerPickupOtp(orderStatus, merged.pickupOtp, {
    riderReachedPickupAt: merged.riderReachedPickupAt,
    pickupOtpVerifiedAt: merged.pickupOtpVerifiedAt,
    rideStarted: merged.rideStarted,
    orderType: "parcel",
  });
  const showDeliveryOtp = shouldShowCustomerDeliveryOtp(orderStatus, merged.deliveryOtp);

  const headline = parcelHeadline(orderStatus, rideStarted, hasRider);
  const reassurance = showPickupOtp
    ? "Share this pickup OTP with the captain only at handover"
    : showDeliveryOtp
      ? "Share delivery OTP only after receiving the parcel"
      : rideStarted
        ? "Captain is heading to your drop location"
        : hasRider
          ? "Captain is on the way to pickup"
          : "We're matching a captain near your pickup";

  const { pickupLat, pickupLng, deliveryLat, deliveryLng } = resolveOrderTrackingMapSnapshots({
    deliveryLat: merged.deliveryLat,
    deliveryLng: merged.deliveryLng,
    pickupLat: merged.pickupLat,
    pickupLng: merged.pickupLng,
    distanceKm: merged.distanceKm ?? null,
  });

  const riderLat = tracking?.rider?.latitude ?? null;
  const riderLng = tracking?.rider?.longitude ?? null;
  const riderHeading = tracking?.rider?.headingDegrees ?? null;
  const riderPos =
    riderLat != null && riderLng != null ? { latitude: riderLat, longitude: riderLng } : null;

  const mapPhase = getFoodDeliveryMapPhase(orderStatus, {
    riderReachedPickupAt: merged.riderReachedPickupAt,
    riderPickedUpAt: merged.pickupOtpVerifiedAt ?? merged.riderPickedUpAt,
  });

  const highlightPickupZone = shouldHighlightFoodPickupZone({
    status: orderStatus,
    riderReachedPickupAt: merged.riderReachedPickupAt,
    riderPickedUpAt: merged.pickupOtpVerifiedAt ?? merged.riderPickedUpAt,
    riderLat,
    riderLng,
    pickupLat,
    pickupLng,
  });
  const highlightDropZone = shouldHighlightFoodDropZone({
    status: orderStatus,
    riderPickedUpAt: merged.pickupOtpVerifiedAt ?? merged.riderPickedUpAt,
    riderLat,
    riderLng,
    dropLat: deliveryLat,
    dropLng: deliveryLng,
  });

  const pickupPoint = useMemo(
    () => ({ latitude: pickupLat, longitude: pickupLng }),
    [pickupLat, pickupLng]
  );
  const dropPoint = useMemo(
    () => ({ latitude: deliveryLat, longitude: deliveryLng }),
    [deliveryLat, deliveryLng]
  );

  const {
    fullRoute,
    remainingRoute,
    preRiderArcRoute,
    connectorRoute,
    routeJoinPoint,
    hideRouteLine,
  } = useFoodDeliveryRouteProgress({
    phase: mapPhase,
    rider: riderPos,
    pickup: pickupPoint,
    drop: dropPoint,
    orderId: order.orderId,
    riderArrived,
    riderHeading,
    hasRider,
    trackingLive,
  });

  const riderGpsFix = useMemo(() => {
    if (!hasRider || !riderPos || !trackingLive) return undefined;
    return {
      lat: riderPos.latitude,
      lng: riderPos.longitude,
      headingDeg: riderHeading ?? undefined,
      speedMps: tracking?.rider?.speedMps ?? undefined,
    };
  }, [
    hasRider,
    trackingLive,
    riderPos?.latitude,
    riderPos?.longitude,
    riderHeading,
    tracking?.rider?.speedMps,
  ]);

  const smoothedRider = useSmoothedRiderPosition(
    riderGpsFix,
    resolveSmoothDurationMs(tracking?.rider?.speedMps),
    trackingPaused
  );
  const mapRiderHeading = smoothedRider?.headingDeg ?? riderHeading;

  const deliveryMapCenter = useMemo(
    () => ({
      latitude: pickupLat || deliveryLat || 24.88,
      longitude: pickupLng || deliveryLng || 85.52,
    }),
    [pickupLat, pickupLng, deliveryLat, deliveryLng]
  );

  const deliveryMapPayload = useMemo<DeliveryMapPayload>(() => {
    const shownRider = smoothedRider
      ? { latitude: smoothedRider.lat, longitude: smoothedRider.lng }
      : riderPos;
    return {
      pickupLat,
      pickupLng,
      dropLat: deliveryLat,
      dropLng: deliveryLng,
      riderLat: shownRider?.latitude ?? null,
      riderLng: shownRider?.longitude ?? null,
      riderHeading: mapRiderHeading,
      riderSpeedMps: tracking?.rider?.speedMps ?? null,
      fullRoute,
      remainingRoute,
      preRiderArcRoute: preRiderArcRoute ?? undefined,
      connectorRoute: connectorRoute ?? undefined,
      routeJoinLat: routeJoinPoint?.latitude ?? null,
      routeJoinLng: routeJoinPoint?.longitude ?? null,
      hideRouteLine,
      highlightPickupZone,
      highlightDropZone,
      geofenceRadiusM: FOOD_DELIVERY_GEOFENCE_RADIUS_M,
      riderArrived,
      mapPhase,
      showPickupMarker: mapPhase === "rider_to_pickup",
      showDropMarker: true,
    };
  }, [
    pickupLat,
    pickupLng,
    deliveryLat,
    deliveryLng,
    smoothedRider,
    riderPos,
    mapRiderHeading,
    tracking?.rider?.speedMps,
    fullRoute,
    remainingRoute,
    preRiderArcRoute,
    connectorRoute,
    routeJoinPoint,
    hideRouteLine,
    highlightPickupZone,
    highlightDropZone,
    riderArrived,
    mapPhase,
  ]);

  const displayOrderId = merged.formattedOrderId ?? merged.orderId;
  const meta = merged.checkoutMetadata ?? {};
  const senderName =
    (typeof meta.senderName === "string" && meta.senderName.trim()) || "Sender";
  const senderPhone =
    (typeof meta.senderMobile === "string" && meta.senderMobile.trim()) ||
    merged.merchantPhone ||
    null;
  const senderAddress =
    (typeof meta.pickupFullAddress === "string" && meta.pickupFullAddress.trim()) ||
    (typeof meta.pickupAddress === "string" && meta.pickupAddress.trim()) ||
    merged.merchantAddress?.trim() ||
    (typeof meta.pickupLabel === "string" && meta.pickupLabel.trim()) ||
    "Pickup address unavailable";
  const receiverName =
    (typeof meta.receiverName === "string" && meta.receiverName.trim()) ||
    merged.deliveryPrimaryContactName?.trim() ||
    merged.deliveryContactName?.trim() ||
    "Receiver";
  const receiverPhone =
    (typeof meta.receiverMobile === "string" && meta.receiverMobile.trim()) ||
    merged.deliveryPrimaryContactPhone?.trim() ||
    merged.deliveryContactPhone?.trim() ||
    null;
  const receiverAddress =
    (typeof meta.dropFullAddress === "string" && meta.dropFullAddress.trim()) ||
    merged.deliveryAddress?.trim() ||
    (typeof meta.dropLabel === "string" && meta.dropLabel.trim()) ||
    "Drop address unavailable";

  const riderName = merged.rider?.name?.trim() || "Captain";
  const riderFirstName = riderName.split(" ")[0] ?? riderName;
  const riderPhotoUri = toAbsoluteImageUrl(merged.rider?.photoUrl);
  const riderRating =
    merged.rider?.rating != null && Number.isFinite(merged.rider.rating)
      ? merged.rider.rating.toFixed(1)
      : null;

  const headerTopPadding =
    (insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT) + STATUS_BAR_TO_HEADER_GAP;

  const handleShare = useCallback(() => setShareSheetVisible(true), []);

  const handleCallRider = useCallback(() => {
    const digits = merged.rider?.phone?.replace(/\D/g, "") ?? "";
    if (!digits) {
      Alert.alert("Unavailable", "Captain phone number is not available right now.");
      return;
    }
    const tel = digits.length === 10 ? `+91${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
    void Linking.openURL(`tel:${tel}`);
  }, [merged.rider?.phone]);

  const handleMessageRider = useCallback(() => {
    router.push({
      pathname: "/orders/partner-chat",
      params: {
        orderId: order.orderId,
        partnerName: riderName,
        restaurantName: "Courier",
        partnerRole: "Mitra-Sathi",
        orderSubtitle: "Live parcel delivery",
        ...(merged.rider?.phone ? { partnerPhone: merged.rider.phone } : {}),
        ...(merged.rider?.photoUrl ? { partnerPhoto: merged.rider.photoUrl } : {}),
      },
    });
  }, [router, order.orderId, riderName, merged.rider]);

  const dialPhone = useCallback((phone: string | null, label: string) => {
    const digits = phone?.replace(/\D/g, "") ?? "";
    if (!digits) {
      Alert.alert("Unavailable", `${label} phone is not available.`);
      return;
    }
    const tel = digits.length === 10 ? `+91${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
    void Linking.openURL(`tel:${tel}`);
  }, []);

  const handleCallSender = useCallback(
    () => dialPhone(senderPhone, "Sender"),
    [dialPhone, senderPhone]
  );
  const handleCallReceiver = useCallback(
    () => dialPhone(receiverPhone, "Receiver"),
    [dialPhone, receiverPhone]
  );

  const closeCancelFlow = useCallback(() => {
    setCancelFlowStep(null);
    setSelectedCancelReason(null);
    setCancelLoading(false);
  }, []);

  const openCancelFlow = useCallback(() => {
    if (cancelLoading || rideStarted) return;
    setCancelFlowStep("reason");
  }, [cancelLoading, rideStarted]);

  const executeCancelParcel = useCallback(async () => {
    if (cancelLoading || rideStarted) return;
    const reason = selectedCancelReason;
    setCancelLoading(true);
    setCancelFlowStep(null);
    try {
      await cancelParcelOrder(order.orderId, {
        reasonCode: reason?.id ?? "CUSTOMER_CANCELLED",
        reasonText: reason?.label ?? "Customer cancelled from tracking",
        cancelMode: "manual",
      });
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      setSelectedCancelReason(null);
      setCancelledAckVisible(true);
    } catch {
      setCancelLoading(false);
      setCancelFlowStep("confirm");
      Alert.alert("Could not cancel", "Please try again or contact support.");
    }
  }, [cancelLoading, rideStarted, selectedCancelReason, order.orderId, queryClient]);

  const handleCancelledAckDismiss = useCallback(() => {
    setCancelledAckVisible(false);
    setCancelLoading(false);
    onOrderCancelled?.();
  }, [onOrderCancelled]);

  const etaLabel =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? `${Math.max(1, Math.round(etaMinutes))} min`
      : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={HEADER_GREEN} />

      <LinearGradient
        colors={[HEADER_GREEN, HEADER_GREEN]}
        style={[styles.heroHeader, { paddingTop: headerTopPadding }]}
      >
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.heroSideBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <CheckoutText style={styles.heroTitle} numberOfLines={1}>
            Courier
          </CheckoutText>
          <TouchableOpacity onPress={handleShare} hitSlop={12} style={styles.heroSideBtn}>
            <Ionicons name="share-social-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <CheckoutText style={styles.heroHeadline}>{headline}</CheckoutText>
        <CheckoutText style={styles.heroReassurance}>{reassurance}</CheckoutText>

        {etaLabel ? (
          <View style={styles.etaPillWrap}>
            <View style={styles.etaPill}>
              <CheckoutText style={styles.etaPillText}>ETA {etaLabel}</CheckoutText>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {/* Map lives inside ScrollView (food-tracking pattern) so it never steals vertical scroll. */}
        <View style={styles.mapWrap} collapsable={false}>
          <AppErrorBoundary
            source="parcel-live-map"
            fallback={() => (
              <View style={styles.mapFallback}>
                <MaterialCommunityIcons name="map-outline" size={36} color="#94A3B8" />
                <CheckoutText style={styles.mapFallbackText}>Map preview unavailable</CheckoutText>
              </View>
            )}
          >
            <View style={styles.mapSection} pointerEvents="box-none">
              <MapboxWebDeliveryMap
                key={order.orderId}
                style={StyleSheet.absoluteFill}
                center={deliveryMapCenter}
                payload={deliveryMapPayload}
                refitNonce={mapRefitNonce}
                gesturesEnabled={false}
              />
            </View>
          </AppErrorBoundary>
          <LiveTrackingStatusChip
            hasRiderFix={riderLat != null && riderLng != null}
            style={styles.liveStatusChip}
          />
          <TouchableOpacity
            style={[styles.mapControlBtn, styles.mapExpandBtn]}
            activeOpacity={0.85}
            onPress={() => setMapRefitNonce((n) => n + 1)}
          >
            <MaterialCommunityIcons name="arrow-expand" size={18} color="#1C1C1C" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapControlBtn, styles.mapLocateBtn]}
            activeOpacity={0.85}
            onPress={() => setMapRefitNonce((n) => n + 1)}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#1C1C1C" />
          </TouchableOpacity>
        </View>

        {showPickupOtp && merged.pickupOtp ? (
          <OtpBanner label="Pickup OTP" otp={merged.pickupOtp} />
        ) : null}
        {showDeliveryOtp && merged.deliveryOtp ? (
          <OtpBanner label="Delivery OTP" otp={merged.deliveryOtp} />
        ) : null}

        <View style={styles.cardsSection}>
          {merged.rider ? (
            <DeliveryPartnerTrackingCard
              riderName={riderName}
              riderFirstName={riderFirstName}
              riderPhotoUri={riderPhotoUri}
              riderRating={riderRating}
              deliveredOrdersCount={merged.rider.deliveredOrdersCount}
              chatUnreadCount={chatUnread?.unreadCount ?? 0}
              existingTipAmount={0}
              hideTip
              onMessage={handleMessageRider}
              onCall={handleCallRider}
              onTipPreset={() => undefined}
              onSafetyPress={() => setSafetySheetVisible(true)}
            />
          ) : (
            <View style={styles.waitingCard}>
              <ActivityIndicator color={MINT} />
              <CheckoutText style={styles.waitingText}>
                Captain nearby assigning one soon
              </CheckoutText>
            </View>
          )}

          <View style={styles.partyCard}>
            <View style={styles.partyHeader}>
              <View style={[styles.summaryAvatar, styles.senderAvatar]}>
                <MaterialCommunityIcons name="package-variant-closed" size={20} color="#fff" />
              </View>
              <CheckoutText style={styles.partyRole}>Sender</CheckoutText>
              {senderPhone ? (
                <TouchableOpacity style={styles.callBtn} onPress={handleCallSender} activeOpacity={0.85}>
                  <Ionicons name="call" size={18} color="#E23744" />
                </TouchableOpacity>
              ) : null}
            </View>
            <CheckoutText style={styles.partyNamePhone} numberOfLines={1}>
              {senderPhone ? `${senderName} (${senderPhone})` : senderName}
            </CheckoutText>
            <CheckoutText style={styles.partyAddress}>{senderAddress}</CheckoutText>
          </View>

          <View style={styles.partyCard}>
            <View style={styles.partyHeader}>
              <View style={[styles.summaryAvatar, styles.receiverAvatar]}>
                <Ionicons name="person" size={20} color="#fff" />
              </View>
              <CheckoutText style={styles.partyRole}>Receiver</CheckoutText>
              {receiverPhone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={handleCallReceiver}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call" size={18} color="#E23744" />
                </TouchableOpacity>
              ) : null}
            </View>
            <CheckoutText style={styles.partyNamePhone} numberOfLines={1}>
              {receiverPhone ? `${receiverName} (${receiverPhone})` : receiverName}
            </CheckoutText>
            <CheckoutText style={styles.partyAddress}>{receiverAddress}</CheckoutText>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.orderIdRow}>
              <Ionicons name="document-text-outline" size={16} color={MUTED} />
              <CheckoutText style={styles.orderIdText}>Order #{displayOrderId}</CheckoutText>
            </View>
          </View>

          <TouchableOpacity style={styles.helpCard} onPress={onOpenHelp} activeOpacity={0.85}>
            <Ionicons name="help-circle-outline" size={20} color={TEXT} />
            <CheckoutText style={styles.helpText}>Need help with this parcel?</CheckoutText>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </TouchableOpacity>

          {!isTerminalOrderStatus(orderStatus) && !rideStarted ? (
            <TouchableOpacity
              style={styles.cancelCard}
              onPress={openCancelFlow}
              activeOpacity={0.85}
              disabled={cancelLoading}
            >
              <CheckoutText style={styles.cancelText}>
                {cancelLoading ? "Cancelling…" : "Cancel parcel"}
              </CheckoutText>
              <Ionicons name="chevron-forward" size={18} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <DeliveryPartnerSafetyBottomSheet
        visible={safetySheetVisible}
        onClose={() => setSafetySheetVisible(false)}
      />

      <RideTripShareSheet
        visible={shareSheetVisible}
        orderId={order.orderId}
        shareKind="food"
        onClose={() => setShareSheetVisible(false)}
      />

      <RideCancelReasonSheet
        visible={cancelFlowStep === "reason"}
        onClose={closeCancelFlow}
        reasons={PARCEL_TRACKING_CANCEL_REASONS}
        title="Why do you want to cancel?"
        subtitle="Please provide the reason for cancelling this parcel"
        onSelectReason={(reason) => {
          setSelectedCancelReason(reason);
          setCancelFlowStep("confirm");
        }}
      />

      <RideCancelConfirmSheet
        visible={cancelFlowStep === "confirm"}
        loading={cancelLoading}
        heroImage={appAssetSource(CX.home.serviceParcel) ?? undefined}
        title="Are you sure you want to cancel this parcel?"
        message="By cancelling, you may need to start a new search that can take longer to find a captain."
        confirmLabel="Cancel my parcel"
        keepLabel="Keep parcel"
        onConfirm={() => void executeCancelParcel()}
        onKeepSearching={closeCancelFlow}
        onClose={closeCancelFlow}
      />

      <RideCancelledAckSheet
        visible={cancelledAckVisible}
        title="Parcel cancelled"
        message="Your parcel booking has been cancelled."
        onDismiss={handleCancelledAckDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  heroHeader: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  heroSideBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  heroTitle: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
  },
  heroHeadline: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  heroReassurance: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
    textAlign: "center",
  },
  etaPillWrap: {
    alignItems: "center",
  },
  etaPill: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  etaPillText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scroll: { flex: 1 },
  mapWrap: {
    marginTop: 10,
    marginHorizontal: 12,
    height: MAP_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E5E7EB",
  },
  mapFallbackText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  partyCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 4,
  },
  partyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  partyRole: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  partyNamePhone: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
    flexShrink: 1,
  },
  partyAddress: { fontSize: 13, color: MUTED, lineHeight: 18, marginTop: 4 },
  senderAvatar: { backgroundColor: GatiMitraColors.emerald },
  receiverAvatar: { backgroundColor: "#2563EB" },
  mapSection: { ...StyleSheet.absoluteFillObject },
  liveStatusChip: { position: "absolute", top: 10, left: 10 },
  mapControlBtn: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  mapExpandBtn: { top: 10, right: 10 },
  mapLocateBtn: { bottom: 10, right: 10 },
  otpBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  otpLabel: { fontSize: 13, fontWeight: "700", color: TEXT },
  otpValue: { fontSize: 18, fontWeight: "800", color: TEXT, letterSpacing: 2 },
  otpBoxes: { flexDirection: "row", gap: 5 },
  otpBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  otpDigit: { fontSize: 16, fontWeight: "800", color: TEXT },
  cardsSection: { paddingHorizontal: 12, paddingTop: 12, gap: 12 },
  waitingCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  waitingText: { fontSize: 14, fontWeight: "600", color: MUTED, textAlign: "center" },
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  summaryAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#FFD6D6",
    alignItems: "center",
    justifyContent: "center",
  },
  orderIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderIdText: { fontSize: 13, fontWeight: "600", color: TEXT },
  helpCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  helpText: { flex: 1, fontSize: 14, fontWeight: "600", color: TEXT },
  cancelCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#B91C1C" },
});
