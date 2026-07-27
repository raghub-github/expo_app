// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ActiveRideNavigationMap,
  type ActiveRideNavigationMapHandle,
  type MapEdgeInsets,
} from "@/src/components/orders/ActiveRideNavigationMap";
import { PersonRideNavigateBottomSheet } from "@/src/components/orders/PersonRideNavigateBottomSheet";
import type { NavMapViewMode } from "@/src/lib/map-assets";
import {
  FoodNavigateBottomSheet,
  FOOD_NAV_SHEET_COLLAPSED_HEIGHT,
  FOOD_NAV_SHEET_HEIGHT,
} from "@/src/components/orders/FoodNavigateBottomSheet";
import {
  buildRidePickupWaitRiderLabel,
  isRidePickupWaitActive,
} from "@/src/lib/ride-pickup-wait";
import {
  PERSON_RIDE_NAV_SHEET_COLLAPSED_HEIGHT,
  PERSON_RIDE_NAV_SHEET_HEIGHT,
} from "@/src/components/orders/PersonRideNavigateBottomSheet";
import { buildNavMapEdgeInsets } from "@/src/lib/navigation-camera-fit";
import { openGoogleMapsNavigation } from "@/src/lib/open-google-maps-navigation";
import { FoodNavigationMapChrome } from "@/src/components/orders/FoodNavigationMapChrome";
import { FoodPickOrderSheet } from "@/src/components/orders/FoodPickOrderSheet";
import { FoodPickOrderDetailScreen } from "@/src/components/orders/FoodPickOrderDetailScreen";
import { FoodDropOrderScreen } from "@/src/components/orders/FoodDropOrderScreen";
import { CustomerCallBottomSheet } from "@/src/components/orders/CustomerCallBottomSheet";
import { RiderEmergencySosBottomSheet } from "@/src/components/orders/RiderEmergencySosBottomSheet";
import { CustomerCallConfirmModal } from "@/src/components/orders/CustomerCallConfirmModal";
import { RestaurantFeedbackBottomSheet } from "@/src/components/orders/RestaurantFeedbackBottomSheet";
import { CustomerFeedbackBottomSheet } from "@/src/components/orders/CustomerFeedbackBottomSheet";
import { FoodPickupVerificationScreen } from "@/src/components/orders/FoodPickupVerificationScreen";
import { FoodBarcodeScannerScreen } from "@/src/components/orders/FoodBarcodeScannerScreen";
import { PickupCameraPermissionSheet } from "@/src/components/orders/PickupCameraPermissionSheet";
import { readCameraPermission } from "@/src/lib/cameraPermission";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { createForegroundLocationTracker, type LocationTrackerState } from "@/src/services/location/locationTracker";
import {
  getNavigationRouteToPickup,
  latLngFromRider,
  type LatLng,
  type NavigationRoute,
} from "@/src/services/maps/directions.service";
import {
  useRideOrder,
  syncRiderOrderDetailCache,
  findRiderOrderInQueryCache,
  seedRiderOrderDetailCache,
  useReachedPickup,
  useSubmitMerchantPickupFeedback,
  useSubmitCustomerDeliveryFeedback,
  useReachedCustomer,
  useCancelAssignedRide,
  useVerifyPickupOtp,
  useVerifyPickupBarcode,
  useFoodPickupVerificationSettings,
  useMarkFoodPickup,
  useAcknowledgeFoodPickup,
  useStartRide,
  useCompleteRide,
  useVerifyDeliveryOtp,
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
} from "@/src/hooks/useOrders";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { riderApi } from "@/src/services/api/riderApi";
import { useQueryClient } from "@tanstack/react-query";
import { buildFoodDeliverySuccessParams } from "@/src/lib/food-delivery-success-nav";
import { buildRideDeliverySuccessParams } from "@/src/lib/ride-delivery-success-nav";
import { recordOrderTipBaseline } from "@/src/lib/rider-tip-celebration-storage";
import { isRideFarePaymentPending } from "@/src/lib/ride-payment-wait";
import { useNavScreenBottomInset } from "@/src/hooks/useRiderBottomInset";
import { usePartnerChatUnread } from "@/src/hooks/usePartnerChatUnread";
import { useMilestoneGeoFence } from "@/src/hooks/useMilestoneGeoFence";
import { resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";
import { RiderRideCancelReasonSheet } from "@/src/components/orders/RiderRideCancelReasonSheet";
import { RiderCancelPenaltyConfirmSheet } from "@/src/components/orders/RiderCancelPenaltyConfirmSheet";
import { RiderCancelFailedSheet } from "@/src/components/orders/RiderCancelFailedSheet";
import { RiderCancelSuccessSheet } from "@/src/components/orders/RiderCancelSuccessSheet";
import { RiderAdminOrderCancelledSheet } from "@/src/components/orders/RiderAdminOrderCancelledSheet";
import { PickupUpdatedBanner } from "@/src/components/orders/PickupUpdatedBanner";
import { PickupOtpBottomSheet } from "@/src/components/orders/PickupOtpBottomSheet";
import {
  FoodDeliveryConfirmBottomSheet,
} from "@/src/components/orders/FoodDeliveryConfirmBottomSheet";
import { captureDeliveryProofPhoto } from "@/src/lib/capture-delivery-proof-photo";
import { buildOrderDeliveryProofKey, uploadToR2 } from "@/src/services/storage/cloudflareR2";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useSmoothedRiderPosition } from "@/src/hooks/useSmoothedRiderPosition";
import { extractApiErrorMessage, isOrderFetchNotFoundError } from "@/src/services/http";
import {
  isRiderOrderCancelled,
  resolveRiderCancellationPenaltyAmount,
} from "@/src/lib/rider-order-cancelled";
import {
  splitRouteProgress,
  etaMinutesFromMeters,
  analyzeRiderOnRoute,
  buildRiderRouteConnectorGeoJson,
  OFF_ROUTE_REROUTE_M,
  resolveDisplayRiderPosition,
  rerouteDebounceMs,
} from "@/src/lib/navigation-route-progress";
import { trackDebug } from "@gatimitra/map-tracking-engine";
import {
  resolveCustomerDropPin,
  resolveRestaurantPickupPin,
  resolveRidePickupPin,
} from "@/src/lib/order-map-coordinates";

type Props = {
  orderId: string;
  mode?: "ride" | "food";
};

type DeliveryProofState = {
  localUri: string;
  uploaded?: { proxyUrl: string; key: string };
};

function isDeliveryProofUploaded(
  proof: DeliveryProofState | null | undefined
): proof is DeliveryProofState & { uploaded: { proxyUrl: string; key: string } } {
  return Boolean(proof?.localUri && proof.uploaded?.proxyUrl && proof.uploaded?.key);
}

function compactAddress(raw: string): { line1: string; landmark?: string } {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) {
    return { line1: parts.join(", ") || raw };
  }
  return {
    line1: parts.slice(0, 2).join(", "),
    landmark: parts.slice(2).join(", "),
  };
}

