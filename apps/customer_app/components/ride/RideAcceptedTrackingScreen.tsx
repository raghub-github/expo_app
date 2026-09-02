/**
 * Rapido-style live tracking after a rider accepts a person-ride order.
 * Map (animated rider → pickup route) + bottom sheet with road ETA, distance, PIN, captain card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { View, StyleSheet, TouchableOpacity, Image, Platform, Linking, Alert, ActivityIndicator, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LiveTrackingStatusChip } from "@/components/orders/LiveTrackingStatusChip";
import { PartnerChatUnreadBadge } from "@/components/orders/PartnerChatUnreadBadge";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import { MapboxWebRideTrackingMap } from "@/components/maps/MapboxWebRideTrackingMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { RideRouteMapPillOverlay } from "@/features/ride/RideRouteMapPillOverlay";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderDetail } from "@/services/order.service";
import type { OrderTrackingResponse } from "@/services/order.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  formatPickupEtaMinutes,
  formatRouteDistanceMeters,
  formatRiderDistanceToPickup,
  resolveRideLegEtaMinutes,
  splitPickupOtpDigits,
} from "@/lib/ride-tracking-display";
import {
  FOOD_DELIVERY_GEOFENCE_RADIUS_M,
  shouldHighlightFoodPickupZone,
  shouldHighlightRideDropZone,
} from "@/lib/food-delivery-map-phase";
import { normalizeCustomerOrderStatus, isPersonRideOnDropLeg, isParcelOrder, shouldShowCustomerPickupOtp } from "@/lib/customer-order-status-display";
import { getRideOrderStatus, cancelRideOrder, type RideOrderStatusResponse } from "@/services/rideBooking.service";
import { cancelParcelOrder } from "@/services/parcelBooking.service";
import { orderService } from "@/services/order.service";
import { buildRideSearchingResumeParams } from "@/lib/person-ride-orders";
import { RideTripDetailsSheet } from "@/components/ride/RideTripDetailsSheet";
import { RideInProgressNoticeCarousel } from "@/components/ride/RideInProgressNoticeCarousel";
import { speakRideTollNotice } from "@/lib/speak-ride-notice";
import { shouldShowRideTollNotice } from "@/lib/ride-toll-notice";
import { RideTripShareSheet } from "@/components/ride/RideTripShareSheet";
import { RideCancelReasonSheet } from "@/features/ride/RideCancelReasonSheet";
import { RideCancelConfirmSheet } from "@/features/ride/RideCancelConfirmSheet";
import { RideCancelledAckSheet } from "@/components/ride/RideCancelledAckSheet";
import type { RideCancelReason } from "@/lib/ride-cancel-reasons";
import { purgeRideOrderFromClientCaches } from "@/lib/ride-order-query-cache";
import { seedOrderDetailCache } from "@/lib/orderDetailCache";
import { isPlaceholderCaptainName, mergeCaptainProfile } from "@/lib/mergeCaptainProfile";
import { useRiderToPickupLiveRoute } from "@/hooks/useRiderToPickupLiveRoute";
import { bearingDegrees, type MapLatLng } from "@/lib/map-route-utils";
import {
  resolveRidePickupPoint,
  resolveRideDropPoint,
  sanitizeRiderPositionForPickup,
} from "@/lib/ride-map-coords";
import {
  resolveSmoothDurationMs,
  useSmoothedRiderPosition,
} from "@gatimitra/map-tracking-engine";
import {
  buildRidePickupWaitCustomerBanner,
  fitRideWaitBannerFontSize,
  formatRideWaitHhMmSs,
  formatRideWaitMmSs,
  isRidePickupWaitActive,
  resolveRidePickupFreeRemainingSeconds,
  resolveRidePickupWaitElapsedSeconds,
} from "@/lib/ride-pickup-wait";
import { pollIntervalWithBackoff, queryRetryDelay } from "@/lib/query-poll-backoff";
import { buildActiveRideTripFareBreakdown, resolveRideVehicleImage } from "@/lib/ride-order-display";

const ACCENT_BLUE = "#4285F4";
const BANNER_NAVY = "#1B3A6B";
const GREEN = GatiMitraColors.primaryMint;
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

type RideAcceptedTrackingScreenProps = {
  order: OrderDetail;
  tracking: OrderTrackingResponse | undefined;
  etaMinutes: number | null;
  onBack: () => void;
  onOpenSupport: () => void;
};

function resolveRideCatalogId(order: OrderDetail): string {
  const allowed = ["bike", "bike-lite", "auto", "ev_auto", "cab-economy", "cab-premium"] as const;
  const raw = order.rideType?.trim().toLowerCase();
  if (raw && allowed.includes(raw as (typeof allowed)[number])) {
    return raw;
  }
  const meta = order.checkoutMetadata as Record<string, unknown> | null;
  const fromMeta = String(meta?.rideType ?? meta?.selectedRideId ?? meta?.vehicleCategory ?? "")
    .trim()
    .toLowerCase();
  if (fromMeta && allowed.includes(fromMeta as (typeof allowed)[number])) {
    return fromMeta;
  }
  // Parcel category → ride marker family (no bike-lite for courier).
  if (fromMeta === "2_wheeler") return "bike";
  if (fromMeta === "3_wheeler") return "auto";
  if (fromMeta === "4_wheeler_non_ac" || fromMeta.includes("4_wheeler")) return "cab-economy";
  if (isParcelOrder(order)) return "bike";
  return "bike";
}

async function fetchLiveTrackingStatus(order: OrderDetail): Promise<RideOrderStatusResponse> {
  if (isParcelOrder(order)) {
    const detail = await orderService.getOrder(order.orderId);
    const status = normalizeCustomerOrderStatus(detail.status);
    return {
      orderId: detail.orderId,
      coreOrderId: 0,
      status: detail.status,
      appStatus: status,
      riderId: detail.rider ? 1 : null,
      riderAssigned: !!detail.rider,
      rider: detail.rider
        ? {
            name: detail.rider.name,
            phone: detail.rider.phone,
            photoUrl: detail.rider.photoUrl,
            rating: detail.rider.rating,
            deliveredOrdersCount: detail.rider.deliveredOrdersCount,
            vehicleRegistration: detail.rider.vehicleRegistration,
            vehicleModel: detail.rider.vehicleModel,
          }
        : null,
      totalAmount: detail.totalAmount ?? 0,
      searchExpiresAt: null,
      cancelled: status === "CANCELLED",
      pickupOtp: detail.pickupOtp ?? null,
      deliveryOtp: detail.deliveryOtp ?? null,
      rideStarted: detail.rideStarted ?? false,
      riderReachedPickupAt: detail.riderReachedPickupAt ?? null,
      pickupOtpVerifiedAt: detail.pickupOtpVerifiedAt ?? null,
    };
  }
  return getRideOrderStatus(order.orderId);
}

export function RideAcceptedTrackingScreen({
  order,
  tracking,
  etaMinutes,
  onBack,
  onOpenSupport,
}: RideAcceptedTrackingScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: chatUnread } = usePartnerChatUnread(order.orderId, Boolean(order.rider));
  const chatUnreadCount = chatUnread?.unreadCount ?? 0;
  const mapRef = useRef<CustomerMapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFrameTick, setMapFrameTick] = useState(0);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [cancelFlowStep, setCancelFlowStep] = useState<"reason" | "confirm" | null>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelledAckVisible, setCancelledAckVisible] = useState(false);
  const [waitTick, setWaitTick] = useState(() => Date.now());
  const lastFitKeyRef = useRef("");
  const tollNoticeSpokenRef = useRef<string | null>(null);

  const pickupPoint = useMemo(() => resolveRidePickupPoint(order), [order]);
  const dropPoint = useMemo(() => resolveRideDropPoint(order), [order]);
  const orderStatus = normalizeCustomerOrderStatus(order.status);

  const liveStatusQueryKey = [
    isParcelOrder(order) ? "parcelOrderStatus" : "rideOrderStatus",
    order.orderId,
  ] as const;
  const { data: liveRideStatus } = useQuery({
    queryKey: liveStatusQueryKey,
    queryFn: () => fetchLiveTrackingStatus(order),
    refetchInterval: (query) => pollIntervalWithBackoff(query, 15_000),
    refetchIntervalInBackground: false,
    staleTime: 8_000,
    refetchOnMount: "always",
    initialData: () => queryClient.getQueryData<RideOrderStatusResponse>(liveStatusQueryKey),
    placeholderData: order.rider
      ? {
          orderId: order.orderId,
          coreOrderId: 0,
          status: order.status,
          appStatus: orderStatus,
          riderId: 1,
          riderAssigned: true,
          rider: order.rider,
          totalAmount: order.totalAmount ?? 0,
          searchExpiresAt: null,
          cancelled: false,
          pickupOtp: order.pickupOtp ?? null,
          deliveryOtp: order.deliveryOtp ?? null,
          rideStarted: order.rideStarted ?? false,
          riderReachedPickupAt: order.riderReachedPickupAt ?? null,
          pickupOtpVerifiedAt: order.pickupOtpVerifiedAt ?? null,
        }
      : undefined,
    retry: 2,
    retryDelay: queryRetryDelay,
  });

  // Keep order cache captain fields filled from the faster ride-status payload.
  useEffect(() => {
    if (!liveRideStatus?.rider) return;
    seedOrderDetailCache(queryClient, order.orderId, {
      orderId: order.orderId,
      status: liveRideStatus.appStatus || order.status,
      rider: liveRideStatus.rider,
    });
  }, [liveRideStatus?.rider, liveRideStatus?.appStatus, order.orderId, order.status, queryClient]);

  // Parcel: keep drop OTP / rideStarted in sync with status polls.
  useEffect(() => {
    if (!isParcelOrder(order) || !liveRideStatus) return;
    const nextDeliveryOtp = liveRideStatus.deliveryOtp ?? null;
    const nextRideStarted = liveRideStatus.rideStarted === true;
    const nextPickupVerified =
      liveRideStatus.pickupOtpVerifiedAt ?? null;
    const sameOtp = (nextDeliveryOtp ?? "") === (order.deliveryOtp ?? "");
    const sameStarted = nextRideStarted === (order.rideStarted === true);
    const sameVerified =
      (nextPickupVerified ?? "") === (order.pickupOtpVerifiedAt ?? "");
    if (sameOtp && sameStarted && sameVerified) return;
    seedOrderDetailCache(queryClient, order.orderId, {
      orderId: order.orderId,
      status: liveRideStatus.appStatus || order.status,
      deliveryOtp: nextDeliveryOtp ?? order.deliveryOtp ?? null,
      pickupOtp: liveRideStatus.pickupOtp ?? order.pickupOtp ?? null,
      pickupOtpVerifiedAt: nextPickupVerified ?? order.pickupOtpVerifiedAt ?? null,
      rideStarted: nextRideStarted || order.rideStarted === true,
      riderReachedPickupAt:
        liveRideStatus.riderReachedPickupAt ?? order.riderReachedPickupAt ?? null,
      ...(liveRideStatus.rider ? { rider: liveRideStatus.rider } : {}),
    });
  }, [
    liveRideStatus,
    order.orderId,
    order.status,
    order.deliveryOtp,
    order.pickupOtp,
    order.pickupOtpVerifiedAt,
    order.rideStarted,
    order.riderReachedPickupAt,
    queryClient,
  ]);

  const captain = mergeCaptainProfile(order.rider, liveRideStatus?.rider);

  // Assigned but profile still missing → force order detail refetch once.
  const captainHydrateAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isPlaceholderCaptainName(captain?.name) && (captain?.photoUrl || captain?.vehicleRegistration)) {
      return;
    }
    if (!liveRideStatus?.riderAssigned && !liveRideStatus?.riderId) return;
    if (captainHydrateAttemptedRef.current) return;
    captainHydrateAttemptedRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
  }, [
    captain?.name,
    captain?.photoUrl,
    captain?.vehicleRegistration,
    liveRideStatus?.riderAssigned,
    liveRideStatus?.riderId,
    order.orderId,
    queryClient,
  ]);
  useEffect(() => {
    if (!liveRideStatus || liveRideStatus.cancelled) return;
    const app = (liveRideStatus.appStatus ?? "").trim().toUpperCase();
    if (app === "DELIVERED") {
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
      return;
    }
    const captainGone =
      app === "SEARCHING_RIDER" &&
      !liveRideStatus.riderAssigned &&
      (liveRideStatus.riderId == null || liveRideStatus.riderId <= 0);
    if (!captainGone) return;

    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });

    if (isParcelOrder(order)) {
      router.replace("/home/service/parcel-searching" as never);
      return;
    }

    router.replace({
      pathname: "/home/service/ride-searching",
      params: {
        ...buildRideSearchingResumeParams(order),
        captainCancelled: "1",
      },
    });
  }, [liveRideStatus, order, router, queryClient]);

  const rideInProgress = isPersonRideOnDropLeg({
    status: liveRideStatus?.appStatus ?? orderStatus,
    rideStarted: liveRideStatus?.rideStarted ?? order.rideStarted ?? false,
  });

  const rideCatalogId = resolveRideCatalogId(order);

  useEffect(() => {
    if (!rideInProgress) return;
    if (isParcelOrder(order)) return;
    if (!shouldShowRideTollNotice(rideCatalogId)) return;
    if (tollNoticeSpokenRef.current === order.orderId) return;
    tollNoticeSpokenRef.current = order.orderId;
    void speakRideTollNotice();
  }, [rideInProgress, order, rideCatalogId]);

  const rideWaitFields = useMemo(
    () => ({
      riderReachedPickupAt:
        liveRideStatus?.riderReachedPickupAt ?? order.riderReachedPickupAt ?? null,
      pickupOtpVerifiedAt:
        liveRideStatus?.pickupOtpVerifiedAt ?? order.pickupOtpVerifiedAt ?? null,
      pickupWaitSeconds: liveRideStatus?.pickupWaitSeconds ?? null,
      pickupWaitFreeMinutes: liveRideStatus?.pickupWaitFreeMinutes,
    }),
    [
      liveRideStatus,
      order.riderReachedPickupAt,
      order.pickupOtpVerifiedAt,
    ]
  );

  const pickupWaitActive = !rideInProgress && isRidePickupWaitActive(rideWaitFields);

  useEffect(() => {
    if (!pickupWaitActive) return;
    const timer = setInterval(() => setWaitTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pickupWaitActive]);

  const isParcel = isParcelOrder(order);
  const pinDigits = splitPickupOtpDigits(
    liveRideStatus?.pickupOtp ?? order.pickupOtp
  );
  const showPickupPin = shouldShowCustomerPickupOtp(
    liveRideStatus?.appStatus ?? orderStatus,
    liveRideStatus?.pickupOtp ?? order.pickupOtp,
    {
      riderReachedPickupAt:
        liveRideStatus?.riderReachedPickupAt ?? order.riderReachedPickupAt ?? null,
      pickupOtpVerifiedAt:
        liveRideStatus?.pickupOtpVerifiedAt ?? order.pickupOtpVerifiedAt ?? null,
      rideStarted: liveRideStatus?.rideStarted ?? order.rideStarted ?? false,
    }
  );

  // Person ride has no delivery OTP. Parcel uses ParcelLiveTrackingScreen.
  const showDropOtp = false;
  const dropPinDigits: string[] = [];

  const rawRiderPos = useMemo<MapLatLng | null>(() => {
    if (!tracking?.rider) return null;
    return {
      latitude: tracking.rider.latitude,
      longitude: tracking.rider.longitude,
    };
  }, [tracking?.rider?.latitude, tracking?.rider?.longitude]);

  const riderPos = useMemo(() => {
    if (rideInProgress) return rawRiderPos;
    return sanitizeRiderPositionForPickup(rawRiderPos, pickupPoint);
  }, [rawRiderPos, pickupPoint, rideInProgress]);

  const routeDestination = rideInProgress ? dropPoint : pickupPoint;

  const rideVehicleImage = resolveRideVehicleImage(rideCatalogId);
  const {
    coordinates: routeCoordinates,
    fullCoordinates: fullRouteCoordinates,
    distanceM,
    etaMinutes: routeEtaMinutes,
  } = useRiderToPickupLiveRoute(
    riderPos,
    routeDestination,
    rideCatalogId,
    tracking?.rider?.headingDegrees ?? null
  );

  const displayRouteCoordinates = useMemo(() => {
    if (!routeDestination) return [];
    if (routeCoordinates.length > 1) return routeCoordinates;
    if (riderPos) return [riderPos, routeDestination];
    if (rideInProgress && pickupPoint && dropPoint) return [pickupPoint, dropPoint];
    return [];
  }, [routeCoordinates, riderPos, routeDestination, rideInProgress, pickupPoint, dropPoint]);

  const mapRouteCoordinates = useMemo(() => {
    if (rideInProgress && fullRouteCoordinates.length >= 2) return fullRouteCoordinates;
    return displayRouteCoordinates;
  }, [rideInProgress, fullRouteCoordinates, displayRouteCoordinates]);

  const mapCenter = useMemo(
    () => ({
      latitude: pickupPoint?.latitude ?? 24.88,
      longitude: pickupPoint?.longitude ?? 85.52,
    }),
    [pickupPoint]
  );

  const footerBottomPad = Math.max(insets.bottom, 12);
  /** Padding within the map viewport (sheet is a sibling — not an overlay). */
  const mapEdgePadding = useMemo(
    () => ({
      top: Math.max(insets.top + 52, 64),
      right: 56,
      bottom: 72,
      left: 40,
    }),
    [insets.top]
  );
  const lastGeofenceModeRef = useRef<"none" | "pickup" | "drop">("none");
  const userDisabledFollowRef = useRef(false);

  useEffect(() => {
    setMapReady(false);
    const fallback = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(fallback);
  }, [order.orderId, rideInProgress]);

  useEffect(() => {
    if (pickupPoint) return;
    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
  }, [pickupPoint, order.orderId, queryClient]);

  useEffect(() => {
    lastFitKeyRef.current = "";
    lastGeofenceModeRef.current = "none";
    userDisabledFollowRef.current = false;
  }, [rideInProgress, order.orderId]);

  const fallbackDistanceTarget = rideInProgress ? dropPoint : pickupPoint;
  const fallbackDistance = fallbackDistanceTarget
    ? formatRiderDistanceToPickup(
        riderPos?.latitude,
        riderPos?.longitude,
        fallbackDistanceTarget.latitude,
        fallbackDistanceTarget.longitude
      )
    : null;
  const distanceLabel =
    formatRouteDistanceMeters(distanceM) ??
    (fallbackDistance ? fallbackDistance.replace(" away", "") : null);

  const tripEtaMinutes = fallbackDistanceTarget
    ? resolveRideLegEtaMinutes({
        rideInProgress,
        routeEtaMinutes,
        routeDistanceM: distanceM,
        serverEtaMinutes: etaMinutes,
        riderLat: riderPos?.latitude,
        riderLng: riderPos?.longitude,
        destLat: fallbackDistanceTarget.latitude,
        destLng: fallbackDistanceTarget.longitude,
      })
    : null;

  const riderHeading = useMemo(() => {
    if (tracking?.rider?.headingDegrees != null && Number.isFinite(tracking.rider.headingDegrees)) {
      return tracking.rider.headingDegrees;
    }
    if (riderPos && routeCoordinates.length >= 2) {
      return bearingDegrees(riderPos, routeCoordinates[1]!);
    }
    if (riderPos && routeDestination) {
      return bearingDegrees(riderPos, routeDestination);
    }
    return null;
  }, [tracking?.rider?.headingDegrees, riderPos, routeCoordinates, routeDestination]);

  const riderGpsFix = useMemo(() => {
    if (!riderPos) return undefined;
    return {
      lat: riderPos.latitude,
      lng: riderPos.longitude,
      headingDeg: riderHeading ?? undefined,
      speedMps: tracking?.rider?.speedMps ?? undefined,
    };
  }, [
    riderPos?.latitude,
    riderPos?.longitude,
    riderHeading,
    tracking?.rider?.speedMps,
  ]);

  const smoothedRider = useSmoothedRiderPosition(
    riderGpsFix,
    resolveSmoothDurationMs(tracking?.rider?.speedMps)
  );

  const mapRiderPos = useMemo(() => {
    if (!smoothedRider) return riderPos;
    return { latitude: smoothedRider.lat, longitude: smoothedRider.lng };
  }, [smoothedRider, riderPos]);
  const mapRiderHeading = smoothedRider?.headingDeg ?? riderHeading;

  const captainArrived =
    !rideInProgress &&
    !!order.riderReachedPickupAt &&
    !(liveRideStatus?.rideStarted ?? order.rideStarted);
  const highlightPickupZone =
    !rideInProgress &&
    shouldHighlightFoodPickupZone({
      status: orderStatus,
      riderReachedPickupAt: order.riderReachedPickupAt,
      riderLat: riderPos?.latitude ?? null,
      riderLng: riderPos?.longitude ?? null,
      pickupLat: pickupPoint?.latitude ?? 0,
      pickupLng: pickupPoint?.longitude ?? 0,
    });
  const highlightDropZone =
    rideInProgress &&
    !!dropPoint &&
    shouldHighlightRideDropZone({
      status: orderStatus,
      riderLat: riderPos?.latitude ?? null,
      riderLng: riderPos?.longitude ?? null,
      dropLat: dropPoint.latitude,
      dropLng: dropPoint.longitude,
    });

  // Geofence camera: when captain enters pickup/drop radius, frame the full circle.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const mode: "none" | "pickup" | "drop" = highlightPickupZone
      ? "pickup"
      : highlightDropZone
        ? "drop"
        : "none";

    if (mode === "none") {
      if (lastGeofenceModeRef.current !== "none") {
        mapRef.current.clearGeofenceCamera?.();
        lastGeofenceModeRef.current = "none";
        lastFitKeyRef.current = "";
        if (!userDisabledFollowRef.current) {
          mapRef.current.recenterOnRider?.();
        }
      }
      return;
    }

    const center = mode === "pickup" ? pickupPoint : dropPoint;
    if (!center) return;

    const entered = lastGeofenceModeRef.current !== mode;
    if (!entered && userDisabledFollowRef.current) return;
    lastGeofenceModeRef.current = mode;

    mapRef.current.fitToGeofence?.(center, FOOD_DELIVERY_GEOFENCE_RADIUS_M, {
      edgePadding: mapEdgePadding,
      animated: true,
      maxZoom: 16.2,
      force: entered,
    });
  }, [
    mapReady,
    highlightPickupZone,
    highlightDropZone,
    pickupPoint,
    dropPoint,
    mapEdgePadding,
  ]);

  // Normal tracking fit — skipped while geofence framing is active.
  useEffect(() => {
    if (rideInProgress || !mapReady || !mapRef.current || !pickupPoint) return;
    if (highlightPickupZone || highlightDropZone) return;

    const fitPoints: MapLatLng[] = [...displayRouteCoordinates];
    if (riderPos) fitPoints.push(riderPos);
    fitPoints.push(pickupPoint);

    if (fitPoints.length === 1) {
      mapRef.current.fitToCoordinates([pickupPoint], {
        edgePadding: mapEdgePadding,
        maxZoom: 15,
      });
      return;
    }
    if (fitPoints.length < 2) return;

    const fitKey = [
      riderPos?.latitude?.toFixed(4),
      riderPos?.longitude?.toFixed(4),
      displayRouteCoordinates.length,
      displayRouteCoordinates[0]?.latitude?.toFixed(4),
      displayRouteCoordinates[displayRouteCoordinates.length - 1]?.latitude?.toFixed(4),
    ].join("|");

    if (fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;

    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: mapEdgePadding,
      animated: true,
    });
  }, [
    mapReady,
    displayRouteCoordinates,
    riderPos,
    pickupPoint,
    rideInProgress,
    mapEdgePadding,
    highlightPickupZone,
    highlightDropZone,
  ]);

  const bannerText = rideInProgress
    ? highlightDropZone
      ? isParcel
        ? "Almost at drop — share delivery OTP"
        : "Almost at your destination"
      : isParcel
        ? "Parcel on the way to drop"
        : "Heading to your destination"
    : pickupWaitActive
      ? isParcel
        ? "Captain arrived — share pickup PIN"
        : "Your captain has arrived — share OTP to start"
      : captainArrived
        ? "Your captain has arrived"
        : isParcel
          ? "Captain is heading to pickup"
          : "Walk to your pickup-point";

  const waitBannerText = pickupWaitActive
    ? buildRidePickupWaitCustomerBanner(rideWaitFields, waitTick)
    : null;
  const waitBannerFontSize = useMemo(
    () => (waitBannerText ? fitRideWaitBannerFontSize(waitBannerText, SCREEN_W) : 11),
    [waitBannerText]
  );
  const waitFreeRemainingSec = pickupWaitActive
    ? resolveRidePickupFreeRemainingSeconds(rideWaitFields, waitTick)
    : 0;
  const waitElapsedSec = pickupWaitActive
    ? resolveRidePickupWaitElapsedSeconds(rideWaitFields, waitTick)
    : 0;

  const finalizedPickupWaitSec = useMemo(() => {
    if (pickupWaitActive) return waitElapsedSec;
    const storedSec = liveRideStatus?.pickupWaitSeconds;
    if (storedSec != null && Number.isFinite(storedSec)) {
      return Math.max(0, Math.floor(storedSec));
    }
    const verifiedAt = liveRideStatus?.pickupOtpVerifiedAt ?? order.pickupOtpVerifiedAt;
    const reachedAt = rideWaitFields.riderReachedPickupAt;
    if (verifiedAt && reachedAt) {
      const endMs = new Date(verifiedAt).getTime();
      return resolveRidePickupWaitElapsedSeconds(
        { ...rideWaitFields, pickupWaitSeconds: null },
        endMs
      );
    }
    return 0;
  }, [
    pickupWaitActive,
    waitElapsedSec,
    liveRideStatus?.pickupWaitSeconds,
    liveRideStatus?.pickupOtpVerifiedAt,
    order.pickupOtpVerifiedAt,
    rideWaitFields,
  ]);

  const showPickupWaitAside =
    finalizedPickupWaitSec > 0 && (pickupWaitActive || rideInProgress);

  const tripFareBreakdown = useMemo(
    () =>
      buildActiveRideTripFareBreakdown({
        order,
        liveEstimatedFare: liveRideStatus?.estimatedFare,
        serverWaitingCharge: liveRideStatus?.estimatedPickupWaitingCharge,
        waitingChargePerMin: liveRideStatus?.pickupWaitingChargePerMin,
        pickupWaitFields: {
          ...rideWaitFields,
          pickupOtpVerifiedAt:
            liveRideStatus?.pickupOtpVerifiedAt ?? order.pickupOtpVerifiedAt ?? null,
        },
        finalizedPickupWaitSec,
        pickupWaitActive,
        nowMs: pickupWaitActive ? waitTick : Date.now(),
      }),
    [
      order,
      rideWaitFields,
      finalizedPickupWaitSec,
      liveRideStatus?.estimatedFare,
      liveRideStatus?.estimatedPickupWaitingCharge,
      liveRideStatus?.pickupWaitingChargePerMin,
      liveRideStatus?.pickupOtpVerifiedAt,
      order.pickupOtpVerifiedAt,
      pickupWaitActive,
      waitTick,
    ]
  );

  const riderName = captain?.name?.trim() || "Captain";
  const riderFirstName = riderName.split(" ")[0]?.toUpperCase() ?? riderName.toUpperCase();
  const photoUri = toAbsoluteImageUrl(captain?.photoUrl);
  const vehicleReg = captain?.vehicleRegistration?.trim().toUpperCase();
  const vehicleModel = captain?.vehicleModel?.trim().toUpperCase();
  const riderRating = captain?.rating;
  const pickupAddress = order.merchantAddress?.trim() || "Pickup location";
  const dropAddress = order.deliveryAddress?.trim() || "Drop location";

  const handleShare = useCallback(() => {
    setShareSheetVisible(true);
  }, []);
  const closeShareSheet = useCallback(() => setShareSheetVisible(false), []);
  const closeTripDetails = useCallback(() => setTripDetailsVisible(false), []);

  const closeCancelFlow = useCallback(() => {
    setCancelFlowStep(null);
    setSelectedCancelReason(null);
    setCancelLoading(false);
  }, []);

  const openCancelFlow = useCallback(() => {
    setTripDetailsVisible(false);
    setCancelFlowStep("reason");
  }, []);

  const executeCancelRide = useCallback(async () => {
    if (cancelLoading) return;
    const reason = selectedCancelReason;
    setCancelLoading(true);
    setTripDetailsVisible(false);
    setCancelFlowStep(null);
    setSelectedCancelReason(null);
    purgeRideOrderFromClientCaches(queryClient, order.orderId);
    try {
      if (isParcelOrder(order)) {
        await cancelParcelOrder(order.orderId, {
          reasonCode: reason?.id ?? "CUSTOMER_CANCELLED",
          reasonText: reason?.label ?? "Customer cancelled after captain assigned",
          cancelMode: "manual",
        });
      } else {
        await cancelRideOrder(order.orderId, {
          reasonCode: reason?.id ?? "CUSTOMER_CANCELLED",
          reasonText: reason?.label ?? "Customer cancelled after captain assigned",
          cancelMode: "manual",
        });
      }
    } catch {
      /* best-effort */
    }
    void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    setCancelLoading(false);
    setCancelledAckVisible(true);
  }, [cancelLoading, order, queryClient, selectedCancelReason]);

  const handleCancelledAckDismiss = useCallback(() => {
    setCancelledAckVisible(false);
    onBack();
  }, [onBack]);
  const canCancelRide = !rideInProgress;

  const normalizeRiderPhone = useCallback(() => {
    const phone = captain?.phone?.replace(/\D/g, "");
    if (!phone) return null;
    return phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
  }, [captain?.phone]);

  const handleMessageRider = useCallback(() => {
    router.push({
      pathname: "/orders/partner-chat",
      params: {
        orderId: order.orderId,
        partnerName: order.rider?.name ?? "Mitra-Sathi",
        restaurantName: pickupAddress,
        partnerRole: "Mitra-Sathi",
        orderSubtitle: "Live ride trip",
        personRide: "1",
        ...(captain?.phone ? { partnerPhone: captain.phone } : {}),
        ...(order.rider?.photoUrl ? { partnerPhoto: order.rider.photoUrl } : {}),
      },
    });
  }, [router, order.orderId, order.rider, pickupAddress]);

  const handleCallRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Captain phone number is not available right now.");
      return;
    }
    Linking.openURL(`tel:${normalized}`).catch(() => {
      Alert.alert("Could not open dialer", "Please try again.");
    });
  }, [normalizeRiderPhone]);

  if (!pickupPoint) {
    return (
      <View style={[styles.screen, styles.mapLoading]}>
        <ActivityIndicator size="large" color={GREEN} />
        <AppText style={styles.loadingMapText}>Loading pickup location…</AppText>
      </View>
    );
  }

  // Memoize the map element so high-frequency, map-irrelevant re-renders of this screen
  // (the 1s pickup-wait `waitTick`, trip-details toggles, cancel-flow state, etc.) do
  // NOT re-render the map — which was the source of the ~1s map/details blink. The
  // element is rebuilt only when a real map input changes (center, route, rider/pickup/
  // drop position, heading, marker image, nav mode, highlight zones). The inline handlers
  // only call stable setters/refs, so they need no extra deps.
  const trackingMapElement = useMemo(
    () => (
      <MapboxWebRideTrackingMap
        key={`${order.orderId}-${rideInProgress ? "nav" : "pickup"}`}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        center={mapCenter}
        routeCoordinates={mapRouteCoordinates}
        riderPosition={mapRiderPos}
        riderHeading={mapRiderHeading}
        riderSpeedMps={tracking?.rider?.speedMps ?? null}
        pickupPosition={pickupPoint}
        dropPosition={dropPoint}
        navigationMode={rideInProgress}
        highlightPickupZone={highlightPickupZone}
        highlightDropZone={highlightDropZone}
        geofenceRadiusM={FOOD_DELIVERY_GEOFENCE_RADIUS_M}
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={() => setMapFrameTick((t) => t + 1)}
        onUserPan={() => {
          userDisabledFollowRef.current = true;
        }}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      order.orderId,
      rideInProgress,
      mapCenter,
      mapRouteCoordinates,
      mapRiderPos,
      mapRiderHeading,
      pickupPoint,
      dropPoint,
      highlightPickupZone,
      highlightDropZone,
      tracking?.rider?.speedMps,
    ]
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.mapSection, rideInProgress && styles.mapSectionNav, styles.mapSectionFlex]}>
        {trackingMapElement}
        {!mapReady ? (
          <View style={[StyleSheet.absoluteFillObject, styles.mapLoadingOverlay]}>
            <ActivityIndicator size="small" color={GREEN} />
          </View>
        ) : null}

        {!rideInProgress ? (
          <RideRouteMapPillOverlay
            mapRef={mapRef}
            pickupPoint={pickupPoint}
            dropPoint={null}
            pickupLabel="Pickup"
            dropLabel=""
            pickupBias="left"
            dropBias="right"
            syncToken={order.orderId.length + mapFrameTick}
            mapFrameTick={mapFrameTick}
            hidePickupPill={highlightPickupZone}
            onEditPickup={() => {}}
            onEditDrop={() => {}}
          />
        ) : null}

        {rideInProgress ? (
          <>
            <LinearGradient
              colors={["rgba(255,255,255,0.92)", "rgba(255,255,255,0)"]}
              style={styles.mapTopFade}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(248,250,252,0.88)", "#FFFFFF"]}
              style={styles.mapBottomFade}
              pointerEvents="none"
            />
            <View style={[styles.navChip, { top: insets.top + 2 }]}>
              <View style={styles.navChipInner}>
                <View style={styles.navChipIconWrap}>
                  <Ionicons name="navigate" size={15} color="#137333" />
                </View>
                <AppText style={styles.navChipEta}>{formatPickupEtaMinutes(tripEtaMinutes)}</AppText>
                {distanceLabel ? (
                  <>
                    <View style={styles.navChipDot} />
                    <AppText style={styles.navChipMeta}>{distanceLabel}</AppText>
                  </>
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        {waitBannerText ? (
          <View style={[styles.waitBannerFloat, { top: insets.top + 2 }]} pointerEvents="none">
            <View style={styles.waitBannerPill}>
              <AppText
                style={[
                  styles.waitBannerPillText,
                  { fontSize: waitBannerFontSize, lineHeight: waitBannerFontSize + 4 },
                  Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as object) : null,
                ]}
                numberOfLines={1}
                {...(Platform.OS === "android" ? { includeFontPadding: false } : {})}
              >
                {waitBannerText}
              </AppText>
            </View>
          </View>
        ) : null}

        <LiveTrackingStatusChip
          hasRiderFix={!!riderPos}
          style={[
            styles.liveStatusChip,
            {
              top: waitBannerText
                ? insets.top + 44
                : rideInProgress
                  ? insets.top + 44
                  : insets.top + 56,
            },
          ]}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: waitBannerText ? insets.top + 40 : insets.top + 8 }]}
          onPress={onBack}
          hitSlop={12}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={[styles.mapFabCol, rideInProgress && styles.mapFabColNav, { bottom: rideInProgress ? 14 : 20 }]}>
          <TouchableOpacity
            style={styles.mapFab}
            onPress={() => {
              userDisabledFollowRef.current = false;
              if (highlightPickupZone && pickupPoint) {
                mapRef.current?.fitToGeofence?.(pickupPoint, FOOD_DELIVERY_GEOFENCE_RADIUS_M, {
                  edgePadding: mapEdgePadding,
                  animated: true,
                  maxZoom: 16.2,
                  force: true,
                });
                return;
              }
              if (highlightDropZone && dropPoint) {
                mapRef.current?.fitToGeofence?.(dropPoint, FOOD_DELIVERY_GEOFENCE_RADIUS_M, {
                  edgePadding: mapEdgePadding,
                  animated: true,
                  maxZoom: 16.2,
                  force: true,
                });
                return;
              }
              mapRef.current?.clearGeofenceCamera?.();
              mapRef.current?.recenterOnRider?.();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="locate-outline" size={20} color={ACCENT_BLUE} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapFab} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-social-outline" size={20} color={ACCENT_BLUE} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.safetyFab} onPress={onOpenSupport} activeOpacity={0.85}>
            <Ionicons name="shield-checkmark" size={18} color={ACCENT_BLUE} />
            <AppText style={styles.safetyFabText}>Safety</AppText>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sheet}>
        {!rideInProgress ? (
          <View style={styles.sheetHandleWrap}>
            <View style={styles.sheetHandle} />
          </View>
        ) : null}

        <View style={styles.sheetBody}>
        {rideInProgress ? (
          <View style={styles.sheetMainContent}>
            <View style={[styles.banner, styles.bannerNav]}>
              <AppText style={styles.bannerText}>{bannerText}</AppText>
            </View>

            {!isParcel ? <RideInProgressNoticeCarousel rideType={rideCatalogId} /> : null}

            <View style={[styles.etaBlock, styles.etaBlockNav]}>
              <View style={styles.etaRowSplit}>
                <View style={styles.etaLeft}>
                  <AppText style={styles.etaTitle}>
                    Drop in{" "}
                    <AppText style={styles.etaHighlight}>{formatPickupEtaMinutes(tripEtaMinutes)}</AppText>
                  </AppText>
                  {distanceLabel ? (
                    <AppText style={styles.etaSub}>
                      Captain <AppText style={styles.etaSubBold}>{distanceLabel}</AppText> away
                    </AppText>
                  ) : (
                    <AppText style={styles.etaSub}>Captain is heading to drop</AppText>
                  )}
                </View>
                {showPickupWaitAside ? (
                  <View style={styles.pickupWaitAside}>
                    <AppText style={styles.pickupWaitLabel}>Pickup Waiting</AppText>
                    <AppText style={styles.pickupWaitTime}>
                      {formatRideWaitHhMmSs(finalizedPickupWaitSec)}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>

            {showDropOtp ? (
              <View style={styles.pinRow}>
                <AppText style={styles.pinLabel}>
                  Share delivery OTP with the captain
                </AppText>
                <View style={styles.pinBoxes}>
                  {dropPinDigits.map((digit, index) => (
                    <View key={`drop-pin-${index}`} style={styles.pinBox}>
                      <AppText style={styles.pinDigit}>{digit}</AppText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={[styles.captainCard, styles.captainCardNav]}>
              <View style={styles.captainTopRow}>
                <View style={styles.captainInfo}>
                  {vehicleReg ? (
                    <AppText style={styles.vehicleReg} numberOfLines={1}>
                      {vehicleReg}
                    </AppText>
                  ) : null}
                  {vehicleModel ? (
                    <AppText style={styles.vehicleModel} numberOfLines={1}>
                      {vehicleModel}
                    </AppText>
                  ) : null}
                  <AppText style={styles.captainName} numberOfLines={1}>
                    {riderName.toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.avatarWrap}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <AppText style={styles.avatarInitial}>{riderName.slice(0, 1).toUpperCase()}</AppText>
                    </View>
                  )}
                  {riderRating != null && Number.isFinite(riderRating) ? (
                    <View style={styles.ratingBadge}>
                      <AppText style={styles.ratingText}>{riderRating.toFixed(1)}</AppText>
                      <AppText style={styles.ratingStar}>★</AppText>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.contactRowCompact}>
                <TouchableOpacity
                  style={styles.compactContactBtn}
                  onPress={handleMessageRider}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#374151" />
                  <AppText style={styles.compactContactText} numberOfLines={1}>
                    Message {riderFirstName}
                  </AppText>
                  <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.compactUnreadBadge} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.compactCallBtn}
                  onPress={handleCallRider}
                  activeOpacity={0.85}
                  accessibilityLabel="Call captain"
                >
                  <Ionicons name="call" size={19} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.sheetMainContent}>
          <View style={styles.banner}>
            <AppText style={styles.bannerText}>{bannerText}</AppText>
          </View>

          <View style={styles.etaBlock}>
            {pickupWaitActive ? (
              <View style={styles.etaRowSplit}>
                <View style={styles.etaLeft}>
                  <AppText style={styles.etaTitle}>
                    Captain is waiting ·{" "}
                    <AppText style={styles.etaHighlight}>
                      {waitFreeRemainingSec > 0
                        ? `${formatRideWaitMmSs(waitFreeRemainingSec)} free left`
                        : formatRideWaitMmSs(waitElapsedSec)}
                    </AppText>
                  </AppText>
                  <AppText style={styles.etaSub}>
                    Share your pickup PIN with the captain
                    {isParcel ? " to collect the parcel" : " to start the ride"}
                  </AppText>
                </View>
                <View style={styles.pickupWaitAside}>
                  <AppText style={styles.pickupWaitLabel}>Pickup Waiting</AppText>
                  <AppText style={styles.pickupWaitTime}>
                    {formatRideWaitHhMmSs(finalizedPickupWaitSec)}
                  </AppText>
                </View>
              </View>
            ) : (
              <>
                <AppText style={styles.etaTitle}>
                  Pickup in{" "}
                  <AppText style={styles.etaHighlight}>{formatPickupEtaMinutes(tripEtaMinutes)}</AppText>
                </AppText>
                {distanceLabel ? (
                  <AppText style={styles.etaSub}>
                    Captain <AppText style={styles.etaSubBold}>{distanceLabel}</AppText> away
                  </AppText>
                ) : (
                  <AppText style={styles.etaSub}>
                    {riderPos ? "Captain is on the way" : "Waiting for captain location…"}
                  </AppText>
                )}
              </>
            )}
          </View>

          {showPickupPin ? (
            <View style={styles.pinRow}>
              <AppText style={styles.pinLabel}>
                {isParcel
                  ? "Share pickup PIN with the captain"
                  : "Start your order with PIN"}
              </AppText>
              <View style={styles.pinBoxes}>
                {pinDigits.map((digit, index) => (
                  <View key={`pin-${index}`} style={styles.pinBox}>
                    <AppText style={styles.pinDigit}>{digit}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.captainCard}>
            <View style={styles.captainTopRow}>
              <View style={styles.captainInfo}>
                {vehicleReg ? (
                  <AppText style={styles.vehicleReg} numberOfLines={1}>
                    {vehicleReg}
                  </AppText>
                ) : null}
                {vehicleModel ? (
                  <AppText style={styles.vehicleModel} numberOfLines={1}>
                    {vehicleModel}
                  </AppText>
                ) : null}
                <AppText style={styles.captainName} numberOfLines={1}>
                  {riderName.toUpperCase()}
                </AppText>
              </View>
              <View style={styles.avatarWrap}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <AppText style={styles.avatarInitial}>{riderName.slice(0, 1).toUpperCase()}</AppText>
                  </View>
                )}
                {riderRating != null && Number.isFinite(riderRating) ? (
                  <View style={styles.ratingBadge}>
                    <AppText style={styles.ratingText}>{riderRating.toFixed(1)}</AppText>
                    <AppText style={styles.ratingStar}>★</AppText>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.contactRow}>
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={handleMessageRider}
                activeOpacity={0.85}
              >
                <View style={styles.messageIconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color="#374151" />
                  <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.messageUnreadBadge} />
                </View>
                <AppText style={styles.messageBtnText} numberOfLines={1}>
                  {chatUnreadCount > 0 ? `Message ${riderFirstName} (${chatUnreadCount})` : `Message ${riderFirstName}`}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={handleCallRider}
                activeOpacity={0.85}
                accessibilityLabel="Call captain"
              >
                <Ionicons name="call" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>
          </View>
        )}

        <View style={[styles.footer, rideInProgress && styles.footerNav, { paddingBottom: footerBottomPad }]}>
          <View style={styles.footerTop}>
            <AppText style={styles.footerLabel}>
              {rideInProgress ? "Drop at" : "Pickup From"}
            </AppText>
            <AppText style={styles.footerAddress} numberOfLines={rideInProgress ? 1 : 2}>
              {rideInProgress ? dropAddress : pickupAddress}
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.tripDetailsBtn}
            onPress={() => setTripDetailsVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={16} color="#111827" />
            <AppText style={styles.tripDetailsText} numberOfLines={1}>
              Trip Details
            </AppText>
            <Ionicons name="chevron-forward" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
        </View>
      </View>

      <RideTripDetailsSheet
        visible={tripDetailsVisible}
        order={order}
        rideFare={tripFareBreakdown.rideFare}
        waitingCharge={tripFareBreakdown.waitingCharge}
        totalFare={tripFareBreakdown.totalFare}
        hasPickupWait={tripFareBreakdown.hasPickupWait}
        onClose={closeTripDetails}
        showCancelRide={canCancelRide}
        onCancelRide={canCancelRide ? openCancelFlow : undefined}
      />
      <RideCancelReasonSheet
        visible={cancelFlowStep === "reason"}
        onClose={closeCancelFlow}
        onSelectReason={(reason) => {
          setSelectedCancelReason(reason);
          setCancelFlowStep("confirm");
        }}
      />
      <RideCancelConfirmSheet
        visible={cancelFlowStep === "confirm"}
        loading={cancelLoading}
        heroImage={rideVehicleImage ?? undefined}
        message="Your captain may already be on the way. Cancelling now may apply fees depending on ride status."
        confirmLabel="Cancel my ride"
        keepLabel="Keep ride"
        onConfirm={() => void executeCancelRide()}
        onKeepSearching={closeCancelFlow}
        onClose={closeCancelFlow}
      />
      <RideCancelledAckSheet
        visible={cancelledAckVisible}
        onDismiss={handleCancelledAckDismiss}
      />
      <RideTripShareSheet
        visible={shareSheetVisible}
        orderId={order.orderId}
        onClose={closeShareSheet}
      />
    </View>
  );
}

const fabShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapSection: {
    width: "100%",
    backgroundColor: "#E8EDF2",
    overflow: "hidden",
  },
  mapSectionFlex: {
    flex: 1,
    minHeight: 160,
  },
  mapSectionNav: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: "#DCE6F0",
  },
  mapTopFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 72,
    zIndex: 3,
  },
  mapBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    zIndex: 3,
  },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  mapLoadingOverlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EDF2",
    zIndex: 2,
  },
  loadingMapText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  backBtn: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    ...fabShadow,
  },
  navChip: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 4,
    pointerEvents: "none",
  },
  navChipInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  navChipIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
  },
  navChipEta: {
    fontSize: 17,
    fontWeight: "800",
    color: "#137333",
    letterSpacing: -0.3,
  },
  navChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#9CA3AF",
  },
  navChipMeta: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  mapFabCol: {
    position: "absolute",
    right: 14,
    alignItems: "flex-end",
    gap: 10,
    zIndex: 4,
  },
  mapFabColNav: {
    right: 12,
    gap: 8,
  },
  mapFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...fabShadow,
  },
  safetyFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    ...fabShadow,
  },
  safetyFabText: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT_BLUE,
  },
  sheet: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -12,
    zIndex: 5,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  sheetBody: {
    flexGrow: 0,
    flexShrink: 0,
  },
  sheetMainContent: {
    flexGrow: 0,
    flexShrink: 0,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 0,
    backgroundColor: "#FFFFFF",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  banner: {
    backgroundColor: BANNER_NAVY,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bannerNav: {
    backgroundColor: "#137333",
    paddingVertical: 8,
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  waitBannerFloat: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 25,
    alignItems: "stretch",
  },
  liveStatusChip: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 24,
  },
  waitBannerPill: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FDE047",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#854D0E",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  waitBannerPillText: {
    color: "#854D0E",
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.1,
  },
  etaBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  etaBlockNav: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  etaRowSplit: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  etaLeft: {
    flex: 1,
    minWidth: 0,
  },
  pickupWaitAside: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 108,
    paddingTop: 2,
  },
  pickupWaitLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.1,
  },
  pickupWaitTime: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "800",
    color: "#854D0E",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  etaTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: -0.2,
  },
  etaHighlight: {
    color: GREEN,
    fontWeight: "800",
  },
  etaSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  etaSubBold: {
    fontWeight: "800",
    color: "#374151",
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 10,
  },
  pinLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 16,
  },
  pinBoxes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pinBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinDigit: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  captainCard: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
    padding: 11,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  captainCardNav: {
    marginTop: 6,
    marginBottom: 0,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  contactRowCompact: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactContactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    minHeight: 40,
    position: "relative",
  },
  compactContactText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  compactUnreadBadge: {
    position: "absolute",
    top: 4,
    left: 28,
  },
  compactCallBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  captainTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  captainInfo: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  vehicleReg: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.6,
  },
  vehicleModel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.2,
  },
  captainName: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.3,
  },
  contactRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  messageBtn: {
    flex: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    minHeight: 42,
  },
  messageIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  messageUnreadBadge: {
    position: "absolute",
    top: -6,
    right: -8,
  },
  messageBtnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  callBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    minHeight: 42,
  },
  avatarWrap: {
    width: 62,
    alignItems: "center",
    position: "relative",
    paddingBottom: 6,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6B7280",
  },
  ratingBadge: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  ratingStar: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
  },
  footerNav: {
    paddingTop: 8,
    gap: 6,
    backgroundColor: "#FAFBFC",
  },
  footerTop: {
    gap: 2,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "none",
  },
  footerAddress: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 18,
  },
  tripDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignSelf: "stretch",
    minHeight: 44,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  tripDetailsText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    includeFontPadding: false,
  },
});
