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
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { markAcceptScreenVisible } from "@/src/lib/acceptOrderLatency";
import { beginSlideAction, markSlideAction } from "@/src/lib/slideActionLatency";
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
import { createForegroundLocationTracker, LOCATION_ENGINE_PROFILES, type LocationTrackerState } from "@/src/services/location/locationTracker";
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
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
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
import { resolveDeliverySlideAction } from "@/src/lib/deliverySlideAction";
import { buildOrderDeliveryProofKey, uploadToR2 } from "@/src/services/storage/cloudflareR2";
import {
  cancellationPenaltyPreviewQueryKey,
  usePrefetchCancelPenaltyPreviews,
  useRiderCancellationReasons,
} from "@/src/hooks/useRiderCancellationReasons";
import { useSessionStore } from "@/src/stores/sessionStore";
import { extractApiErrorMessage, isOrderFetchNotFoundError } from "@/src/services/http";
import {
  isRetryableRiderActionError,
  isWrongOtpError,
  riderActionBusyLabel,
} from "@/src/lib/rider-action-kind";
import {
  findPendingRiderAction,
  useRiderPendingActionStore,
} from "@/src/stores/riderPendingActionStore";
import { shouldSkipCoalescedFix, type CoalesceFixSnapshot } from "@/src/lib/coalesceLocationUi";
import {
  isRiderOrderCancelled,
  resolveRiderCancellationPenaltyAmount,
} from "@/src/lib/rider-order-cancelled";
import {
  splitRouteProgress,
  etaMinutesFromMeters,
  analyzeRiderOnRoute,
  rerouteDebounceMs,
  shouldRequestReroute,
} from "@/src/lib/navigation-route-progress";
import { useActiveNavLocationStore } from "@/src/stores/activeNavLocationStore";
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

const EMPTY_ROUTE_COORDS: LatLng[] = [];

type RouteProgressSlice = {
  traveled: LatLng[];
  remaining: LatLng[];
  remainingDistanceM: number;
  frontWheel: LatLng | undefined;
  routeJoinPoint: LatLng | undefined;
};

function buildRouteProgressSlice(
  route: NavigationRoute | null | undefined,
  navRider: { lat: number; lng: number } | undefined,
  headingDeg?: number
): RouteProgressSlice {
  if (!route?.coordinates?.length || !navRider) {
    return {
      traveled: [],
      remaining: route?.coordinates ?? [],
      remainingDistanceM: (route?.distanceKm ?? 0) * 1000,
      frontWheel: undefined,
      routeJoinPoint: undefined,
    };
  }
  const split = splitRouteProgress(route.coordinates, {
    latitude: navRider.lat,
    longitude: navRider.lng,
    headingDeg,
  });
  return {
    traveled: split.traveled,
    remaining: split.remaining,
    remainingDistanceM: split.remainingDistanceM,
    frontWheel: split.frontWheel,
    routeJoinPoint: split.routeJoinPoint,
  };
}