export function ActiveRideNavigationScreen({ orderId, mode = "ride" }: Props) {
  const isFoodOrder = mode === "food";
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ActiveRideNavigationMapHandle>(null);
  const tracker = useMemo(
    () =>
      createForegroundLocationTracker({
        timeIntervalMs: 800,
        distanceIntervalM: 2,
        minAccuracyM: 80,
        profileId: "active-nav",
      }),
    []
  );
  const [trackerState, setTrackerState] = useState<LocationTrackerState>(tracker.getState());
  const stickyFixRef = useRef<NonNullable<Extract<LocationTrackerState, { status: "tracking" }>["lastFix"]> | undefined>(
    undefined
  );
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  // Start false so cached order UI paints immediately; fetch flips this when needed.
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const lastRouteFromRef = useRef<string | null>(null);
  const lastPickupKeyRef = useRef<string | null>(null);
  const routeFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offRouteRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadRouteRef = useRef(false);
  const [previousPickup, setPreviousPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupBannerVisible, setPickupBannerVisible] = useState(false);
  const [pickupBannerMessage, setPickupBannerMessage] = useState<string | undefined>(
    undefined
  );
  const [cameraFitTrigger, setCameraFitTrigger] = useState(0);
  const [mapFollowEnabled, setMapFollowEnabled] = useState(true);
  const [mapViewMode, setMapViewMode] = useState<NavMapViewMode>("street");
  const initialNavCamDoneRef = useRef(false);
  const userControllingMapRef = useRef(false);
  const autoFollowResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: order, isLoading, isError, error, isFetching } = useRideOrder(orderId, {
    refetchInterval: isFoodOrder ? 5000 : 8000,
  });
  const { data: chatUnread } = usePartnerChatUnread(orderId, Boolean(order));
  const chatUnreadCount = chatUnread?.unreadCount ?? 0;
  const reachedPickup = useReachedPickup();
  const submitMerchantFeedback = useSubmitMerchantPickupFeedback();
  const submitCustomerFeedback = useSubmitCustomerDeliveryFeedback();
  const reachedCustomer = useReachedCustomer();
  const cancelAssigned = useCancelAssignedRide();
  const verifyPickupOtp = useVerifyPickupOtp();
  const verifyPickupBarcode = useVerifyPickupBarcode();
  const markFoodPickup = useMarkFoodPickup();
  const acknowledgeFoodPickup = useAcknowledgeFoodPickup();
  const { data: pickupVerificationSettings } = useFoodPickupVerificationSettings();
  const startRide = useStartRide();
  const completeRide = useCompleteRide();
  const verifyDeliveryOtp = useVerifyDeliveryOtp();
  const queryClient = useQueryClient();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [penaltySheetOpen, setPenaltySheetOpen] = useState(false);
  const [cancelFailedMessage, setCancelFailedMessage] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<{
    reasonLabel: string;
    penaltyApplied: boolean;
    penaltyAmount: number;
  } | null>(null);
  const [pendingCancel, setPendingCancel] = useState<{ reasonCode: string; label: string } | null>(
    null
  );
  const [otpSheetOpen, setOtpSheetOpen] = useState(false);
  const [deliveryOtpSheetOpen, setDeliveryOtpSheetOpen] = useState(false);
  /** Delivery photo — uploaded to R2 before OTP sheet; reused on OTP retry. */
  const [deliveryProof, setDeliveryProof] = useState<DeliveryProofState | null>(null);
  const [deliveryPhotoUploading, setDeliveryPhotoUploading] = useState(false);
  const session = useSessionStore((s) => s.session);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [reachSliderPending, setReachSliderPending] = useState(false);
  const [rideStartedOptimistic, setRideStartedOptimistic] = useState(false);
  const [startRideSliderKey, setStartRideSliderKey] = useState(0);
  const [pickOrderSheetDismissed, setPickOrderSheetDismissed] = useState(false);
  const [pickOrderDetailOpen, setPickOrderDetailOpen] = useState(false);
  const [restaurantFeedbackOpen, setRestaurantFeedbackOpen] = useState(false);
  const [riderFoodPickupConfirmed, setRiderFoodPickupConfirmed] = useState(false);
  const [pickupVerificationOpen, setPickupVerificationOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [scannerCameraGranted, setScannerCameraGranted] = useState(false);
  const [pickupCameraSheetOpen, setPickupCameraSheetOpen] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const foodPickupOtpFromVerificationRef = useRef(false);
  const prevRiderMarkedPickupRef = useRef<boolean | null>(null);
  const prevReachSliderDoneRef = useRef(false);
  const [dropOrderScreenOpen, setDropOrderScreenOpen] = useState(false);
  const [customerCallConfirmOpen, setCustomerCallConfirmOpen] = useState(false);
  const [customerCallSheetOpen, setCustomerCallSheetOpen] = useState(false);
  const [customerFeedbackOpen, setCustomerFeedbackOpen] = useState(false);
  const [sosSheetOpen, setSosSheetOpen] = useState(false);
  const [navSheetExpanded, setNavSheetExpanded] = useState(true);
  const [adminCancelSheetOpen, setAdminCancelSheetOpen] = useState(false);
  const [adminCancelPenaltyAmount, setAdminCancelPenaltyAmount] = useState<number | null>(null);
  const [waitTick, setWaitTick] = useState(() => Date.now());
  const hadActiveOrderRef = useRef(false);
  const adminCancelHandledRef = useRef(false);

  useEffect(() => {
    setNavSheetExpanded(true);
  }, [orderId]);

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["rider", "emergency-contacts"],
      queryFn: () => riderApi.getEmergencyContacts(),
      staleTime: 5 * 60_000,
    });
  }, [queryClient]);
  const deliveredOrderForSuccessRef = useRef<RiderOrderSummary | null>(null);
  const prevOrderStatusRef = useRef<string | undefined>(undefined);
  const deliverySuccessHandledRef = useRef(false);
  useEffect(() => {
    deliverySuccessHandledRef.current = false;
    prevOrderStatusRef.current = undefined;
    hadActiveOrderRef.current = false;
    adminCancelHandledRef.current = false;
    setAdminCancelSheetOpen(false);
    setAdminCancelPenaltyAmount(null);
    setDeliveryProof(null);
    setDeliveryOtpSheetOpen(false);
    setDeliveryPhotoUploading(false);
    setOtpError(null);
    setRestaurantFeedbackOpen(false);
    setRiderFoodPickupConfirmed(false);
    prevRiderMarkedPickupRef.current = null;
    setReachSliderPending(false);
    setRideStartedOptimistic(false);
  }, [orderId]);

  useEffect(() => {
    const cached = findRiderOrderInQueryCache(queryClient, orderId);
    if (cached) {
      seedRiderOrderDetailCache(queryClient, cached, [orderId]);
    }
  }, [orderId, queryClient]);

  const handleAdminCancelDismiss = useCallback(() => {
    setAdminCancelSheetOpen(false);
    router.replace("/(tabs)/orders");
  }, []);

  useEffect(() => {
    if (order) {
      hadActiveOrderRef.current = true;
    }
  }, [order]);

  useEffect(() => {
    if (adminCancelHandledRef.current || isLoading) return;
    // Rider self-cancel already shows RiderCancelSuccessSheet — don't treat 404 as admin cancel.
    if (cancelSuccess) return;
    if (!hadActiveOrderRef.current && !order) return;

    const unassignedByAdmin = isError && isOrderFetchNotFoundError(error);
    const cancelledOnOrder = isRiderOrderCancelled(order);

    if (!unassignedByAdmin && !cancelledOnOrder) return;

    adminCancelHandledRef.current = true;
    void tracker.stop();
    setCancelSheetOpen(false);
    setPenaltySheetOpen(false);
    setPendingCancel(null);
    setPickOrderDetailOpen(false);
    setDropOrderScreenOpen(false);
    setPickupVerificationOpen(false);
    setBarcodeScannerOpen(false);
    setOtpSheetOpen(false);
    setDeliveryOtpSheetOpen(false);
    setAdminCancelPenaltyAmount(resolveRiderCancellationPenaltyAmount(order));
    setAdminCancelSheetOpen(true);
    void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
    queryClient.removeQueries({ queryKey: ["rider", "orders", "detail", orderId] });
  }, [
    cancelSuccess,
    error,
    isError,
    isLoading,
    order,
    orderId,
    queryClient,
    tracker,
  ]);

  useEffect(() => {
    if (!adminCancelSheetOpen) return;
    const penalty = resolveRiderCancellationPenaltyAmount(order);
    if (penalty != null) {
      setAdminCancelPenaltyAmount(penalty);
    }
  }, [
    adminCancelSheetOpen,
    order?.cancellationPenaltyAmount,
    order?.cancellationPenaltyApplied,
    order,
  ]);

  const sheetBottomInset = useNavScreenBottomInset();
  const liveFix = trackerState.status === "tracking" ? trackerState.lastFix : undefined;
  useEffect(() => {
    if (liveFix) stickyFixRef.current = liveFix;
  }, [liveFix]);
  const riderFix = liveFix ?? stickyFixRef.current;
  const smoothDurationMs = useMemo(() => {
    const speed = riderFix?.speedMps;
    if (speed == null || speed < 0.5) return 550;
    if (speed < 3) return 420;
    if (speed < 8) return 320;
    return 240;
  }, [riderFix?.speedMps]);

  const smoothedRider = useSmoothedRiderPosition(
    riderFix
      ? {
          lat: riderFix.lat,
          lng: riderFix.lng,
          headingDeg: riderFix.headingDeg,
          speedMps: riderFix.speedMps,
        }
      : undefined,
    smoothDurationMs
  );

  const riderLocation = smoothedRider
    ? { lat: smoothedRider.lat, lng: smoothedRider.lng, headingDeg: smoothedRider.headingDeg }
    : undefined;

  const { byMilestone: milestoneGeo } = useMilestoneGeoFence(
    orderId,
    riderLocation ? { lat: riderLocation.lat, lng: riderLocation.lng } : undefined
  );

  const riderForRoute = riderFix
    ? { lat: riderFix.lat, lng: riderFix.lng }
    : undefined;

  const pickup = order?.pickup;
  const delivery = order?.delivery;
  /** Server-driven: reach pickup completed for this assignment (never regress after restart). */
  const serverReachPickupCompleted = useMemo(() => {
    if (!order) return false;
    if (isFoodOrder) {
      return !!(
        order.atPickup ||
        order.pickupWaitStartedAt ||
        order.rideStarted
      );
    }
    return !!(
      order.pickupOtpVerified ||
      order.pickupWaitStartedAt ||
      order.rideStarted
    );
  }, [order, isFoodOrder]);
  const reachSliderDone = serverReachPickupCompleted || reachSliderPending;
  const pickupConfirmed = isFoodOrder
    ? !!(order?.atPickup || (order?.pickupWaitStartedAt && !order?.rideStarted))
    : !!order?.pickupOtpVerified;
  const pickupOtpVerified = !!order?.pickupOtpVerified;

  const ridePickupWaitActive =
    !isFoodOrder &&
    isRidePickupWaitActive({
      pickupWaitStartedAt: order?.pickupWaitStartedAt,
      pickupOtpVerified: order?.pickupOtpVerified,
      pickupWaitFinalized: order?.pickupWaitFinalized,
    });

  useEffect(() => {
    if (!ridePickupWaitActive) return;
    const timer = setInterval(() => setWaitTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ridePickupWaitActive]);

  const rideWaitTimerLabel =
    order && ridePickupWaitActive
      ? buildRidePickupWaitRiderLabel(order, waitTick)
      : null;

  /** Backend scopes rideStarted to the active rider assignment (picked up), not order-level dispatch. */
  const rideStarted = !!order?.rideStarted || rideStartedOptimistic;

  useEffect(() => {
    if (order?.rideStarted) {
      setRideStartedOptimistic(false);
    }
  }, [order?.rideStarted]);
  /** Food: rider explicitly marked pickup (OTP/barcode/mark) — not merchant dispatch alone. */
  const riderMarkedFoodPickup =
    isFoodOrder &&
    (riderFoodPickupConfirmed ||
      (order?.pickupDurationSeconds != null &&
        Number.isFinite(Number(order.pickupDurationSeconds))));
  const showDropOnMap = rideStarted;
  const foodDeliveryActive = rideStarted;
  const atCustomer = !!order?.atCustomer;
  const orderDelivered = order?.status === "delivered";

  const showRestaurantFeedbackSheet =
    isFoodOrder &&
    restaurantFeedbackOpen &&
    riderMarkedFoodPickup &&
    order?.merchantFeedbackSubmitted !== true &&
    !orderDelivered &&
    !isLoading;

  const showFoodPickOrderSheet =
    isFoodOrder &&
    reachSliderDone &&
    !order?.pickupAcknowledged &&
    !pickOrderSheetDismissed &&
    !pickOrderDetailOpen &&
    !foodDeliveryActive &&
    !orderDelivered &&
    !otpSheetOpen &&
    !showRestaurantFeedbackSheet &&
    !pickupVerificationOpen &&
    !barcodeScannerOpen;

  useEffect(() => {
    if (!isFoodOrder || foodDeliveryActive || orderDelivered) {
      prevReachSliderDoneRef.current = reachSliderDone;
      return;
    }
    if (reachSliderDone && !prevReachSliderDoneRef.current) {
      if (!order?.pickupAcknowledged) {
        setPickOrderSheetDismissed(false);
      }
    }
    prevReachSliderDoneRef.current = reachSliderDone;
  }, [isFoodOrder, reachSliderDone, foodDeliveryActive, orderDelivered, order?.pickupAcknowledged]);

  useEffect(() => {
    if (foodDeliveryActive || otpSheetOpen) {
      setPickOrderDetailOpen(false);
    }
  }, [foodDeliveryActive, otpSheetOpen]);

  useEffect(() => {
    if (!isFoodOrder) return;
    if (atCustomer && !orderDelivered) {
      setDropOrderScreenOpen(true);
    }
    if (orderDelivered) {
      setDropOrderScreenOpen(false);
    }
  }, [isFoodOrder, atCustomer, orderDelivered]);

  useEffect(() => {
    if (isFoodOrder && order?.pickupDurationSeconds != null) {
      setRiderFoodPickupConfirmed(true);
      prevRiderMarkedPickupRef.current = true;
    }
  }, [isFoodOrder, order?.pickupDurationSeconds]);

  useEffect(() => {
    if (!isFoodOrder || !order || orderDelivered || isLoading) return;
    if (order.merchantFeedbackSubmitted === true) {
      setRestaurantFeedbackOpen(false);
      prevRiderMarkedPickupRef.current = riderMarkedFoodPickup;
      return;
    }
    if (!riderMarkedFoodPickup) {
      prevRiderMarkedPickupRef.current = false;
      return;
    }
    const prev = prevRiderMarkedPickupRef.current;
    prevRiderMarkedPickupRef.current = true;
    // Only auto-open when pickup is marked in this session (false → true), not on app restart.
    if (prev === false) {
      setRestaurantFeedbackOpen(true);
    }
  }, [isFoodOrder, order, riderMarkedFoodPickup, orderDelivered, isLoading]);

  useEffect(() => {
    if (isFoodOrder && restaurantFeedbackOpen && !riderMarkedFoodPickup) {
      setRestaurantFeedbackOpen(false);
    }
  }, [isFoodOrder, restaurantFeedbackOpen, riderMarkedFoodPickup]);

  useEffect(() => {
    if (isFoodOrder && reachSliderDone && order?.merchantOrderReady) {
      setPickOrderSheetDismissed(false);
    }
  }, [isFoodOrder, reachSliderDone, order?.merchantOrderReady]);

  const riderGps = useCallback(() => {
    const fix = trackerState.status === "tracking" ? trackerState.lastFix : undefined;
    if (!fix) return undefined;
    return { lat: fix.lat, lng: fix.lng };
  }, [trackerState]);

  const customerDropPin = useMemo(() => resolveCustomerDropPin(order), [order]);
  const restaurantPickupPin = useMemo(() => resolveRestaurantPickupPin(order), [order]);
  const ridePickupPin = useMemo(() => resolveRidePickupPin(order), [order]);

  const navDestination = useMemo(() => {
    if (showDropOnMap) {
      const drop = customerDropPin;
      if (drop) {
        return {
          lat: drop.lat,
          lng: drop.lng,
          address: drop.address ?? delivery?.address ?? "",
          mapLabel: "Drop" as const,
        };
      }
      return null;
    }
    const pickupPin = isFoodOrder ? restaurantPickupPin : ridePickupPin;
    if (!pickupPin) return null;
    return {
      lat: pickupPin.lat,
      lng: pickupPin.lng,
      address: pickupPin.address ?? pickup?.address ?? "",
      mapLabel: "Pickup" as const,
    };
  }, [
    showDropOnMap,
    isFoodOrder,
    customerDropPin,
    restaurantPickupPin,
    ridePickupPin,
    delivery?.address,
    pickup?.address,
  ]);

  useEffect(() => tracker.subscribe(setTrackerState), [tracker]);
  useEffect(() => {
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void (async () => {
        await tracker.stop();
        await tracker.start();
      })();
    });
    return () => sub.remove();
  }, [tracker]);

  const fetchRoute = useCallback(
    async (force = false) => {
      const navRider = riderForRoute ?? riderLocation;
      if (!navRider || !navDestination) {
        // Keep prior polyline; wait for GPS — do not spin forever.
        if (!hadRouteRef.current) setRouteLoading(true);
        return;
      }

      const pickupLat = Number(navDestination.lat);
      const pickupLng = Number(navDestination.lng);
      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || (pickupLat === 0 && pickupLng === 0)) {
        setRoute(null);
        setRouteError(true);
        setRouteLoading(false);
        return;
      }

      const fromKey = `${pickupLat.toFixed(5)},${pickupLng.toFixed(5)}|${navRider.lat.toFixed(3)},${navRider.lng.toFixed(3)}`;
      if (!force && lastRouteFromRef.current === fromKey) return;

      const isInitialRoute = !route?.coordinates?.length;
      if (isInitialRoute) setRouteLoading(true);
      setRouteError(false);
      try {
        const result = await getNavigationRouteToPickup(
          latLngFromRider(navRider.lat, navRider.lng),
          latLngFromRider(pickupLat, pickupLng),
          order?.rideType
        );
        if (result) {
          setRoute(result);
          lastRouteFromRef.current = fromKey;
          trackDebug(force ? "rerouting_completed" : "route_generated", {
            orderId,
            points: result.coordinates?.length ?? 0,
            distanceKm: result.distanceKm,
            force,
          });
        } else {
          // Keep last good polyline so the map never blanks on a flaky Directions call.
          if (!hadRouteRef.current) setRoute(null);
          setRouteError(true);
        }
      } catch {
        if (!hadRouteRef.current) setRoute(null);
        setRouteError(true);
      } finally {
        setRouteLoading(false);
      }
    },
    [riderForRoute, riderLocation, navDestination, order?.rideType, route?.coordinates?.length, orderId]
  );

  useEffect(() => {
    if (!showDropOnMap) return;
    lastRouteFromRef.current = null;
    void fetchRoute(true);
  }, [showDropOnMap, delivery?.lat, delivery?.lng, fetchRoute]);

  useEffect(() => {
    const hasRoute = (route?.coordinates?.length ?? 0) > 0;
    if (hasRoute && !hadRouteRef.current) {
      hadRouteRef.current = true;
      setCameraFitTrigger((n) => n + 1);
    }
    if (!hasRoute) hadRouteRef.current = false;
  }, [route?.coordinates?.length]);

  useEffect(() => {
    if (!navDestination?.lat || !navDestination?.lng) return;
    const pickupKey = `${navDestination.lat.toFixed(5)},${navDestination.lng.toFixed(5)}`;
    const prev = lastPickupKeyRef.current;
    if (prev && prev !== pickupKey) {
      setPreviousPickup(() => {
        const [lat, lng] = prev.split(",").map(Number);
        return { lat, lng };
      });
      setPickupBannerMessage(
        t("orders.activeFood.pickupLocationUpdated", "Pickup location updated")
      );
      setPickupBannerVisible(true);
      lastRouteFromRef.current = null;
      setCameraFitTrigger((n) => n + 1);
      void fetchRoute(true);
    }
    lastPickupKeyRef.current = pickupKey;
  }, [navDestination?.lat, navDestination?.lng, fetchRoute, t]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination) return;
    if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);
    routeFetchTimerRef.current = setTimeout(() => {
      void fetchRoute();
    }, 300);
    return () => {
      if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);
    };
  }, [navDestination?.lat, navDestination?.lng, fetchRoute]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination || route?.coordinates?.length) return;
    void fetchRoute();
  }, [
    riderForRoute?.lat,
    riderForRoute?.lng,
    navDestination?.lat,
    navDestination?.lng,
    route?.coordinates?.length,
    fetchRoute,
  ]);

  const routeDeviation = useMemo(() => {
    if (!route?.coordinates?.length || !riderLocation) return null;
    return analyzeRiderOnRoute(route.coordinates, {
      latitude: riderLocation.lat,
      longitude: riderLocation.lng,
      headingDeg: riderLocation.headingDeg,
    });
  }, [route?.coordinates, riderLocation?.lat, riderLocation?.lng, riderLocation?.headingDeg]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination || !route?.coordinates?.length) return;

    const deviation = analyzeRiderOnRoute(route.coordinates, {
      latitude: navRider.lat,
      longitude: navRider.lng,
      headingDeg: riderLocation?.headingDeg,
    });
    if (!deviation) return;

    const shouldReroute =
      deviation.shouldReroute === true ||
      deviation.offRouteM > OFF_ROUTE_REROUTE_M ||
      (deviation.wrongWay && deviation.offRouteM > 12);

    if (!shouldReroute) return;

    trackDebug("off_route_detected", {
      orderId,
      offRouteM: Math.round(deviation.offRouteM),
      wrongWay: deviation.wrongWay,
    });

    lastRouteFromRef.current = null;
    if (offRouteRefetchTimerRef.current) clearTimeout(offRouteRefetchTimerRef.current);
    const debounceMs = rerouteDebounceMs(deviation);
    trackDebug("rerouting_started", { orderId, debounceMs });
    offRouteRefetchTimerRef.current = setTimeout(() => {
      void fetchRoute(true);
    }, debounceMs);

    return () => {
      if (offRouteRefetchTimerRef.current) clearTimeout(offRouteRefetchTimerRef.current);
    };
  }, [
    riderForRoute?.lat,
    riderForRoute?.lng,
    riderLocation?.lat,
    riderLocation?.lng,
    riderLocation?.headingDeg,
    navDestination,
    route?.coordinates,
    fetchRoute,
    orderId,
  ]);

  const routeProgress = useMemo(() => {
    const navRider = riderLocation ?? riderForRoute;
    if (!route?.coordinates?.length || !navRider) {
      return {
        traveled: [] as LatLng[],
        remaining: route?.coordinates ?? [],
        remainingDistanceM: (route?.distanceKm ?? 0) * 1000,
        frontWheel: undefined as LatLng | undefined,
        routeJoinPoint: undefined as LatLng | undefined,
      };
    }
    const split = splitRouteProgress(route.coordinates, {
      latitude: navRider.lat,
      longitude: navRider.lng,
      headingDeg: riderLocation?.headingDeg,
    });
    return {
      traveled: split.traveled,
      remaining: split.remaining,
      remainingDistanceM: split.remainingDistanceM,
      frontWheel: split.frontWheel,
      routeJoinPoint: split.routeJoinPoint,
    };
  }, [route?.coordinates, route?.distanceKm, riderForRoute, riderLocation]);

  const riderRouteConnectorGeoJson = useMemo(() => {
    const join = routeProgress.routeJoinPoint;
    const pos = riderLocation ?? riderForRoute;
    if (!join || !pos) return null;
    return buildRiderRouteConnectorGeoJson(
      { latitude: pos.lat, longitude: pos.lng },
      join
    );
  }, [
    routeProgress.routeJoinPoint,
    riderLocation?.lat,
    riderLocation?.lng,
    riderForRoute?.lat,
    riderForRoute?.lng,
  ]);

  const liveEtaMinutes = useMemo(
    () => etaMinutesFromMeters(routeProgress.remainingDistanceM),
    [routeProgress.remainingDistanceM]
  );

  const liveDistanceKm = useMemo(
    () => Math.max(0.1, routeProgress.remainingDistanceM / 1000),
    [routeProgress.remainingDistanceM]
  );

  const metersToPickup = useMemo(() => {
    if (!riderLocation || !navDestination) return null;
    return Math.round(routeProgress.remainingDistanceM);
  }, [riderLocation, navDestination, routeProgress.remainingDistanceM]);

  const mapRiderLocation = useMemo(() => {
    const raw = riderLocation
      ? riderLocation
      : riderForRoute
        ? {
            lat: riderForRoute.lat,
            lng: riderForRoute.lng,
            headingDeg: riderFix?.headingDeg,
          }
        : undefined;
    if (!raw) return undefined;
    const coords = route?.coordinates;
    if (coords && coords.length >= 2) {
      const display = resolveDisplayRiderPosition(coords, {
        latitude: raw.lat,
        longitude: raw.lng,
        headingDeg: raw.headingDeg,
      });
      return { lat: display.latitude, lng: display.longitude, headingDeg: raw.headingDeg };
    }
    return raw;
  }, [riderLocation, riderForRoute, riderFix?.headingDeg, route?.coordinates]);

  const navigationFollowMode =
    !!mapRiderLocation && (route?.coordinates?.length ?? 0) >= 2;

  const mapNavigationFollowMode = navigationFollowMode && mapFollowEnabled;

  const handleUserMapGesture = useCallback(() => {
    userControllingMapRef.current = true;
    setMapFollowEnabled(false);
    trackDebug("camera_follow_disabled", { orderId, reason: "user_pan" });
  }, [orderId]);

  const releaseMapFollow = useCallback(() => {
    userControllingMapRef.current = true;
    setMapFollowEnabled(false);
  }, []);

  const handleMapRecenter = useCallback(() => {
    userControllingMapRef.current = false;
    setMapFollowEnabled(true);
    trackDebug("camera_follow_enabled", { orderId });
    mapRef.current?.recenter(true);
  }, [orderId]);

  const handleMapRouteOverview = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.showRouteOverview();
  }, [releaseMapFollow]);

  const handleToggleMapView = useCallback(() => {
    releaseMapFollow();
    setMapViewMode((m) => (m === "navigation" ? "street" : "navigation"));
  }, [releaseMapFollow]);

  const handleMapZoomIn = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.zoomIn();
  }, [releaseMapFollow]);

  const handleMapZoomOut = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.zoomOut();
  }, [releaseMapFollow]);

  useEffect(() => {
    if (!navigationFollowMode || !riderLocation) return;
    const speedMps = riderFix?.speedMps;
    if (speedMps == null || speedMps < 0.35) return;

    if (!userControllingMapRef.current) {
      setMapFollowEnabled(true);
      return;
    }

    if (autoFollowResumeTimerRef.current) clearTimeout(autoFollowResumeTimerRef.current);
    autoFollowResumeTimerRef.current = setTimeout(() => {
      const latestSpeed = trackerState.status === "tracking" ? trackerState.lastFix?.speedMps : null;
      if (latestSpeed != null && latestSpeed >= 0.35) {
        userControllingMapRef.current = false;
        setMapFollowEnabled(true);
        mapRef.current?.recenter(true);
      }
    }, 3500);

    return () => {
      if (autoFollowResumeTimerRef.current) clearTimeout(autoFollowResumeTimerRef.current);
    };
  }, [
    navigationFollowMode,
    riderLocation?.lat,
    riderLocation?.lng,
    riderFix?.speedMps,
    trackerState.status,
    riderFix?.speedMps,
  ]);

  const sheetTitle = useMemo(() => {
    if (isFoodOrder) {
      if (orderDelivered) {
        return t("orders.activeFood.orderDeliveredTitle", "Order delivered");
      }
      if (foodDeliveryActive) {
        if (atCustomer) {
          return t("orders.activeFood.atCustomerDeliver", "Complete delivery");
        }
        return t("orders.activeFood.deliveryInProgress", "Delivery in progress");
      }
      if (pickupConfirmed) {
        return t("orders.activeFood.atRestaurantPickup", "Mark pickup at restaurant");
      }
      return t("orders.activeFood.navigateRestaurant", "Navigate to restaurant");
    }
    if (orderDelivered) {
      return t("orders.activeRide.rideDeliveredTitle", "Ride completed");
    }
    if (rideStarted) {
      if (atCustomer) {
        return t("orders.activeRide.completeRideAtDrop", "Complete ride at drop");
      }
      return t("orders.activeRide.navigateDrop", "Navigate to drop");
    }
    if (reachSliderDone && !pickupOtpVerified) {
      return t("orders.activeRide.startRideTitle", "Start ride");
    }
    if (pickupOtpVerified) {
      return t("orders.activeRide.atPickupHeading", "You are at pickup");
    }
    return t("orders.activeRide.navigatePickup", "Navigate to pickup");
  }, [
    isFoodOrder,
    foodDeliveryActive,
    reachSliderDone,
    pickupOtpVerified,
    rideStarted,
    atCustomer,
    orderDelivered,
    pickupConfirmed,
    t,
  ]);

  const navHeaderTitle = useMemo(() => {
    const onDropLeg = isFoodOrder ? foodDeliveryActive : rideStarted;
    if (onDropLeg) {
      return t("orders.activeNav.reachDrop", "Reach drop");
    }
    return t("orders.activeNav.reachPickup", "Reach pickup");
  }, [isFoodOrder, foodDeliveryActive, rideStarted, t]);

  const hasCustomerCallablePhone = useMemo(() => {
    if (!order) return false;
    return Boolean(
      order.customerPhone?.trim() ||
        order.customerAlternatePhone?.trim() ||
        order.customerPrimaryPhone?.trim()
    );
  }, [order]);

  const handleCallCustomer = useCallback(() => {
    if (!hasCustomerCallablePhone) {
      Alert.alert(
        t("orders.activeRide.noPhoneTitle", "Phone unavailable"),
        t("orders.activeRide.noPhoneMessage", "Customer phone number is not available for this ride.")
      );
      return;
    }
    if (isFoodOrder) {
      setCustomerCallConfirmOpen(true);
      return;
    }
    const phone = order?.customerPhone?.trim();
    if (!phone) return;
    void Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert(
        t("orders.activeRide.callFailedTitle", "Could not call"),
        t("orders.activeRide.callFailedMessage", "Unable to open the phone dialer.")
      );
    });
  }, [hasCustomerCallablePhone, isFoodOrder, order?.customerPhone, t]);

  const handleConfirmCustomerCall = useCallback(() => {
    setCustomerCallConfirmOpen(false);
    setCustomerCallSheetOpen(true);
  }, []);

  const handleChatCustomer = useCallback(() => {
    if (!order) return;
    const orderLabel =
      isFoodOrder && order.merchantName?.trim()
        ? `${order.merchantName.trim()} order`
        : t("orders.partnerChat.rideTripLabel", "Live ride trip");
    const beforeReachPickup = !isFoodOrder && !atCustomer && !reachSliderDone;
    router.push({
      pathname: "/order-partner-chat/[orderId]",
      params: {
        orderId: order.id,
        customerName: order.customerName?.trim() || t("orders.partnerChat.customerFallback", "Customer"),
        orderLabel,
        ...(order.customerPhone?.trim() ? { customerPhone: order.customerPhone.trim() } : {}),
        ...(atCustomer ? { atDrop: "1" } : {}),
        ...(beforeReachPickup ? { atPickup: "1" } : {}),
      },
    });
  }, [order, isFoodOrder, atCustomer, reachSliderDone, t]);

  const handleReachedPickup = useCallback(() => {
    const gps = riderGps();
    reachedPickup.mutate(
      { orderId, ...gps },
      {
        onMutate: () => {
          setReachSliderPending(true);
        },
        onSuccess: () => {
          setReachSliderPending(false);
        },
        onError: (err) => {
          setReachSliderPending(false);
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeRide.updateFailedMessage", "Could not mark reached pickup. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedPickup, isFoodOrder, riderGps, t]);

  const handleReachStore = useCallback(() => {
    const gps = riderGps();
    reachedPickup.mutate(
      { orderId, ...gps },
      {
        onMutate: () => {
          setReachSliderPending(true);
        },
        onSuccess: () => {
          setReachSliderPending(false);
          setPickOrderSheetDismissed(false);
        },
        onError: (err) => {
          setReachSliderPending(false);
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.reachStoreFailed", "Could not mark reached store. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedPickup, riderGps, t]);

  const closeRestaurantFeedback = useCallback(() => {
    setRestaurantFeedbackOpen(false);
  }, []);

  const navigateToFoodDeliverySuccess = useCallback(
    (deliveredOrder: RiderOrderSummary) => {
      deliverySuccessHandledRef.current = true;
      void tracker.stop();
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
      void recordOrderTipBaseline(
        deliveredOrder.id,
        Math.round(Number(deliveredOrder.customerTipAmount) || 0),
        [deliveredOrder.formattedOrderId?.trim() ?? ""]
      );
      router.replace({
        pathname: "/food-delivery-success",
        params: buildFoodDeliverySuccessParams(deliveredOrder),
      });
    },
    [orderId, queryClient, tracker]
  );

  const navigateToRideSuccess = useCallback(
    (deliveredOrder: RiderOrderSummary) => {
      deliverySuccessHandledRef.current = true;
      void tracker.stop();
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
      void recordOrderTipBaseline(
        deliveredOrder.id,
        Math.round(Number(deliveredOrder.customerTipAmount) || 0),
        [deliveredOrder.formattedOrderId?.trim() ?? ""]
      );
      router.replace({
        pathname: "/ride-delivery-success",
        params: { ...buildRideDeliverySuccessParams(deliveredOrder), kind: "ride" },
      });
    },
    [orderId, queryClient, tracker]
  );

  const navigateToRidePaymentWaiting = useCallback(
    (deliveredOrder: RiderOrderSummary) => {
      deliverySuccessHandledRef.current = true;
      void tracker.stop();
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
      router.replace({
        pathname: "/ride-payment-waiting",
        params: {
          orderId: deliveredOrder.id,
          displayId: deliveredOrder.formattedOrderId?.trim() || deliveredOrder.id,
        },
      });
    },
    [orderId, queryClient, tracker]
  );

  const finishRideDeliveryFlow = useCallback(
    (deliveredOrder: RiderOrderSummary) => {
      if (isRideFarePaymentPending(deliveredOrder)) {
        navigateToRidePaymentWaiting(deliveredOrder);
      } else {
        navigateToRideSuccess(deliveredOrder);
      }
    },
    [navigateToRidePaymentWaiting, navigateToRideSuccess]
  );

  useEffect(() => {
    if (!order) return;

    const status = order.status;
    const prevStatus = prevOrderStatusRef.current;

    if (status !== "delivered") {
      prevOrderStatusRef.current = status;
      return;
    }

    if (deliverySuccessHandledRef.current || customerFeedbackOpen) {
      prevOrderStatusRef.current = status;
      return;
    }

    const transitioned = prevStatus != null && prevStatus !== "delivered";
    const mountAlreadyDelivered = prevStatus === undefined;
    if (!transitioned && !mountAlreadyDelivered) {
      prevOrderStatusRef.current = status;
      return;
    }

    prevOrderStatusRef.current = status;
    deliverySuccessHandledRef.current = true;

    if (isFoodOrder) {
      if (order.customerFeedbackSubmitted === true) {
        navigateToFoodDeliverySuccess(order);
      } else {
        deliveredOrderForSuccessRef.current = order;
        setCustomerFeedbackOpen(true);
      }
      return;
    }

    void tracker.stop();
    void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
    finishRideDeliveryFlow(order);
  }, [
    order,
    order?.status,
    isFoodOrder,
    customerFeedbackOpen,
    navigateToFoodDeliverySuccess,
    finishRideDeliveryFlow,
    queryClient,
    tracker,
  ]);

  const finishCustomerFeedbackAndShowSuccess = useCallback(() => {
    const deliveredOrder = deliveredOrderForSuccessRef.current;
    setCustomerFeedbackOpen(false);
    deliveredOrderForSuccessRef.current = null;
    if (deliveredOrder) {
      navigateToFoodDeliverySuccess(deliveredOrder);
    } else {
      router.replace("/(tabs)/orders");
    }
  }, [navigateToFoodDeliverySuccess]);

  const closeCustomerFeedback = useCallback(() => {
    setCustomerFeedbackOpen(false);
    finishCustomerFeedbackAndShowSuccess();
  }, [finishCustomerFeedbackAndShowSuccess]);

  const handleRestaurantFeedbackSkip = useCallback(() => {
    submitMerchantFeedback.mutate(
      { orderId, skipped: true },
      {
        onSuccess: (data) => {
          syncRiderOrderDetailCache(queryClient, orderId, data);
          closeRestaurantFeedback();
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, submitMerchantFeedback, queryClient, closeRestaurantFeedback, t]);

  const handleRestaurantFeedbackSubmit = useCallback(
    (payload: { rating: number; tags: string[]; messages: string[] }) => {
      submitMerchantFeedback.mutate(
        {
          orderId,
          rating: payload.rating,
          tags: payload.tags,
          messages: payload.messages,
        },
        {
          onSuccess: (data) => {
            syncRiderOrderDetailCache(queryClient, orderId, data);
            closeRestaurantFeedback();
          },
          onError: (err) => {
            Alert.alert(
              t("orders.activeRide.updateFailedTitle", "Update failed"),
              extractApiErrorMessage(
                err,
                t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
              )
            );
          },
        }
      );
    },
    [orderId, submitMerchantFeedback, queryClient, closeRestaurantFeedback, t]
  );

  const handleCustomerFeedbackSkip = useCallback(() => {
    closeCustomerFeedback();
  }, [closeCustomerFeedback]);

  const handleCustomerFeedbackSubmit = useCallback(
    (payload: {
      rating: number;
      tags: string[];
      messages: string[];
      comment?: string;
    }) => {
      submitCustomerFeedback.mutate(
        {
          orderId,
          rating: payload.rating,
          tags: payload.tags,
          messages: payload.messages,
          comment: payload.comment,
        },
        {
          onSuccess: closeCustomerFeedback,
          onError: (err) => {
            Alert.alert(
              t("orders.activeRide.updateFailedTitle", "Update failed"),
              extractApiErrorMessage(
                err,
                t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
              )
            );
          },
        }
      );
    },
    [orderId, submitCustomerFeedback, closeCustomerFeedback, t]
  );

  const handlePickOrderConfirm = useCallback(() => {
    if (!order?.merchantOrderReady) return;
    void acknowledgeFoodPickup
      .mutateAsync(orderId)
      .then((data) => {
        syncRiderOrderDetailCache(queryClient, orderId, data);
        setPickOrderSheetDismissed(true);
        setPickOrderDetailOpen(true);
      })
      .catch((err) => {
        Alert.alert(
          t("orders.activeRide.updateFailedTitle", "Update failed"),
          extractApiErrorMessage(
            err,
            t("orders.activeFood.pickupAckFailed", "Could not confirm pickup. Try again.")
          )
        );
      });
  }, [order?.merchantOrderReady, acknowledgeFoodPickup, orderId, queryClient, t]);

  const openBarcodeScanner = useCallback(
    async (opts?: { cameraGranted?: boolean }) => {
      let granted = opts?.cameraGranted === true;
      if (!granted) {
        const permission = await readCameraPermission();
        granted = permission.granted;
      }
      if (!granted) {
        setPickupCameraSheetOpen(true);
        return;
      }
      setBarcodeError(null);
      setPickupVerificationOpen(false);
      setScannerCameraGranted(true);
      setBarcodeScannerOpen(true);
    },
    []
  );

  const handlePickupCameraGranted = useCallback(() => {
    setPickupCameraSheetOpen(false);
    setBarcodeError(null);
    setPickupVerificationOpen(false);
    setScannerCameraGranted(true);
    setBarcodeScannerOpen(true);
  }, []);

  const barcodeVerificationEnabled = pickupVerificationSettings?.barcodeEnabled !== false;
  const otpVerificationEnabled = pickupVerificationSettings?.otpEnabled !== false;
  const pickupVerificationRequired = pickupVerificationSettings?.verificationRequired !== false;

  const handleFoodPickupVerificationSuccess = useCallback(
    (data?: { merchantFeedbackSubmitted?: boolean }) => {
      setPickupVerificationOpen(false);
      setBarcodeScannerOpen(false);
      setBarcodeError(null);
      setOtpSheetOpen(false);
      foodPickupOtpFromVerificationRef.current = false;
      setPickOrderDetailOpen(false);
      setPickOrderSheetDismissed(true);
      setPickupBannerMessage(
        t(
          "orders.activeFood.pickupMarkedSuccess",
          "Order picked up — navigate to customer"
        )
      );
      setPickupBannerVisible(true);
      setCameraFitTrigger((n) => n + 1);
      setRiderFoodPickupConfirmed(true);
      if (data?.merchantFeedbackSubmitted !== true) {
        setRestaurantFeedbackOpen(true);
      }
    },
    [t]
  );

  const completeFoodPickupVerification = useCallback(
    (data: RiderOrderSummary) => {
      syncRiderOrderDetailCache(queryClient, orderId, data);
      handleFoodPickupVerificationSuccess(data);
    },
    [queryClient, orderId, handleFoodPickupVerificationSuccess]
  );

  const beginPickupFlow = useCallback(() => {
    if (!order?.merchantOrderReady) return;
    setPickOrderDetailOpen(false);
    setBarcodeError(null);

    if (!pickupVerificationRequired) {
      const gps = riderGps();
      void markFoodPickup
        .mutateAsync({ orderId, ...gps, deviceTimestamp: new Date().toISOString() })
        .then((data) => completeFoodPickupVerification(data))
        .catch((err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.pickupMarkFailed", "Could not mark order picked up. Try again.")
            )
          );
        });
      return;
    }

    if (barcodeVerificationEnabled && !otpVerificationEnabled) {
      void openBarcodeScanner();
      return;
    }

    if (!barcodeVerificationEnabled && otpVerificationEnabled) {
      foodPickupOtpFromVerificationRef.current = false;
      setOtpError(null);
      setOtpResetKey((k) => k + 1);
      setOtpSheetOpen(true);
      return;
    }

    setPickupVerificationOpen(true);
  }, [
    order?.merchantOrderReady,
    pickupVerificationRequired,
    barcodeVerificationEnabled,
    otpVerificationEnabled,
    riderGps,
    markFoodPickup,
    orderId,
    completeFoodPickupVerification,
    t,
    openBarcodeScanner,
  ]);

  const handlePickedOrderSlide = useCallback(() => {
    beginPickupFlow();
  }, [beginPickupFlow]);

  const handleMarkPickup = useCallback(() => {
    beginPickupFlow();
  }, [beginPickupFlow]);

  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      setBarcodeError(null);
      const gps = riderGps();
      void verifyPickupBarcode
        .mutateAsync({
          orderId,
          barcode,
          ...gps,
          deviceTimestamp: new Date().toISOString(),
        })
        .then((data) => completeFoodPickupVerification(data))
        .catch((err) => {
          setBarcodeError(
            extractApiErrorMessage(
              err,
              t(
                "orders.activeFood.barcodeVerifyFailed",
                "Barcode does not match this order. Try again or use OTP."
              )
            )
          );
        });
    },
    [orderId, riderGps, verifyPickupBarcode, completeFoodPickupVerification, t]
  );

  const handleReachCustomer = useCallback(() => {
    const gps = riderGps();
    reachedCustomer.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setDropOrderScreenOpen(true);
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              isFoodOrder
                ? t("orders.activeFood.reachCustomerFailed", "Could not mark reached customer. Try again.")
                : t("orders.activeRide.reachDropFailed", "Could not mark reached drop. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedCustomer, riderGps, isFoodOrder, t]);

  const handleCompleteRide = useCallback(() => {
    const gps = riderGps();
    completeRide.mutate(
      { orderId, ...gps },
      {
        onSuccess: (deliveredOrder) => {
          finishRideDeliveryFlow(deliveredOrder);
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeRide.completeRideFailed", "Could not complete ride. Try again.")
            )
          );
        },
      }
    );
  }, [completeRide, orderId, riderGps, finishRideDeliveryFlow, t]);

  const handleGoHomeAfterRide = useCallback(() => {
    if (order?.status === "delivered") {
      finishRideDeliveryFlow(order);
      return;
    }
    router.replace("/(tabs)/orders");
  }, [finishRideDeliveryFlow, order]);

  useEffect(() => {
    if (isFoodOrder || !order || order.status !== "delivered") return;
    if (deliverySuccessHandledRef.current) return;
    const timer = setTimeout(() => {
      if (deliverySuccessHandledRef.current) return;
      finishRideDeliveryFlow(order);
    }, 600);
    return () => clearTimeout(timer);
  }, [isFoodOrder, finishRideDeliveryFlow, order, order?.status]);

  const handleStartRide = useCallback(() => {
    if (isFoodOrder) return;
    const startGeo = resolveMilestoneGeoUi(milestoneGeo?.start_ride, "start_ride");
    if (startGeo.locked) {
      Alert.alert(
        t("orders.activeRide.geoBlockedTitle", "Too far from pickup"),
        startGeo.hintText ??
          t(
            "orders.activeRide.geoBlockedStartRide",
            "Move closer to the pickup point before starting the ride."
          )
      );
      setStartRideSliderKey((k) => k + 1);
      return;
    }
    setOtpError(null);
    setOtpResetKey((k) => k + 1);
    setOtpSheetOpen(true);
  }, [isFoodOrder, milestoneGeo?.start_ride, t]);

  const uploadDeliveryProof = useCallback(
    async (uri: string): Promise<boolean> => {
      const token = session?.accessToken;
      if (!token) {
        Alert.alert(
          t("orders.activeFood.uploadAuthError", "Session expired"),
          t("orders.activeFood.signInAgain", "Sign in again and retry delivery.")
        );
        return false;
      }

      setDeliveryPhotoUploading(true);
      try {
        const key = buildOrderDeliveryProofKey(orderId);
        const result = await uploadToR2(uri, "orders", token, key);
        setDeliveryProof({
          localUri: uri,
          uploaded: { proxyUrl: result.proxyUrl, key: result.key },
        });
        return true;
      } catch (err) {
        Alert.alert(
          t("orders.activeFood.uploadFailedTitle", "Upload failed"),
          err instanceof Error
            ? err.message
            : t(
                "orders.activeFood.uploadFailed",
                "Could not upload delivery photo. Slide again to retry."
              )
        );
        return false;
      } finally {
        setDeliveryPhotoUploading(false);
      }
    },
    [orderId, session?.accessToken, t]
  );

  const reopenDeliveryOtpSheet = useCallback(
    (opts?: { resetOtp?: boolean }) => {
      setOtpError(null);
      verifyDeliveryOtp.reset();
      if (opts?.resetOtp) {
        setOtpResetKey((k) => k + 1);
      }
      setDeliveryOtpSheetOpen(true);
    },
    [verifyDeliveryOtp]
  );

  const handleDelivered = useCallback(async () => {
    setOtpSheetOpen(false);

    if (isDeliveryProofUploaded(deliveryProof)) {
      reopenDeliveryOtpSheet();
      return;
    }

    if (deliveryProof?.localUri) {
      const uploaded = await uploadDeliveryProof(deliveryProof.localUri);
      if (uploaded) {
        reopenDeliveryOtpSheet({ resetOtp: true });
      }
      return;
    }

    setDeliveryProof(null);
    setDeliveryOtpSheetOpen(false);
    verifyDeliveryOtp.reset();

    try {
      const uri = await captureDeliveryProofPhoto(t);
      if (!uri) return;

      setDeliveryProof({ localUri: uri });
      const uploaded = await uploadDeliveryProof(uri);
      if (uploaded) {
        reopenDeliveryOtpSheet({ resetOtp: true });
      }
    } catch (err) {
      Alert.alert(
        t("orders.activeFood.captureFailedTitle", "Photo failed"),
        err instanceof Error
          ? err.message
          : t(
              "orders.activeFood.captureFailed",
              "Could not capture delivery photo. Slide again to retry."
            )
      );
    }
  }, [deliveryProof, reopenDeliveryOtpSheet, t, uploadDeliveryProof, verifyDeliveryOtp]);

  const handleDismissOtpSheet = useCallback(() => {
    if (verifyPickupOtp.isPending) return;
    if (!isFoodOrder && startRide.isPending) return;
    setOtpSheetOpen(false);

    if (isFoodOrder) {
      if (foodPickupOtpFromVerificationRef.current) {
        foodPickupOtpFromVerificationRef.current = false;
        setPickupVerificationOpen(true);
        return;
      }
      if (!pickupConfirmed && !foodDeliveryActive) {
        setReachSliderPending(false);
      }
      return;
    }

    if (reachSliderDone && !pickupOtpVerified) {
      setStartRideSliderKey((k) => k + 1);
      return;
    }
    if (!pickupConfirmed && !rideStarted) {
      setReachSliderPending(false);
    }
  }, [
    verifyPickupOtp.isPending,
    startRide.isPending,
    pickupConfirmed,
    pickupOtpVerified,
    rideStarted,
    isFoodOrder,
    foodDeliveryActive,
    reachSliderDone,
  ]);

  const handleCancelReason = useCallback(
    (reasonCode: string, label: string) => {
      setPendingCancel({ reasonCode, label });
      setCancelSheetOpen(false);
      setPenaltySheetOpen(true);
    },
    []
  );

  const handleProceedCancel = useCallback(() => {
    if (!pendingCancel || cancelAssigned.isPending) return;
    setCancelFailedMessage(null);
    const reasonLabel = pendingCancel.label;
    cancelAssigned.mutate(
      { orderId, reasonCode: pendingCancel.reasonCode, reasonText: pendingCancel.label },
      {
        onSuccess: (res) => {
          setPenaltySheetOpen(false);
          setPendingCancel(null);
          setCancelFailedMessage(null);
          setCancelSheetOpen(false);
          adminCancelHandledRef.current = true; // suppress admin-cancel 404 sheet
          void tracker.stop();
          setCancelSuccess({
            reasonLabel,
            penaltyApplied: Boolean(res.penaltyApplied),
            penaltyAmount: Number(res.penaltyAmount ?? 0),
          });
        },
        onError: (err) => {
          const fallback = isFoodOrder
            ? t(
                "orders.activeFood.cancelFailedMessage",
                "Please try again or contact support."
              )
            : t(
                "orders.activeRide.cancelFailedMessage",
                "Please try again or contact support."
              );
          setCancelFailedMessage(extractApiErrorMessage(err, fallback));
        },
      }
    );
  }, [cancelAssigned, orderId, pendingCancel, t, isFoodOrder, tracker]);

  const dismissCancelSuccess = useCallback(() => {
    setCancelSuccess(null);
    router.replace("/(tabs)/orders");
  }, []);

  const openLedgerAfterCancel = useCallback(() => {
    setCancelSuccess(null);
    router.replace("/(tabs)/ledger");
  }, []);

  const handleVerifyOtp = useCallback(
    (otp: string) => {
      if (verifyPickupOtp.isPending) return;
      if (otp.replace(/\D/g, "").length !== 4) return;
      setOtpError(null);
      const gps = riderGps();
      void verifyPickupOtp
        .mutateAsync({
          orderId,
          otp,
          ...gps,
          ...(isFoodOrder ? { deviceTimestamp: new Date().toISOString() } : {}),
        })
        .then((data) => {
          if (isFoodOrder) {
            completeFoodPickupVerification(data);
            return;
          }
          syncRiderOrderDetailCache(queryClient, orderId, data);
          setOtpSheetOpen(false);
          setRideStartedOptimistic(true);
          setCameraFitTrigger((n) => n + 1);
          const rideGps = riderGps();
          void startRide
            .mutateAsync({ orderId, ...rideGps })
            .then(() => {
              setPickupBannerMessage(
                t(
                  "orders.activeRide.rideStartedBanner",
                  "Ride started — navigate to drop location"
                )
              );
              setPickupBannerVisible(true);
              setCameraFitTrigger((n) => n + 1);
            })
            .catch((err) => {
              setRideStartedOptimistic(false);
              setStartRideSliderKey((k) => k + 1);
              Alert.alert(
                t("orders.activeRide.updateFailedTitle", "Update failed"),
                extractApiErrorMessage(
                  err,
                  t("orders.activeRide.startRideFailed", "Could not start ride. Try again.")
                )
              );
            });
        })
        .catch((err) => {
          verifyPickupOtp.reset();
          setOtpError(
            extractApiErrorMessage(
              err,
              isFoodOrder
                ? t(
                    "orders.activeFood.pickupOtpInvalid",
                    "OTP invalid hai. Restaurant se sahi pickup OTP le kar dubara enter karein."
                  )
                : t(
                    "orders.activeRide.pickupOtpInvalid",
                    "OTP invalid hai. Passenger se sahi OTP le kar dubara enter karein."
                  )
            )
          );
          setOtpResetKey((k) => k + 1);
        });
    },
    [
      verifyPickupOtp,
      orderId,
      riderGps,
      isFoodOrder,
      t,
      completeFoodPickupVerification,
      queryClient,
      startRide,
      riderGps,
    ]
  );

  const handleVerifyDeliveryOtp = useCallback(
    (otp: string) => {
      const uploaded = deliveryProof?.uploaded;
      if (!uploaded) {
        setOtpError(
          t(
            "orders.activeFood.uploadFailed",
            "Could not upload delivery photo. Close and slide deliver again."
          )
        );
        setOtpResetKey((k) => k + 1);
        return;
      }
      if (verifyDeliveryOtp.isPending) return;

      setOtpError(null);

      const gps = riderGps();
      verifyDeliveryOtp.mutate(
        {
          orderId,
          otp,
          ...gps,
          deliveryImageUrl: uploaded.proxyUrl,
          deliveryImageR2Key: uploaded.key,
        },
        {
          onSuccess: (deliveredOrder) => {
            deliverySuccessHandledRef.current = true;
            setDeliveryOtpSheetOpen(false);
            setDeliveryProof(null);
            setDropOrderScreenOpen(false);
            deliveredOrderForSuccessRef.current = deliveredOrder;
            queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
            if (deliveredOrder.customerFeedbackSubmitted === true) {
              navigateToFoodDeliverySuccess(deliveredOrder);
            } else {
              setCustomerFeedbackOpen(true);
            }
          },
          onError: (err) => {
            verifyDeliveryOtp.reset();
            setOtpError(
              extractApiErrorMessage(
                err,
                t(
                  "orders.activeFood.deliveryOtpInvalid",
                  "OTP invalid hai. Customer se sahi delivery OTP le kar dubara enter karein."
                )
              )
            );
            setOtpResetKey((k) => k + 1);
          },
        }
      );
    },
    [
      deliveryProof?.uploaded,
      verifyDeliveryOtp.isPending,
      orderId,
      verifyDeliveryOtp,
      riderGps,
      navigateToFoodDeliverySuccess,
      queryClient,
      t,
    ]
  );

  useEffect(() => {
    const deliveryLegActive = isFoodOrder ? foodDeliveryActive : rideStarted;
    if (!deliveryLegActive) return;
    if (verifyPickupOtp.isPending || verifyDeliveryOtp.isPending) return;
    if (otpSheetOpen || deliveryOtpSheetOpen) return;
    setOtpSheetOpen(false);
  }, [
    isFoodOrder,
    foodDeliveryActive,
    rideStarted,
    verifyPickupOtp.isPending,
    verifyDeliveryOtp.isPending,
    otpSheetOpen,
    deliveryOtpSheetOpen,
  ]);

  const navSheetHeight = useMemo(() => {
    if (isFoodOrder) {
      return navSheetExpanded ? FOOD_NAV_SHEET_HEIGHT : FOOD_NAV_SHEET_COLLAPSED_HEIGHT;
    }
    return navSheetExpanded
      ? PERSON_RIDE_NAV_SHEET_HEIGHT
      : PERSON_RIDE_NAV_SHEET_COLLAPSED_HEIGHT;
  }, [isFoodOrder, navSheetExpanded]);

  const speedKmh = useMemo(() => {
    const mps = riderFix?.speedMps;
    if (mps == null || !Number.isFinite(mps) || mps < 0) return null;
    return mps * 3.6;
  }, [riderFix?.speedMps]);

  const mapControlsBottom = navSheetHeight + Math.max(sheetBottomInset, 12) + 16;

  const mapEdgeInsets = useMemo<MapEdgeInsets>(
    () =>
      buildNavMapEdgeInsets({
        safeTop: insets.top,
        sheetOverlayHeight: navSheetHeight + Math.max(sheetBottomInset, 12),
        controlsReserve: 12,
      }),
    [insets.top, navSheetHeight, sheetBottomInset]
  );

  useEffect(() => {
    initialNavCamDoneRef.current = false;
    userControllingMapRef.current = false;
    setMapFollowEnabled(true);
  }, [navDestination?.lat, navDestination?.lng]);

  useEffect(() => {
    if (mapNavigationFollowMode || userControllingMapRef.current) return;
    setCameraFitTrigger((t) => t + 1);
  }, [route?.coordinates?.length, mapNavigationFollowMode]);

  useEffect(() => {
    if (!mapRiderLocation || !navDestination) return;
    if (userControllingMapRef.current) return;
    if (!initialNavCamDoneRef.current) {
      initialNavCamDoneRef.current = true;
      const t = setTimeout(() => {
        mapRef.current?.showRouteOverview();
        if (!userControllingMapRef.current) {
          setMapFollowEnabled(true);
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [
    mapRiderLocation?.lat,
    mapRiderLocation?.lng,
    navDestination?.lat,
    navDestination?.lng,
    route?.coordinates?.length,
  ]);

  const restaurantDisplayName =
    order?.merchantName?.trim() ||
    compactAddress(pickup?.address ?? "").line1 ||
    t("orders.activeFood.restaurantFallback", "Restaurant");

  const handleReportIssue = useCallback(() => {
    router.push({
      pathname: "/raise-ticket-flow",
      params: { orderId },
    });
  }, [orderId]);

  const handleCallRestaurant = useCallback(() => {
    const phone = (order?.restaurantPhone ?? order?.customerPhone)?.trim();
    if (!phone) {
      Alert.alert(
        t("orders.activeFood.noPhoneTitle", "Phone unavailable"),
        t("orders.activeFood.noPhoneMessage", "Restaurant phone is not available.")
      );
      return;
    }
    void Linking.openURL(`tel:${phone}`);
  }, [order?.restaurantPhone, order?.customerPhone, t]);

  const handleOpenMaps = useCallback(() => {
    if (!navDestination) return;
    const rider = riderLocation ?? riderForRoute;
    void openGoogleMapsNavigation({
      destination: {
        lat: navDestination.lat,
        lng: navDestination.lng,
      },
      origin: rider ? { lat: rider.lat, lng: rider.lng } : undefined,
      destinationLabel: navDestination.address,
    });
  }, [navDestination, riderLocation, riderForRoute]);

  const handleEmergencyPress = useCallback(() => {
    setSosSheetOpen(true);
  }, []);

  const shouldShowAdminCancelSheet =
    !cancelSuccess &&
    (adminCancelSheetOpen ||
      (hadActiveOrderRef.current && isRiderOrderCancelled(order)) ||
      (hadActiveOrderRef.current &&
        isError &&
        isOrderFetchNotFoundError(error) &&
        adminCancelHandledRef.current));

  if (cancelSuccess) {
    return (
      <View style={styles.centered}>
        <StatusBar style="dark" />
        <RiderCancelSuccessSheet
          visible
          orderIdLabel={order?.formattedOrderId?.trim() || orderId}
          reasonLabel={cancelSuccess.reasonLabel}
          penaltyApplied={cancelSuccess.penaltyApplied}
          penaltyAmount={cancelSuccess.penaltyAmount}
          onGoToOrders={dismissCancelSuccess}
          onViewLedger={
            cancelSuccess.penaltyApplied && cancelSuccess.penaltyAmount > 0
              ? openLedgerAfterCancel
              : undefined
          }
        />
      </View>
    );
  }

  if (shouldShowAdminCancelSheet) {
    return (
      <View style={styles.centered}>
        <StatusBar style="dark" />
        <RiderAdminOrderCancelledSheet
          visible
          orderIdLabel={order?.formattedOrderId?.trim() || orderId}
          penaltyAmount={adminCancelPenaltyAmount}
          onDismiss={handleAdminCancelDismiss}
        />
      </View>
    );
  }

  if (isLoading && !order) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={styles.loadingHint}>
          {t("orders.activeRide.loadingOrder", "Loading navigation…")}
        </Text>
      </View>
    );
  }

  if (isError && !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>
          {extractApiErrorMessage(
            error,
            isFoodOrder
              ? t("orders.activeFood.notFound", "Order not found")
              : t("orders.activeRide.notFound", "Ride not found")
          )}
        </Text>
        <Button onPress={() => router.replace("/(tabs)/orders")} style={{ marginTop: 16 }}>
          {t("orders.activeRide.backHome", "Back to orders")}
        </Button>
      </View>
    );
  }

  if (!order || !navDestination) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>
          {isFetching
            ? t("orders.activeRide.loadingOrder", "Loading navigation…")
            : isFoodOrder
              ? t("orders.activeFood.notFound", "Order not found")
              : t("orders.activeRide.notFound", "Ride not found")}
        </Text>
        {isFetching ? (
          <ActivityIndicator
            size="large"
            color={colors.primary[500]}
            style={{ marginTop: 16 }}
          />
        ) : (
          <Button onPress={() => router.replace("/(tabs)/orders")} style={{ marginTop: 16 }}>
            {t("orders.activeRide.backHome", "Back to orders")}
          </Button>
        )}
      </View>
    );
  }

  const displayId = order.formattedOrderId?.trim() || order.id;
  const rideNavPhase = rideStarted && !orderDelivered ? "drop" : "pickup";
  const pickupAddressParts = compactAddress(
    (isFoodOrder ? foodDeliveryActive : rideStarted) && delivery?.address
      ? delivery.address
      : pickup?.address ?? ""
  );
  const foodPhase = foodDeliveryActive && !orderDelivered ? "drop" : "pickup";
  const passengerName =
    order.customerName?.trim() || t("orders.activeRide.passengerFallback", "Passenger");

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mainColumn}>
      <View style={styles.mapStageFlex}>
        <ActiveRideNavigationMap
          ref={mapRef}
          riderLocation={mapRiderLocation}
          pickup={{
            lat: navDestination.lat,
            lng: navDestination.lng,
            address: navDestination.address,
          }}
          destinationLabel={navDestination.mapLabel}
          foodRestaurantName={
            isFoodOrder && navDestination.mapLabel === "Pickup" ? restaurantDisplayName : undefined
          }
          remainingCoordinates={routeProgress.remaining}
          fullRouteCoordinates={route?.coordinates ?? []}
          alternativeRoutes={route?.alternatives}
          offRouteConnectorGeoJson={riderRouteConnectorGeoJson}
          routeJoinPoint={routeProgress.routeJoinPoint ?? null}
          routeDeviationWrongWay={routeDeviation?.wrongWay ?? false}
          traveledCoordinates={[]}
          previousPickup={previousPickup}
          mapEdgeInsets={mapEdgeInsets}
          fitCameraTrigger={cameraFitTrigger}
          navigationFollowMode={mapNavigationFollowMode}
          mapViewMode={mapViewMode}
          onUserMapGesture={handleUserMapGesture}
          arrivedAtDestination={
            // Hide only for the *current* nav destination (pickup OR drop).
            // Never use sticky pickupConfirmed — that hid the drop-leg polyline.
            showDropOnMap
              ? atCustomer || (metersToPickup != null && metersToPickup <= 40)
              : metersToPickup != null && metersToPickup <= 40
          }
          remainingDistanceM={metersToPickup}
          style={styles.mapFill}
        />

        <PickupUpdatedBanner
          visible={pickupBannerVisible}
          message={pickupBannerMessage}
          onDismiss={() => {
            setPickupBannerVisible(false);
            setPickupBannerMessage(undefined);
            setPreviousPickup(null);
          }}
        />

        <View style={styles.mapChromeLayer} pointerEvents="box-none">
          <FoodNavigationMapChrome
            headerTitle={navHeaderTitle}
            mapControlsBottom={mapControlsBottom}
            onBackPress={() => router.back()}
            onEmergencyPress={handleEmergencyPress}
            onDirectionsPress={handleOpenMaps}
            onHelpPress={handleReportIssue}
            onRecenter={handleMapRecenter}
            onRouteOverviewLongPress={handleMapRouteOverview}
            onZoomIn={handleMapZoomIn}
            onZoomOut={handleMapZoomOut}
          />
        </View>
      </View>

      <View
        style={[
          styles.sheetOverlay,
          (otpSheetOpen || deliveryOtpSheetOpen) && styles.sheetOverlayBehindOtp,
        ]}
        pointerEvents={otpSheetOpen || deliveryOtpSheetOpen ? "none" : "box-none"}
      >
      {isFoodOrder ? (
        <FoodNavigateBottomSheet
          order={order}
          orderIdLabel={displayId}
          phase={foodPhase}
          title={sheetTitle}
          restaurantName={
            foodPhase === "drop"
              ? order.customerName?.trim() || t("orders.activeFood.customer", "Customer")
              : restaurantDisplayName
          }
          pickupAddress={pickupAddressParts.line1}
          pickupLandmark={pickupAddressParts.landmark}
          routeMeta={{
            etaMinutes: liveEtaMinutes,
            distanceKm: liveDistanceKm,
            metersAway: metersToPickup,
            loading: routeLoading && !route,
            error: routeError,
            onRetryRoute: () => void fetchRoute(true),
          }}
          pickupConfirmed={pickupConfirmed}
          rideStarted={foodDeliveryActive}
          atCustomer={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending}
          deliveryPhotoLoading={deliveryPhotoUploading}
          deliveryPhotoReady={isDeliveryProofUploaded(deliveryProof)}
          bottomInset={sheetBottomInset}
          onReachStore={handleReachStore}
          onMarkPickup={handleMarkPickup}
          onReachCustomer={handleReachCustomer}
          onDelivered={handleDelivered}
          reachSliderDone={reachSliderDone}
          hideMarkPickupWhilePickSheet={
            showFoodPickOrderSheet ||
            pickOrderDetailOpen ||
            showRestaurantFeedbackSheet ||
            pickupVerificationOpen ||
            barcodeScannerOpen
          }
          hidePrepBanner={reachSliderDone}
          showPickOrderReopen={reachSliderDone && pickOrderSheetDismissed && !pickOrderDetailOpen}
          onOpenPickOrderSheet={() => setPickOrderSheetDismissed(false)}
          onReportIssue={handleReportIssue}
          onCallRestaurant={handleCallRestaurant}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          chatUnreadCount={chatUnreadCount}
          onOpenMaps={handleOpenMaps}
          onCancel={() => setCancelSheetOpen(true)}
          cancelLoading={cancelAssigned.isPending}
          callDisabled={
            foodPhase === "drop"
              ? !hasCustomerCallablePhone
              : !(order.restaurantPhone?.trim() || hasCustomerCallablePhone)
          }
          milestoneGeo={milestoneGeo}
          suppressDropDeliverSlider={dropOrderScreenOpen}
          sheetExpanded={navSheetExpanded}
          onToggleSheetExpanded={() => setNavSheetExpanded((v) => !v)}
          pickupFullAddress={pickup?.address?.trim() || ""}
          dropFullAddress={delivery?.address?.trim() || ""}
        />
      ) : (
        <PersonRideNavigateBottomSheet
          order={order}
          tripId={displayId}
          phase={rideNavPhase}
          title={sheetTitle}
          locationLabel={
            rideNavPhase === "drop"
              ? t("orders.activeRide.dropLocationLabel", "DROP LOCATION")
              : t("orders.activeRide.pickupLocationLabel", "PICKUP LOCATION")
          }
          locationName={passengerName}
          locationAddress={pickupAddressParts.line1}
          locationLandmark={pickupAddressParts.landmark}
          pickupAddress={pickup?.address?.trim() || ""}
          dropAddress={delivery?.address?.trim() || ""}
          routeMeta={{
            etaMinutes: liveEtaMinutes,
            distanceKm: liveDistanceKm,
            metersAway: metersToPickup,
            loading: routeLoading && !route,
            error: routeError,
            onRetryRoute: () => void fetchRoute(true),
          }}
          pickupConfirmed={pickupConfirmed}
          pickupOtpVerified={pickupOtpVerified}
          rideStarted={rideStarted}
          atDrop={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending}
          startRideLoading={startRide.isPending || verifyPickupOtp.isPending}
          cancelLoading={cancelAssigned.isPending}
          bottomInset={sheetBottomInset}
          completeRideLoading={completeRide.isPending}
          onReachPickup={handleReachedPickup}
          onReachDrop={handleReachCustomer}
          onCompleteRide={handleCompleteRide}
          onStartRide={handleStartRide}
          reachSliderDone={reachSliderDone}
          startRideSliderKey={startRideSliderKey}
          waitTimerLabel={rideWaitTimerLabel}
          otpSheetOpen={otpSheetOpen}
          onCancel={() => setCancelSheetOpen(true)}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          chatUnreadCount={chatUnreadCount}
          onOpenMaps={handleOpenMaps}
          onGoHome={handleGoHomeAfterRide}
          callDisabled={!hasCustomerCallablePhone}
          milestoneGeo={milestoneGeo}
          sheetExpanded={navSheetExpanded}
          onToggleSheetExpanded={() => setNavSheetExpanded((v) => !v)}
        />
      )}
      </View>
      </View>

      {isFoodOrder && order ? (
        <FoodPickOrderDetailScreen
          visible={pickOrderDetailOpen && !foodDeliveryActive && !orderDelivered && !otpSheetOpen}
          order={order}
          orderIdLabel={displayId}
          restaurantName={restaurantDisplayName}
          restaurantAddress={[pickupAddressParts.line1, pickupAddressParts.landmark]
            .filter(Boolean)
            .join(", ") || order.pickup.address}
          merchantReady={order.merchantOrderReady === true}
          onBack={() => setPickOrderDetailOpen(false)}
          onCall={handleCallRestaurant}
          onCallCustomer={handleCallCustomer}
          onHelp={handleReportIssue}
          onPickedOrder={handlePickedOrderSlide}
          pickUpLoading={
            markFoodPickup.isPending || verifyPickupBarcode.isPending || verifyPickupOtp.isPending
          }
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodPickupVerificationScreen
          visible={pickupVerificationOpen && !foodDeliveryActive && !orderDelivered}
          barcodeEnabled={barcodeVerificationEnabled}
          otpEnabled={otpVerificationEnabled}
          onBack={() => setPickupVerificationOpen(false)}
          onScanBarcode={(opts) => {
            void openBarcodeScanner(opts);
          }}
          onEnterOtp={() => {
            setPickupVerificationOpen(false);
            foodPickupOtpFromVerificationRef.current = true;
            setOtpError(null);
            setOtpResetKey((k) => k + 1);
            setOtpSheetOpen(true);
          }}
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodBarcodeScannerScreen
          visible={barcodeScannerOpen && !foodDeliveryActive && !orderDelivered}
          cameraGrantedHint={scannerCameraGranted}
          loading={verifyPickupBarcode.isPending}
          error={barcodeError}
          onClose={() => {
            if (verifyPickupBarcode.isPending) return;
            setBarcodeScannerOpen(false);
            setScannerCameraGranted(false);
            setBarcodeError(null);
            if (barcodeVerificationEnabled && otpVerificationEnabled) {
              setPickupVerificationOpen(true);
            }
          }}
          onScanned={handleBarcodeScanned}
        />
      ) : null}

      {isFoodOrder && order ? (
        <PickupCameraPermissionSheet
          visible={pickupCameraSheetOpen && !barcodeScannerOpen}
          onGranted={handlePickupCameraGranted}
          onDismiss={() => setPickupCameraSheetOpen(false)}
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodPickOrderSheet
          visible={showFoodPickOrderSheet}
          merchantReady={order.merchantOrderReady === true}
          order={order}
          orderIdLabel={displayId}
          customerName={order.customerName}
          onDismiss={() => setPickOrderSheetDismissed(true)}
          onConfirmPickup={handlePickOrderConfirm}
        />
      ) : null}

      <View style={styles.otpSheetHost} pointerEvents="box-none">
        <PickupOtpBottomSheet
          visible={otpSheetOpen && !(isFoodOrder && foodDeliveryActive) && !deliveryOtpSheetOpen}
          loading={verifyPickupOtp.isPending || (!isFoodOrder && startRide.isPending)}
          error={otpError}
          resetKey={otpResetKey}
          customerName={isFoodOrder ? order.merchantName : order.customerName}
          orderIdLabel={displayId}
          otpContext={isFoodOrder ? "merchant" : "customer"}
          purpose="pickup"
          waitTimerLabel={isFoodOrder ? null : rideWaitTimerLabel}
          rideType={isFoodOrder ? null : order?.rideType}
          bottomOffset={0}
          onDismiss={handleDismissOtpSheet}
          onSubmit={handleVerifyOtp}
          onClearError={() => setOtpError(null)}
        />

        {deliveryProof ? (
          <FoodDeliveryConfirmBottomSheet
            visible={deliveryOtpSheetOpen && isFoodOrder}
            proofImageUri={deliveryProof.localUri}
            loading={verifyDeliveryOtp.isPending}
            error={otpError}
            resetKey={otpResetKey}
            customerName={order.customerName}
            bottomOffset={0}
            onDismiss={() => {
              if (verifyDeliveryOtp.isPending) return;
              verifyDeliveryOtp.reset();
              setDeliveryOtpSheetOpen(false);
            }}
            onSubmit={handleVerifyDeliveryOtp}
            onClearError={() => setOtpError(null)}
          />
        ) : null}
      </View>

      {isFoodOrder && order ? (
        <FoodDropOrderScreen
          visible={dropOrderScreenOpen && atCustomer && !orderDelivered && !deliveryOtpSheetOpen}
          order={order}
          orderIdLabel={displayId}
          deliveryAddress={[pickupAddressParts.line1, pickupAddressParts.landmark]
            .filter(Boolean)
            .join(", ")}
          restaurantName={restaurantDisplayName}
          onBack={() => setDropOrderScreenOpen(false)}
          onEmergencyPress={handleEmergencyPress}
          onDirectionsPress={handleOpenMaps}
          onHelpPress={handleReportIssue}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          chatUnreadCount={chatUnreadCount}
          onOpenMaps={handleOpenMaps}
          onDelivered={handleDelivered}
          deliverLoading={deliveryPhotoUploading}
          deliverPhotoReady={isDeliveryProofUploaded(deliveryProof)}
          customerRating={order.customerRating ?? undefined}
        />
      ) : null}

      {isFoodOrder && order ? (
        <CustomerFeedbackBottomSheet
          visible={customerFeedbackOpen}
          loading={submitCustomerFeedback.isPending}
          orderIdLabel={displayId}
          customerName={
            order.customerName?.trim() || t("orders.activeFood.customerFallback", "Customer")
          }
          onSkip={handleCustomerFeedbackSkip}
          onSubmit={handleCustomerFeedbackSubmit}
        />
      ) : null}

      {isFoodOrder && order ? (
        <RestaurantFeedbackBottomSheet
          visible={showRestaurantFeedbackSheet}
          loading={submitMerchantFeedback.isPending}
          restaurantName={restaurantDisplayName}
          restaurantAddress={pickup?.address ?? ""}
          onSkip={handleRestaurantFeedbackSkip}
          onSubmit={handleRestaurantFeedbackSubmit}
        />
      ) : null}

      {deliveryPhotoUploading && !deliveryOtpSheetOpen ? (
        <View style={styles.deliveryUploadOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.deliveryUploadText}>
            {t("orders.activeFood.uploadingDeliveryPhoto", "Uploading delivery photo…")}
          </Text>
        </View>
      ) : null}

      <RiderRideCancelReasonSheet
        visible={cancelSheetOpen}
        variant={isFoodOrder ? "food" : "ride"}
        loading={cancelAssigned.isPending}
        onClose={() => setCancelSheetOpen(false)}
        onSelect={handleCancelReason}
      />

      {pendingCancel ? (
        <RiderCancelPenaltyConfirmSheet
          visible={penaltySheetOpen && cancelFailedMessage == null}
          orderId={orderId}
          reasonCode={pendingCancel.reasonCode}
          reasonLabel={pendingCancel.label}
          variant={isFoodOrder ? "food" : "ride"}
          loading={cancelAssigned.isPending}
          onClose={() => {
            if (cancelAssigned.isPending) return;
            setPenaltySheetOpen(false);
            setPendingCancel(null);
            setCancelSheetOpen(true);
          }}
          onProceed={handleProceedCancel}
        />
      ) : null}

      <RiderCancelFailedSheet
        visible={cancelFailedMessage != null}
        title={
          isFoodOrder
            ? t("orders.activeFood.cancelFailedTitle", "Could not cancel")
            : t("orders.activeRide.cancelFailedTitle", "Could not cancel")
        }
        message={cancelFailedMessage ?? undefined}
        onDismiss={() => setCancelFailedMessage(null)}
        onRetry={() => {
          setCancelFailedMessage(null);
          handleProceedCancel();
        }}
      />

      {isFoodOrder && order ? (
        <>
          <CustomerCallConfirmModal
            visible={customerCallConfirmOpen}
            onCancel={() => setCustomerCallConfirmOpen(false)}
            onConfirm={handleConfirmCustomerCall}
          />
          <CustomerCallBottomSheet
            visible={customerCallSheetOpen}
            onDismiss={() => setCustomerCallSheetOpen(false)}
            customerName={order.customerName}
            customerPhone={order.customerPhone}
            customerPrimaryName={order.customerPrimaryName}
            customerPrimaryPhone={order.customerPrimaryPhone}
            customerAlternateName={order.customerAlternateName}
            customerAlternatePhone={order.customerAlternatePhone}
          />
        </>
      ) : null}

      <RiderEmergencySosBottomSheet
        visible={sosSheetOpen}
        onDismiss={() => setSosSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F1F5F9",
  },
  mainColumn: {
    flex: 1,
    position: "relative",
    minHeight: 0,
  },
  mapStage: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  mapStageFlex: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    zIndex: 1,
  },
  mapChromeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    pointerEvents: "box-none",
  },
  mapFill: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  sheetOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 32,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  sheetOverlayBehindOtp: {
    opacity: 0,
    pointerEvents: "none",
  },
  otpSheetHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.gray[900],
    textAlign: "center",
  },
  loadingHint: {
    marginTop: 12,
    fontSize: 14,
    color: colors.gray[600],
    textAlign: "center",
  },
  deliveryUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  deliveryUploadText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[700],
    textAlign: "center",
  },
});