export function ActiveRideNavigationScreen({ orderId, mode = "ride" }: Props) {
  const isFoodOrder = mode === "food";
  const { t } = useTranslation();
  useEffect(() => {
    markAcceptScreenVisible();
  }, [orderId]);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ActiveRideNavigationMapHandle>(null);
  const tracker = useMemo(
    () =>
      createForegroundLocationTracker({
        profileId: "active-nav",
        ...LOCATION_ENGINE_PROFILES.nav,
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
  const lastRerouteAtRef = useRef(0);
  const lastRouteDistanceKmRef = useRef<number | null>(null);
  const routeInFlightRef = useRef(false);
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
    refetchInterval: isFoodOrder ? 12_000 : 15_000,
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
  const pendingActions = useRiderPendingActionStore((s) => s.actions);
  const pendingReachPickup = findPendingRiderAction(
    pendingActions,
    "reached_pickup",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
  const pendingReachDrop = findPendingRiderAction(
    pendingActions,
    "reached_drop",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
  const pendingStartRide = findPendingRiderAction(
    pendingActions,
    "start_ride",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
  const pendingCompleteRide = findPendingRiderAction(
    pendingActions,
    "complete_ride",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
  const pendingPickupOtp = findPendingRiderAction(
    pendingActions,
    "verify_pickup_otp",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
  const pendingDeliveryOtp = findPendingRiderAction(
    pendingActions,
    "verify_delivery_otp",
    orderId,
    order?.id,
    order?.formattedOrderId
  );
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
  const cancelVariant = isFoodOrder ? "food" : "ride";
  const { data: cancelReasons } = useRiderCancellationReasons(cancelVariant);
  // Prefetch every reason's penalty as soon as the order screen has reasons —
  // confirm sheet then paints with cached amount (no "Checking penalty…" flash).
  usePrefetchCancelPenaltyPreviews(
    orderId,
    cancelReasons,
    Boolean(orderId && (cancelReasons?.length ?? 0) > 0)
  );
  const [otpSheetOpen, setOtpSheetOpen] = useState(false);
  const [deliveryOtpSheetOpen, setDeliveryOtpSheetOpen] = useState(false);
  /** Captured delivery photo — OTP can open before R2 upload finishes. */
  const [deliveryProof, setDeliveryProof] = useState<DeliveryProofState | null>(null);
  const [deliveryCaptureBusy, setDeliveryCaptureBusy] = useState(false);
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
  const deliveryActionLockRef = useRef(false);
  const captureLaunchRef = useRef(false);
  const uploadPromiseRef = useRef<Promise<boolean> | null>(null);
  const deliveryProofRef = useRef<DeliveryProofState | null>(null);
  const deliveryFlowMountedRef = useRef(true);
  const verifyingDeliveryRef = useRef(false);
  const deliveryOtpOpenRef = useRef(false);
  const [deliveryOtpBusy, setDeliveryOtpBusy] = useState(false);
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
  const [adminCancelByType, setAdminCancelByType] = useState<string | null>(null);
  const [waitTick, setWaitTick] = useState(() => Date.now());
  const hadActiveOrderRef = useRef(false);
  const adminCancelHandledRef = useRef(false);
  const riderSelfCancelIntentRef = useRef(false);

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
    riderSelfCancelIntentRef.current = false;
    setAdminCancelSheetOpen(false);
    setAdminCancelPenaltyAmount(null);
    setAdminCancelByType(null);
    setDeliveryProof(null);
    setDeliveryOtpSheetOpen(false);
    setDeliveryCaptureBusy(false);
    deliveryActionLockRef.current = false;
    captureLaunchRef.current = false;
    uploadPromiseRef.current = null;
    deliveryProofRef.current = null;
    verifyingDeliveryRef.current = false;
    setDeliveryOtpBusy(false);
    setOtpError(null);
    setRestaurantFeedbackOpen(false);
    setRiderFoodPickupConfirmed(false);
    prevRiderMarkedPickupRef.current = null;
    setReachSliderPending(false);
    setRideStartedOptimistic(false);
    lastRerouteAtRef.current = 0;
    lastRouteFromRef.current = null;
    lastRouteDistanceKmRef.current = null;
    lastPickupKeyRef.current = null;
  }, [orderId]);

  useEffect(() => {
    deliveryFlowMountedRef.current = true;
    return () => {
      deliveryFlowMountedRef.current = false;
      deliveryActionLockRef.current = false;
      captureLaunchRef.current = false;
    };
  }, []);

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

    const riderSelfCancel =
      riderSelfCancelIntentRef.current || cancelAssigned.isPending;
    if (riderSelfCancel) {
      adminCancelHandledRef.current = true;
      void tracker.stop();
      setPenaltySheetOpen(false);
      setCancelSheetOpen(false);
      setCancelFailedMessage(null);
      setCancelSuccess({
        reasonLabel: pendingCancel?.label ?? "",
        penaltyApplied: false,
        penaltyAmount: 0,
      });
      setPendingCancel(null);
      return;
    }

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
    setAdminCancelByType(
      unassignedByAdmin ? "admin" : order?.cancelledByType?.trim() || null
    );
    setAdminCancelSheetOpen(true);
    void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
    queryClient.removeQueries({ queryKey: ["rider", "orders", "detail", orderId] });
  }, [
    cancelAssigned.isPending,
    cancelSuccess,
    error,
    isError,
    isLoading,
    order,
    orderId,
    pendingCancel,
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

  const sheetBottomInset = useRiderBottomInset();
  const liveFix = trackerState.status === "tracking" ? trackerState.lastFix : undefined;
  useEffect(() => {
    if (liveFix) stickyFixRef.current = liveFix;
  }, [liveFix]);
  const riderFix = liveFix ?? stickyFixRef.current;
  /** Coalesced GPS only — high-frequency smoothing lives inside the map component. */
  const riderLocation = useMemo(
    () =>
      riderFix
        ? {
            lat: riderFix.lat,
            lng: riderFix.lng,
            headingDeg: riderFix.headingDeg,
            speedMps: riderFix.speedMps,
          }
        : undefined,
    [riderFix?.lat, riderFix?.lng, riderFix?.headingDeg, riderFix?.speedMps]
  );

  const riderForRoute = useMemo(
    () => (riderFix ? { lat: riderFix.lat, lng: riderFix.lng } : undefined),
    [riderFix?.lat, riderFix?.lng]
  );

  useEffect(() => {
    useActiveNavLocationStore.getState().setOrderId(orderId);
    useActiveNavLocationStore.getState().setRaw(riderLocation ?? null);
  }, [orderId, riderLocation]);

  const { byMilestone: milestoneGeo } = useMilestoneGeoFence(
    orderId,
    riderForRoute ? { lat: riderForRoute.lat, lng: riderForRoute.lng } : undefined
  );

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
  const reachSliderDone = serverReachPickupCompleted;
  useEffect(() => {
    if (serverReachPickupCompleted) setReachSliderPending(false);
  }, [serverReachPickupCompleted]);
  const reachPickupLocked = !!pendingReachPickup || reachSliderPending;
  const reachPickupBusyLabel = riderActionBusyLabel(
    pendingReachPickup?.phase ?? (reachSliderPending ? "processing" : "idle"),
    t("orders.activeRide.updating", "Updating..."),
    t("orders.activeRide.waitingConnection", "Waiting for connection..."),
    t("orders.activeRide.checkingStatus", "Checking status...")
  );
  const reachDropLocked = !!pendingReachDrop || reachedCustomer.isPending;
  const reachDropBusyLabel = riderActionBusyLabel(
    pendingReachDrop?.phase ?? (reachedCustomer.isPending ? "processing" : "idle"),
    t("orders.activeRide.updating", "Updating..."),
    t("orders.activeRide.waitingConnection", "Waiting for connection..."),
    t("orders.activeRide.checkingStatus", "Checking status...")
  );
  const startRideBusyLabel = riderActionBusyLabel(
    pendingStartRide?.phase ?? (startRide.isPending ? "processing" : "idle"),
    t("orders.activeRide.updating", "Updating..."),
    t("orders.activeRide.waitingConnection", "Waiting for connection..."),
    t("orders.activeRide.checkingStatus", "Checking status...")
  );
  const completeRideBusyLabel = riderActionBusyLabel(
    pendingCompleteRide?.phase ?? (completeRide.isPending ? "processing" : "idle"),
    t("orders.activeRide.updating", "Updating..."),
    t("orders.activeRide.waitingConnection", "Waiting for connection..."),
    t("orders.activeRide.checkingStatus", "Checking status...")
  );
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

  const trackerStateRef = useRef(trackerState);
  trackerStateRef.current = trackerState;
  const readRiderGps = useCallback(() => {
    const state = trackerStateRef.current;
    const fix = state.status === "tracking" ? state.lastFix : undefined;
    if (!fix) return undefined;
    return { lat: fix.lat, lng: fix.lng };
  }, []);

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

  const lastEmittedFixRef = useRef<CoalesceFixSnapshot | null>(null);
  useEffect(() => {
    return tracker.subscribe((next) => {
      setTrackerState((prev) => {
        const nextFix = next.status === "tracking" ? next.lastFix : undefined;
        const prevFix = prev.status === "tracking" ? prev.lastFix : undefined;
        if (next.status !== prev.status || !nextFix || !prevFix) {
          lastEmittedFixRef.current = nextFix
            ? { lat: nextFix.lat, lng: nextFix.lng, heading: nextFix.headingDeg, atMs: Date.now() }
            : null;
          return next;
        }
        const now = Date.now();
        if (shouldSkipCoalescedFix(lastEmittedFixRef.current, nextFix, now, {
          minMoveM: 1,
          minHeadingDeg: 4,
        })) {
          return prev;
        }
        lastEmittedFixRef.current = {
          lat: nextFix.lat,
          lng: nextFix.lng,
          heading: nextFix.headingDeg,
          atMs: now,
        };
        return next;
      });
    });
  }, [tracker]);
  useEffect(() => {
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      // Resume only if not already tracking — avoid stop/start remount flashes.
      const st = tracker.getState();
      if (st.status !== "tracking") {
        void tracker.start();
      }
    });
    return () => sub.remove();
  }, [tracker]);

  const riderForRouteRef = useRef(riderForRoute);
  riderForRouteRef.current = riderForRoute;
  const riderLocationRef = useRef(riderLocation);
  riderLocationRef.current = riderLocation;
  const navDestinationRef = useRef(navDestination);
  navDestinationRef.current = navDestination;
  const routeLenRef = useRef(route?.coordinates?.length ?? 0);
  routeLenRef.current = route?.coordinates?.length ?? 0;

  const fetchRoute = useCallback(
    async (force = false) => {
      const navRider = riderForRouteRef.current ?? riderLocationRef.current;
      const dest = navDestinationRef.current;
      if (!navRider || !dest) {
        // Keep prior polyline; wait for GPS — do not spin forever.
        if (!hadRouteRef.current) setRouteLoading(true);
        return;
      }

      const pickupLat = Number(dest.lat);
      const pickupLng = Number(dest.lng);
      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || (pickupLat === 0 && pickupLng === 0)) {
        setRoute(null);
        setRouteError(true);
        setRouteLoading(false);
        return;
      }

      const fromKey = `${pickupLat.toFixed(5)},${pickupLng.toFixed(5)}|${navRider.lat.toFixed(3)},${navRider.lng.toFixed(3)}`;
      if (!force && lastRouteFromRef.current === fromKey) return;
      if (routeInFlightRef.current) return;

      const isInitialRoute = routeLenRef.current === 0;
      if (isInitialRoute) setRouteLoading(true);
      setRouteError(false);
      routeInFlightRef.current = true;
      try {
        const result = await getNavigationRouteToPickup(
          latLngFromRider(navRider.lat, navRider.lng),
          latLngFromRider(pickupLat, pickupLng),
          order?.rideType
        );
        if (result) {
          lastRouteFromRef.current = fromKey;
          const samePolyline =
            !isInitialRoute &&
            routeLenRef.current === (result.coordinates?.length ?? 0) &&
            lastRouteDistanceKmRef.current != null &&
            Math.abs(lastRouteDistanceKmRef.current - (result.distanceKm ?? 0)) < 0.008;
          lastRouteDistanceKmRef.current = result.distanceKm ?? 0;
          if (!samePolyline) {
            setRoute(result);
          }
          trackDebug(force ? "rerouting_completed" : "route_generated", {
            orderId,
            points: result.coordinates?.length ?? 0,
            distanceKm: result.distanceKm,
            force,
            skippedDuplicate: samePolyline,
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
        routeInFlightRef.current = false;
        setRouteLoading(false);
      }
    },
    [order?.rideType, orderId]
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
    const navRider = riderForRoute;
    if (!navRider || !navDestination || !route?.coordinates?.length) return;

    const deviation = analyzeRiderOnRoute(route.coordinates, {
      latitude: navRider.lat,
      longitude: navRider.lng,
      headingDeg: riderLocation?.headingDeg,
    });
    if (!shouldRequestReroute(deviation, lastRerouteAtRef.current)) return;

    trackDebug("off_route_detected", {
      orderId,
      offRouteM: Math.round(deviation!.offRouteM),
      wrongWay: deviation!.wrongWay,
      remainingM: Math.round(deviation!.remainingDistanceM),
    });

    lastRerouteAtRef.current = Date.now();
    if (offRouteRefetchTimerRef.current) clearTimeout(offRouteRefetchTimerRef.current);
    const debounceMs = rerouteDebounceMs(deviation!);
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
    riderLocation?.headingDeg,
    navDestination?.lat,
    navDestination?.lng,
    route?.coordinates,
    fetchRoute,
    orderId,
  ]);

  const routeProgressMetrics = useMemo(
    () => buildRouteProgressSlice(route, riderForRoute, riderFix?.headingDeg),
    [route, riderForRoute, riderFix?.headingDeg]
  );

  /** Sheet ETA/distance — throttle so GPS coalesce does not thrash bottom sheet text. */
  const sheetEtaAtRef = useRef(0);
  const sheetMetersRef = useRef<number | null>(null);
  const [sheetMetersAway, setSheetMetersAway] = useState<number | null>(null);
  const [sheetEtaMinutes, setSheetEtaMinutes] = useState(0);
  const [sheetDistanceKm, setSheetDistanceKm] = useState(0.1);

  useEffect(() => {
    const m = Math.round(routeProgressMetrics.remainingDistanceM);
    const now = Date.now();
    const prev = sheetMetersRef.current;
    if (
      prev != null &&
      Math.abs(m - prev) < 20 &&
      now - sheetEtaAtRef.current < 1200
    ) {
      return;
    }
    sheetMetersRef.current = m;
    sheetEtaAtRef.current = now;
    useActiveNavLocationStore.getState().setSheetRemainingM(m);
    setSheetMetersAway(m);
    setSheetEtaMinutes(etaMinutesFromMeters(m));
    setSheetDistanceKm(Math.max(0.1, m / 1000));
  }, [routeProgressMetrics.remainingDistanceM]);

  const liveEtaMinutes = sheetEtaMinutes;
  const liveDistanceKm = sheetDistanceKm;

  const metersToPickup = useMemo(() => {
    if (!riderForRoute || !navDestination) return null;
    return Math.round(routeProgressMetrics.remainingDistanceM);
  }, [riderForRoute, navDestination, routeProgressMetrics.remainingDistanceM]);

  const mapRiderLocation = riderLocation;

  const sheetRouteMeta = useMemo(
    () => ({
      etaMinutes: liveEtaMinutes,
      distanceKm: liveDistanceKm,
      metersAway: sheetMetersAway ?? metersToPickup,
      loading: routeLoading && !route,
      error: routeError,
      onRetryRoute: () => void fetchRoute(true),
    }),
    [
      liveEtaMinutes,
      liveDistanceKm,
      sheetMetersAway,
      metersToPickup,
      routeLoading,
      route,
      routeError,
      fetchRoute,
    ]
  );

  const mapPickup = useMemo(
    () =>
      navDestination
        ? {
            lat: navDestination.lat,
            lng: navDestination.lng,
            address: navDestination.address,
          }
        : null,
    [navDestination?.lat, navDestination?.lng, navDestination?.address]
  );

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
    const gps = readRiderGps();
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
          if (isRetryableRiderActionError(err)) return;
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
  }, [orderId, reachedPickup, isFoodOrder, readRiderGps, t]);

  const handleReachStore = useCallback(() => {
    const gps = readRiderGps();
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
          if (isRetryableRiderActionError(err)) return;
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
  }, [orderId, reachedPickup, readRiderGps, t]);

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
      markSlideAction("T8_NAVIGATION");
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
      const gps = readRiderGps();
      void markFoodPickup
        .mutateAsync({ orderId, ...gps, deviceTimestamp: new Date().toISOString() })
        .then((data) => completeFoodPickupVerification(data))
        .catch((err) => {
          if (isRetryableRiderActionError(err)) return;
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
    readRiderGps,
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
      const gps = readRiderGps();
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
    [orderId, readRiderGps, verifyPickupBarcode, completeFoodPickupVerification, t]
  );

  const handleReachCustomer = useCallback(() => {
    const gps = readRiderGps();
    reachedCustomer.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setDropOrderScreenOpen(true);
        },
        onError: (err) => {
          if (isRetryableRiderActionError(err)) return;
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
  }, [orderId, reachedCustomer, readRiderGps, isFoodOrder, t]);

  const handleCompleteRide = useCallback(() => {
    const gps = readRiderGps();
    completeRide.mutate(
      { orderId, ...gps },
      {
        onSuccess: (deliveredOrder) => {
          markSlideAction("T8_NAVIGATION");
          finishRideDeliveryFlow(deliveredOrder);
        },
        onError: (err) => {
          if (isRetryableRiderActionError(err)) return;
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
  }, [completeRide, orderId, readRiderGps, finishRideDeliveryFlow, t]);

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
        if (deliveryFlowMountedRef.current && !deliveryOtpOpenRef.current) {
          Alert.alert(
            t("orders.activeFood.uploadAuthError", "Session expired"),
            t("orders.activeFood.signInAgain", "Sign in again and retry delivery.")
          );
        }
        return false;
      }

      try {
        const key = buildOrderDeliveryProofKey(orderId);
        const result = await uploadToR2(uri, "orders", token, key);
        if (!deliveryFlowMountedRef.current) return false;
        const next: DeliveryProofState = {
          localUri: uri,
          uploaded: { proxyUrl: result.proxyUrl, key: result.key },
        };
        deliveryProofRef.current = next;
        setDeliveryProof(next);
        return true;
      } catch (err) {
        if (!deliveryFlowMountedRef.current) return false;
        if (!deliveryOtpOpenRef.current) {
          Alert.alert(
            t("orders.activeFood.uploadFailedTitle", "Upload failed"),
            err instanceof Error
              ? err.message
              : t(
                  "orders.activeFood.uploadFailed",
                  "Could not upload delivery photo. Slide again to retry."
                )
          );
        }
        return false;
      }
    },
    [orderId, session?.accessToken, t]
  );

  const startBackgroundUpload = useCallback(
    (uri: string): Promise<boolean> => {
      if (uploadPromiseRef.current) return uploadPromiseRef.current;
      const pending = uploadDeliveryProof(uri).finally(() => {
        if (uploadPromiseRef.current === pending) {
          uploadPromiseRef.current = null;
        }
      });
      uploadPromiseRef.current = pending;
      return pending;
    },
    [uploadDeliveryProof]
  );

  const reopenDeliveryOtpSheet = useCallback(
    (opts?: { resetOtp?: boolean }) => {
      setOtpError(null);
      if (opts?.resetOtp) {
        setOtpResetKey((k) => k + 1);
      }
      setDeliveryOtpSheetOpen(true);
    },
    []
  );

  const releaseDeliveryAction = useCallback(() => {
    if (!deliveryFlowMountedRef.current) return;
    deliveryActionLockRef.current = false;
    captureLaunchRef.current = false;
    setDeliveryCaptureBusy(false);
  }, []);

  const handleDelivered = useCallback(() => {
    if (deliveryActionLockRef.current || captureLaunchRef.current) return;

    const proof = deliveryProofRef.current;
    const action = resolveDeliverySlideAction(proof);

    if (action === "reopen-otp" || action === "reopen-otp-and-upload") {
      deliveryActionLockRef.current = true;
      setDeliveryCaptureBusy(true);
      reopenDeliveryOtpSheet(action === "reopen-otp" ? undefined : { resetOtp: false });
      setDeliveryCaptureBusy(false);
      if (action === "reopen-otp-and-upload" && proof?.localUri) {
        void startBackgroundUpload(proof.localUri);
      }
      return;
    }

    deliveryActionLockRef.current = true;
    setDeliveryCaptureBusy(true);
    captureLaunchRef.current = true;
    setOtpSheetOpen(false);

    void (async () => {
      try {
        const uri = await captureDeliveryProofPhoto(t);
        if (!deliveryFlowMountedRef.current) return;
        if (!uri) {
          releaseDeliveryAction();
          return;
        }

        const next: DeliveryProofState = { localUri: uri };
        deliveryProofRef.current = next;
        setDeliveryProof(next);
        reopenDeliveryOtpSheet({ resetOtp: true });
        setDeliveryCaptureBusy(false);
        captureLaunchRef.current = false;
        void startBackgroundUpload(uri);
      } catch (err) {
        if (!deliveryFlowMountedRef.current) return;
        releaseDeliveryAction();
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
    })();
  }, [reopenDeliveryOtpSheet, releaseDeliveryAction, startBackgroundUpload, t]);

  deliveryProofRef.current = deliveryProof;
  deliveryOtpOpenRef.current = deliveryOtpSheetOpen;

  const handleDismissDeliveryOtp = useCallback(() => {
    if (verifyDeliveryOtp.isPending || verifyingDeliveryRef.current) return;
    verifyDeliveryOtp.reset();
    setDeliveryOtpSheetOpen(false);
    setDeliveryOtpBusy(false);
    releaseDeliveryAction();
  }, [verifyDeliveryOtp.reset, verifyDeliveryOtp.isPending, releaseDeliveryAction]);

  const handleClearDeliveryOtpError = useCallback(() => {
    setOtpError(null);
  }, []);

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
      // Kick / refresh preview in background — UI uses cache when ready (no spinner if prefetched).
      void queryClient.ensureQueryData({
        queryKey: cancellationPenaltyPreviewQueryKey(orderId, reasonCode),
        queryFn: () => riderApi.getCancellationPenaltyPreview(orderId, reasonCode),
        staleTime: 60_000,
      });
    },
    [orderId, queryClient]
  );

  const handleProceedCancel = useCallback(() => {
    if (!pendingCancel || cancelAssigned.isPending) return;
    setCancelFailedMessage(null);
    const reasonLabel = pendingCancel.label;
    riderSelfCancelIntentRef.current = true;
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
          if (!isRetryableRiderActionError(err)) {
            riderSelfCancelIntentRef.current = false;
          }
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
      beginSlideAction("verify_pickup_otp", orderId);
      markSlideAction("T1_HANDLER");
      setOtpError(null);

      // Instant UI on submit — don't keep the OTP sheet spinning until the API returns.
      // Wrong OTP reopens the sheet; success path is already painted.
      setOtpSheetOpen(false);
      if (isFoodOrder) {
        setRiderFoodPickupConfirmed(true);
        setRideStartedOptimistic(true);
        setPickOrderDetailOpen(false);
        setPickOrderSheetDismissed(true);
        setCameraFitTrigger((n) => n + 1);
      } else {
        setRideStartedOptimistic(true);
        setCameraFitTrigger((n) => n + 1);
      }

      const gps = readRiderGps();
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
          const rideGps = readRiderGps();
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
              if (isRetryableRiderActionError(err)) return;
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
          if (isRetryableRiderActionError(err)) {
            setOtpError(
              t(
                "orders.activeRide.otpRetrying",
                "Connection lost. Retrying verification..."
              )
            );
            setOtpSheetOpen(true);
            if (isFoodOrder) {
              setRiderFoodPickupConfirmed(false);
              setRideStartedOptimistic(false);
            } else {
              setRideStartedOptimistic(false);
            }
            return;
          }
          verifyPickupOtp.reset();
          // Revert optimistic transition — OTP was wrong or verification failed.
          if (isFoodOrder) {
            setRiderFoodPickupConfirmed(false);
            setRideStartedOptimistic(false);
          } else {
            setRideStartedOptimistic(false);
          }
          setOtpSheetOpen(true);
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
          if (isWrongOtpError(err)) setOtpResetKey((k) => k + 1);
        });
    },
    [
      verifyPickupOtp.mutateAsync,
      verifyPickupOtp.isPending,
      orderId,
      readRiderGps,
      isFoodOrder,
      t,
      completeFoodPickupVerification,
      queryClient,
      startRide.mutateAsync,
    ]
  );

  const handleVerifyDeliveryOtp = useCallback(
    (otp: string) => {
      if (verifyingDeliveryRef.current || verifyDeliveryOtp.isPending) return;
      verifyingDeliveryRef.current = true;
      beginSlideAction("verify_delivery_otp", orderId);
      markSlideAction("T1_HANDLER");
      setDeliveryOtpBusy(true);
      setOtpError(null);

      void (async () => {
        const failBusy = () => {
          verifyingDeliveryRef.current = false;
          if (deliveryFlowMountedRef.current) setDeliveryOtpBusy(false);
        };

        try {
          if (!isDeliveryProofUploaded(deliveryProofRef.current) && uploadPromiseRef.current) {
            const uploadedOk = await uploadPromiseRef.current;
            if (!deliveryFlowMountedRef.current) return;
            if (!uploadedOk && !isDeliveryProofUploaded(deliveryProofRef.current)) {
              const uri = deliveryProofRef.current?.localUri;
              if (uri) {
                const retried = await startBackgroundUpload(uri);
                if (!deliveryFlowMountedRef.current) return;
                if (!retried) {
                  setOtpError(
                    t(
                      "orders.activeFood.uploadFailed",
                      "Could not upload delivery photo. Try again."
                    )
                  );
                  failBusy();
                  return;
                }
              }
            }
          }

          let uploaded = deliveryProofRef.current?.uploaded;
          if (!uploaded) {
            const uri = deliveryProofRef.current?.localUri;
            if (!uri) {
              setOtpError(
                t(
                  "orders.activeFood.captureFailed",
                  "Could not capture delivery photo. Slide again to retry."
                )
              );
              failBusy();
              return;
            }
            const ok = await startBackgroundUpload(uri);
            if (!deliveryFlowMountedRef.current) return;
            uploaded = deliveryProofRef.current?.uploaded;
            if (!ok || !uploaded) {
              setOtpError(
                t(
                  "orders.activeFood.uploadFailed",
                  "Could not upload delivery photo. Try again."
                )
              );
              failBusy();
              return;
            }
          }

          const gps = readRiderGps();
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
                verifyingDeliveryRef.current = false;
                deliveryActionLockRef.current = false;
                setDeliveryOtpBusy(false);
                setDeliveryOtpSheetOpen(false);
                setDeliveryProof(null);
                deliveryProofRef.current = null;
                setDropOrderScreenOpen(false);
                setDeliveryCaptureBusy(false);
                deliveredOrderForSuccessRef.current = deliveredOrder;
                queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
                if (deliveredOrder.customerFeedbackSubmitted === true) {
                  navigateToFoodDeliverySuccess(deliveredOrder);
                } else {
                  setCustomerFeedbackOpen(true);
                }
              },
              onError: (err) => {
                if (isRetryableRiderActionError(err)) {
                  verifyingDeliveryRef.current = false;
                  setDeliveryOtpBusy(false);
                  setOtpError(
                    t(
                      "orders.activeRide.otpRetrying",
                      "Connection lost. Retrying verification..."
                    )
                  );
                  return;
                }
                verifyingDeliveryRef.current = false;
                setDeliveryOtpBusy(false);
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
                if (isWrongOtpError(err)) setOtpResetKey((k) => k + 1);
              },
            }
          );
        } catch {
          failBusy();
        }
      })();
    },
    [orderId, verifyDeliveryOtp.mutate, verifyDeliveryOtp.reset, readRiderGps, navigateToFoodDeliverySuccess, queryClient, t, startBackgroundUpload]
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
        <RiderAdminOrderCancelledSheet
          visible
          orderIdLabel={order?.formattedOrderId?.trim() || orderId}
          penaltyAmount={adminCancelPenaltyAmount}
          cancelledByType={adminCancelByType}
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

      <View style={styles.mainColumn}>
      <View style={styles.mapStageFlex}>
        <ActiveRideNavigationMap
          ref={mapRef}
          riderLocation={mapRiderLocation}
          pickup={mapPickup!}
          destinationLabel={navDestination.mapLabel}
          foodRestaurantName={
            isFoodOrder && navDestination.mapLabel === "Pickup" ? restaurantDisplayName : undefined
          }
          remainingCoordinates={routeProgressMetrics.remaining}
          fullRouteCoordinates={route?.coordinates ?? EMPTY_ROUTE_COORDS}
          alternativeRoutes={route?.alternatives}
          offRouteConnectorGeoJson={null}
          routeJoinPoint={routeProgressMetrics.routeJoinPoint ?? null}
          routeDeviationWrongWay={routeDeviation?.wrongWay ?? false}
          traveledCoordinates={EMPTY_ROUTE_COORDS}
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
          routeMeta={sheetRouteMeta}
          pickupConfirmed={pickupConfirmed}
          rideStarted={foodDeliveryActive}
          atCustomer={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending || reachPickupLocked}
          deliveryPhotoLoading={false}
          deliveryActionLocked={deliveryCaptureBusy || deliveryOtpSheetOpen || !!pendingDeliveryOtp}
          deliveryPhotoReady={isDeliveryProofUploaded(deliveryProof)}
          bottomInset={sheetBottomInset}
          onReachStore={handleReachStore}
          onMarkPickup={handleMarkPickup}
          onReachCustomer={handleReachCustomer}
          onDelivered={handleDelivered}
          reachSliderDone={reachSliderDone}
          reachStoreLocked={reachPickupLocked}
          reachStoreBusyLabel={reachPickupBusyLabel}
          reachDropLocked={reachDropLocked}
          reachDropBusyLabel={reachDropBusyLabel}
          deliverBusyLabel={
            pendingDeliveryOtp
              ? riderActionBusyLabel(
                  pendingDeliveryOtp.phase,
                  t("orders.activeRide.updating", "Updating..."),
                  t("orders.activeRide.waitingConnection", "Waiting for connection..."),
                  t("orders.activeRide.checkingStatus", "Checking status...")
                )
              : null
          }
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
          routeMeta={sheetRouteMeta}
          pickupConfirmed={pickupConfirmed}
          pickupOtpVerified={pickupOtpVerified}
          rideStarted={rideStarted}
          atDrop={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending || reachPickupLocked}
          startRideLoading={startRide.isPending || verifyPickupOtp.isPending || !!pendingStartRide || !!pendingPickupOtp}
          cancelLoading={cancelAssigned.isPending}
          bottomInset={sheetBottomInset}
          completeRideLoading={completeRide.isPending || !!pendingCompleteRide}
          onReachPickup={handleReachedPickup}
          onReachDrop={handleReachCustomer}
          onCompleteRide={handleCompleteRide}
          onStartRide={handleStartRide}
          reachSliderDone={reachSliderDone}
          reachSliderLocked={reachPickupLocked}
          reachBusyLabel={reachPickupBusyLabel}
          reachDropLocked={reachDropLocked}
          reachDropBusyLabel={reachDropBusyLabel}
          startRideLocked={!!pendingStartRide}
          startRideBusyLabel={startRideBusyLabel}
          completeRideLocked={!!pendingCompleteRide}
          completeRideBusyLabel={completeRideBusyLabel}
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

        {deliveryProof && !(dropOrderScreenOpen && atCustomer && !orderDelivered) ? (
          <FoodDeliveryConfirmBottomSheet
            visible={deliveryOtpSheetOpen && isFoodOrder}
            proofImageUri={deliveryProof.localUri}
            loading={verifyDeliveryOtp.isPending || deliveryOtpBusy}
            error={otpError}
            resetKey={otpResetKey}
            customerName={order.customerName}
            bottomOffset={0}
            onDismiss={handleDismissDeliveryOtp}
            onSubmit={handleVerifyDeliveryOtp}
            onClearError={handleClearDeliveryOtpError}
          />
        ) : null}
      </View>

      {isFoodOrder && order ? (
        <FoodDropOrderScreen
          visible={dropOrderScreenOpen && atCustomer && !orderDelivered}
          order={order}
          orderIdLabel={displayId}
          deliveryAddress={[pickupAddressParts.line1, pickupAddressParts.landmark]
            .filter(Boolean)
            .join(", ")}
          restaurantName={restaurantDisplayName}
          onBack={() => {
            if (deliveryOtpSheetOpen || deliveryCaptureBusy) return;
            setDropOrderScreenOpen(false);
          }}
          onEmergencyPress={handleEmergencyPress}
          onDirectionsPress={handleOpenMaps}
          onHelpPress={handleReportIssue}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          chatUnreadCount={chatUnreadCount}
          onOpenMaps={handleOpenMaps}
          onDelivered={handleDelivered}
          deliverLoading={false}
          deliverLocked={deliveryCaptureBusy || deliveryOtpSheetOpen || !!pendingDeliveryOtp}
          deliverPhotoReady={isDeliveryProofUploaded(deliveryProof)}
          customerRating={order.customerRating ?? undefined}
        >
          {deliveryProof && dropOrderScreenOpen && atCustomer && !orderDelivered ? (
            <FoodDeliveryConfirmBottomSheet
              visible={deliveryOtpSheetOpen && isFoodOrder}
              proofImageUri={deliveryProof.localUri}
              loading={verifyDeliveryOtp.isPending || deliveryOtpBusy}
              error={otpError}
              resetKey={otpResetKey}
              customerName={order.customerName}
              bottomOffset={0}
              embedded
              onDismiss={handleDismissDeliveryOtp}
              onSubmit={handleVerifyDeliveryOtp}
              onClearError={handleClearDeliveryOtpError}
            />
          ) : null}
        </FoodDropOrderScreen>
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
});
