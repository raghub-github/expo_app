/**
 * Customer waits for rider assignment after confirming pickup (Rapido-style).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  BackHandler,
  Platform,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RideSearchingMap } from "@/components/maps/RideSearchingMap";
import { useRideRouteSnapshot } from "@/hooks/useRideRouteSnapshot";
import { RideSearchingBottomSheet } from "@/features/ride/RideSearchingBottomSheet";
import { RIDE_MAX_SEARCH_EXTENSIONS, RIDE_TIP_BOOST_DECISION_SEC } from "@/lib/ride-search-extensions";
import { RideMapToast } from "@/features/ride/RideMapToast";
import {
  RIDE_CAPTAIN_CANCELLED_TOAST,
  RIDE_CUSTOMER_CANCELLED_TOAST,
} from "@/lib/ride-search-toast-copy";
import { resolvePlaceDisplayName } from "@/services/location.service";
import { rideLabelsFromCheckoutMetadata } from "@/lib/ride-address-labels";
import {
  resolveRideImage,
  resolveSelectedRideMapMarkerImageKey,
} from "@/features/ride/rideOptionAssets";
import { RIDE_RIDER_SEARCH_TIMEOUT_SEC } from "@/features/ride/rideOptions";
import { RideTipBoostSheet, type TipBoostLoadingAction } from "@/features/ride/RideSearchTimeoutSheet";
import { RideSearchingTripDetailsSheet } from "@/features/ride/RideSearchingTripDetailsSheet";
import { RideTripShareSheet } from "@/components/ride/RideTripShareSheet";
import { RideCancelReasonSheet } from "@/features/ride/RideCancelReasonSheet";
import { RideCancelConfirmSheet } from "@/features/ride/RideCancelConfirmSheet";
import type { RideCancelReason } from "@/lib/ride-cancel-reasons";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import { parseRideStopsParam } from "@/lib/ride-serviceability";
import {
  parseRideStopsForOrder,
  validateRidePlacementCoords,
} from "@/lib/ride-stop-payload";
import {
  placeRideOrder,
  getRideOrderStatus,
  isRideCaptainAssigned,
  cancelRideOrder,
  markRideSearchWindowEnded,
  extendRideSearch,
} from "@/services/rideBooking.service";
import { orderService } from "@/services/order.service";
import { seedOrderDetailCache } from "@/lib/orderDetailCache";
import {
  getRideServiceLabel,
  resolveRideCatalogImageKey,
} from "@/lib/ride-order-display";
import {
  clearRideSearchTimer,
  readRideSearchTimer,
  rememberRideSearchTimer,
  remainingSecFromExpiresAt,
} from "@/lib/ride-search-timer-cache";
import {
  parseRideFareDistanceKm,
  resolveRideFareDistanceKm,
} from "@/lib/ride-fare-distance";
import { purgeRideOrderFromClientCaches } from "@/lib/ride-order-query-cache";
import { rememberActivePersonRide } from "@/lib/active-person-ride-persist";
import { useOrderStore } from "@/store/orderStore";

function clearActiveRideOrder(orderId: string): void {
  useOrderStore.getState().removeActiveOrder(orderId);
}

function trackActiveRideOrder(orderId: string): void {
  rememberActivePersonRide(orderId);
  useOrderStore.getState().addActiveOrder({
    orderId,
    status: "ORDER_PLACED",
    etaMinutes: 0,
    storeId: null,
    storeName: null,
    placedAt: Date.now(),
    serviceType: "ride",
  });
}

const SEARCH_TIMEOUT_APOLOGY = {
  title: "We're sorry",
  message:
    "We couldn't find a captain nearby right now. Your ride has been cancelled. Please try again in a few minutes.",
} as const;

type SearchPhase = "placing" | "searching" | "tip_boost" | "timeout" | "cancelled" | "error";

const RIDE_SEARCH_POLL_MS = 4_000;
type CancelFlowStep = null | "reason" | "confirm";

type TripState = {
  pickupAddress: string;
  dropAddress: string;
  pickupLabel: string;
  dropLabel: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  rideTypeId: string;
  rideName: string;
  rideImageKey: string;
  fare: number;
  tripKm?: number;
};

function buildTripStateFromParams(params: {
  pickup?: string;
  drop?: string;
  pickupLabel?: string;
  dropLabel?: string;
  pickupLat?: string;
  pickupLng?: string;
  dropLat?: string;
  dropLng?: string;
  selectedRideId?: string;
  selectedRideName?: string;
  selectedRideImageKey?: string;
  estimatedFare?: string;
  quotedGrandTotal?: string;
  tripKm?: string;
  routeDistanceKm?: string;
}): TripState {
  const fareKm = parseRideFareDistanceKm(params);
  const pickupFull = String(params.pickup ?? "");
  const dropFull = String(params.drop ?? "");
  return {
    pickupAddress: pickupFull,
    dropAddress: dropFull,
    pickupLabel: resolvePlaceDisplayName({
      primary: params.pickupLabel,
      fullAddress: pickupFull,
    }),
    dropLabel: resolvePlaceDisplayName({
      primary: params.dropLabel,
      fullAddress: dropFull,
    }),
    pickupLat: params.pickupLat != null ? Number(params.pickupLat) : null,
    pickupLng: params.pickupLng != null ? Number(params.pickupLng) : null,
    dropLat: params.dropLat != null ? Number(params.dropLat) : null,
    dropLng: params.dropLng != null ? Number(params.dropLng) : null,
    rideTypeId: String(params.selectedRideId ?? ""),
    rideName: String(params.selectedRideName ?? "Ride"),
    rideImageKey: String(params.selectedRideImageKey ?? "bike"),
    fare:
      params.quotedGrandTotal != null && Number(params.quotedGrandTotal) > 0
        ? Number(params.quotedGrandTotal)
        : params.estimatedFare != null
          ? Number(params.estimatedFare)
          : 0,
    tripKm: fareKm,
  };
}

function formatElapsedSec(elapsedSec: number): string {
  const clamped = Math.max(0, elapsedSec);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s elapsed`;
  return `${seconds}s elapsed`;
}

export default function RideSearchingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const mapBottomPadding = 120;

  const params = useLocalSearchParams<{
    pickup?: string;
    drop?: string;
    pickupLabel?: string;
    dropLabel?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropLat?: string;
    dropLng?: string;
    stops?: string;
    selectedRideId?: string;
    selectedRideName?: string;
    selectedRideImageKey?: string;
    estimatedFare?: string;
    quotedGrandTotal?: string;
    tripKm?: string;
    orderId?: string;
    returnTo?: string;
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
    pickupDistanceFromBookerKm?: string;
    farPickupPromptShown?: string;
    farPickupAcknowledged?: string;
    customerTipAmount?: string;
    pickupPincode?: string;
    pickupState?: string;
    captainCancelled?: string;
    routeDistanceKm?: string;
    routeEtaMins?: string;
  }>();

  const [tripState, setTripState] = useState(() => buildTripStateFromParams(params));
  const {
    pickupAddress,
    dropAddress,
    pickupLabel: tripPickupLabel,
    dropLabel: tripDropLabel,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    rideTypeId,
    rideName,
    rideImageKey,
    fare,
    tripKm,
  } = tripState;

  const fareTripKm = useMemo(
    () =>
      resolveRideFareDistanceKm({
        params,
        tripStateKm: tripKm,
      }),
    [params.routeDistanceKm, params.tripKm, tripKm]
  );

  const rideImage = resolveRideImage(rideImageKey);
  const initialTipAmount =
    params.customerTipAmount != null ? Math.max(0, Number(params.customerTipAmount)) : 0;
  const [activeTipAmount, setActiveTipAmount] = useState(initialTipAmount);
  const slabFareForPlacement = useMemo(() => {
    const fromParams = params.estimatedFare != null ? Number(params.estimatedFare) : 0;
    if (Number.isFinite(fromParams) && fromParams > 0) return fromParams;
    return Number.isFinite(fare) && fare > 0 ? fare : 0;
  }, [params.estimatedFare, fare]);
  const totalFare = fare + (Number.isFinite(activeTipAmount) ? activeTipAmount : 0);
  const stops = useMemo(() => parseRideStopsParam(params.stops), [params.stops]);
  const stopsForApi = useMemo(() => parseRideStopsForOrder(params.stops), [params.stops]);
  const isResumeMode = Boolean(params.orderId?.trim());
  const openedFromRideHome = params.returnTo === "ride";
  const resumeOrderId = params.orderId?.trim() ?? "";
  const cachedSearchTimer = resumeOrderId ? readRideSearchTimer(resumeOrderId) : null;

  const pickupLabel = tripPickupLabel;
  const dropLabel = tripDropLabel;

  const pickupPoint = useMemo(
    () =>
      pickupLat != null && pickupLng != null
        ? { latitude: pickupLat, longitude: pickupLng }
        : null,
    [pickupLat, pickupLng]
  );
  const dropPoint = useMemo(
    () =>
      dropLat != null && dropLng != null ? { latitude: dropLat, longitude: dropLng } : null,
    [dropLat, dropLng]
  );

  const hasNavRouteSnapshot = useMemo(() => {
    const km = parseRideFareDistanceKm(params);
    const eta = params.routeEtaMins != null ? Number(params.routeEtaMins) : null;
    return (km != null && km > 0) || (eta != null && Number.isFinite(eta) && eta > 0);
  }, [params.routeDistanceKm, params.tripKm, params.routeEtaMins]);

  const { routeEtaMins: snapshotEtaMins } = useRideRouteSnapshot({
    pickup: pickupPoint,
    drop: dropPoint,
    stops,
    enabled: isFocused && !hasNavRouteSnapshot,
  });

  const routeEtaMins = useMemo(() => {
    if (params.routeEtaMins != null) {
      const parsed = Number(params.routeEtaMins);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return snapshotEtaMins;
  }, [params.routeEtaMins, snapshotEtaMins]);

  const [phase, setPhase] = useState<SearchPhase>(() => {
    if (isResumeMode) return "searching";
    if (cachedSearchTimer && resumeOrderId) return "searching";
    return "placing";
  });
  const [orderId, setOrderId] = useState<string | null>(params.orderId ?? null);
  const searchExpiresAtRef = useRef<string | null>(cachedSearchTimer?.expiresAt ?? null);
  const [searchTimeoutSec, setSearchTimeoutSec] = useState(
    cachedSearchTimer?.windowSec ?? RIDE_RIDER_SEARCH_TIMEOUT_SEC
  );
  const [remainingSec, setRemainingSec] = useState(() =>
    cachedSearchTimer
      ? remainingSecFromExpiresAt(cachedSearchTimer.expiresAt, cachedSearchTimer.windowSec)
      : RIDE_RIDER_SEARCH_TIMEOUT_SEC
  );
  const [timerReady, setTimerReady] = useState(Boolean(cachedSearchTimer) || !isResumeMode);
  const [timeoutSheetVisible, setTimeoutSheetVisible] = useState(false);
  const [tipBoostLoadingAction, setTipBoostLoadingAction] = useState<TipBoostLoadingAction>(null);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [cancelFlowStep, setCancelFlowStep] = useState<CancelFlowStep>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [mapToast, setMapToast] = useState<{ title: string; message?: string } | null>(null);
  const cancelledRef = useRef(false);
  const mapToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captainCancelToastShownRef = useRef(false);
  const placingRef = useRef(false);
  const searchWindowEndedRef = useRef(false);
  /** How many post-tip search extensions the customer has already used (synced from API). */
  const searchExtensionsUsedRef = useRef(0);
  const timeoutApologyShownRef = useRef(false);
  const navigatedToLiveRef = useRef(false);
  const tipBoostExpiresAtRef = useRef<string | null>(null);
  const [tipBoostDecisionRemainingSec, setTipBoostDecisionRemainingSec] = useState(
    RIDE_TIP_BOOST_DECISION_SEC
  );
  const [dispatchDeclinedCount, setDispatchDeclinedCount] = useState(0);

  useEffect(() => {
    if (!isResumeMode) return;
    const inline = buildTripStateFromParams(params);
    if (!inline.pickupAddress.trim() && inline.fare <= 0) return;
    setTripState((prev) => ({
      ...prev,
      pickupAddress: inline.pickupAddress || prev.pickupAddress,
      dropAddress: inline.dropAddress || prev.dropAddress,
      pickupLabel: inline.pickupLabel || prev.pickupLabel,
      dropLabel: inline.dropLabel || prev.dropLabel,
      pickupLat: inline.pickupLat ?? prev.pickupLat,
      pickupLng: inline.pickupLng ?? prev.pickupLng,
      dropLat: inline.dropLat ?? prev.dropLat,
      dropLng: inline.dropLng ?? prev.dropLng,
      rideTypeId: inline.rideTypeId || prev.rideTypeId,
      rideName: inline.rideName || prev.rideName,
      rideImageKey: inline.rideImageKey || prev.rideImageKey,
      fare: inline.fare > 0 ? inline.fare : prev.fare,
      tripKm: inline.tripKm ?? prev.tripKm,
    }));
    if (params.orderId?.trim()) {
      const id = params.orderId.trim();
      setOrderId(id);
      trackActiveRideOrder(id);
    }
  }, [
    isResumeMode,
    params.orderId,
    params.pickup,
    params.drop,
    params.estimatedFare,
    params.quotedGrandTotal,
    params.tripKm,
    params.routeDistanceKm,
    params.selectedRideId,
    params.selectedRideName,
    params.selectedRideImageKey,
    params.pickupLat,
    params.pickupLng,
    params.dropLat,
    params.dropLng,
  ]);

  useEffect(() => {
    navigatedToLiveRef.current = false;
  }, [orderId]);

  const elapsedSec = Math.max(0, searchTimeoutSec - remainingSec);

  const mapCenter = useMemo(() => {
    if (pickupLat != null && pickupLng != null) {
      return { latitude: pickupLat, longitude: pickupLng };
    }
    return { latitude: 24.7969, longitude: 84.9914 };
  }, [pickupLat, pickupLng]);

  const pickupGeoHints = useMemo(
    () => ({
      ...(params.pickupPincode?.trim() ? { pickupPincode: params.pickupPincode.trim() } : {}),
      ...(params.pickupState?.trim() ? { pickupState: params.pickupState.trim() } : {}),
    }),
    [params.pickupPincode, params.pickupState]
  );

  const { data: availability } = useNearbyRideAvailability(
    pickupLat,
    pickupLng,
    fareTripKm ?? tripKm,
    pickupGeoHints,
    rideTypeId
  );

  const nearbyRiders = useMemo(() => availability?.riders ?? [], [availability?.riders]);

  const riderMarkerImageKey = resolveSelectedRideMapMarkerImageKey(rideTypeId, rideImageKey);

  const selectedRideOption = useMemo(
    () => availability?.options?.find((o) => o.id === rideTypeId) ?? null,
    [availability?.options, rideTypeId]
  );

  const pickupDistanceKm = useMemo(() => {
    const fromOption = selectedRideOption?.nearestRiderKm;
    if (fromOption != null && Number.isFinite(fromOption) && fromOption > 0) {
      return fromOption;
    }
    if (params.pickupDistanceFromBookerKm != null) {
      const parsed = Number(params.pickupDistanceFromBookerKm);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [selectedRideOption?.nearestRiderKm, params.pickupDistanceFromBookerKm]);

  const showFastestTag = rideTypeId === "bike";

  const activeMitraSathiCount = useMemo(() => {
    if (
      selectedRideOption?.nearbyRiderCount != null &&
      selectedRideOption.nearbyRiderCount > 0
    ) {
      return selectedRideOption.nearbyRiderCount;
    }
    return nearbyRiders.length;
  }, [selectedRideOption?.nearbyRiderCount, nearbyRiders.length]);

  const sheetPhase = phase === "error" ? "error" : phase === "tip_boost" ? "tip_boost" : phase === "placing" ? "placing" : "searching";

  const sheetTitle =
    phase === "placing"
      ? "Placing your ride…"
      : phase === "error"
        ? "Could not book ride"
        : phase === "tip_boost"
          ? "Still looking for nearby riders"
          : "We're finding the best rider for you";

  const sheetSubtitle =
    phase === "tip_boost"
      ? "Add a tip to help nearby riders notice your order"
      : rideName.toLowerCase().includes("bike")
        ? `Searching nearby ${rideName.toLowerCase()}s for you`
        : "Searching nearby riders for you";

  const returnToRideBook = useCallback(() => {
    const restoreParams: Record<string, string> = {
      pickup: pickupAddress,
      drop: dropAddress,
      selectedRideId: rideTypeId,
    };
    if (pickupLat != null) restoreParams.pickupLat = String(pickupLat);
    if (pickupLng != null) restoreParams.pickupLng = String(pickupLng);
    if (dropLat != null) restoreParams.dropLat = String(dropLat);
    if (dropLng != null) restoreParams.dropLng = String(dropLng);
    if (params.stops) restoreParams.stops = String(params.stops);
    if (params.bookedForSelf) restoreParams.bookedForSelf = String(params.bookedForSelf);
    if (params.passengerName) restoreParams.passengerName = String(params.passengerName);
    if (params.passengerPhone) restoreParams.passengerPhone = String(params.passengerPhone);
    router.replace({ pathname: "/home/service/ride-book", params: restoreParams });
  }, [params, pickupAddress, dropAddress, pickupLat, pickupLng, dropLat, dropLng, rideTypeId, router]);

  const dismissAfterSearchTimeout = useCallback(() => {
    if (openedFromRideHome) {
      router.replace("/home/service/ride");
      return;
    }
    returnToRideBook();
  }, [openedFromRideHome, router, returnToRideBook]);

  const showMapToast = useCallback((title: string, message?: string, durationMs = 5000) => {
    if (mapToastTimerRef.current) clearTimeout(mapToastTimerRef.current);
    setMapToast({ title, message });
    mapToastTimerRef.current = setTimeout(() => {
      setMapToast(null);
      mapToastTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(
    () => () => {
      if (mapToastTimerRef.current) clearTimeout(mapToastTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (params.captainCancelled !== "1" || captainCancelToastShownRef.current) return;
    captainCancelToastShownRef.current = true;
    showMapToast(
      RIDE_CAPTAIN_CANCELLED_TOAST.title,
      RIDE_CAPTAIN_CANCELLED_TOAST.message,
      4500
    );
  }, [params.captainCancelled, showMapToast]);

  const showSearchTimeoutApology = useCallback(() => {
    if (timeoutApologyShownRef.current) return;
    timeoutApologyShownRef.current = true;
    setPhase("cancelled");
    setTimeoutSheetVisible(false);
    setTripDetailsVisible(false);
    dismissAfterSearchTimeout();
    Alert.alert(SEARCH_TIMEOUT_APOLOGY.title, SEARCH_TIMEOUT_APOLOGY.message, [{ text: "OK" }]);
  }, [dismissAfterSearchTimeout]);

  const finalizeRideCancelledLocally = useCallback(
    (id: string) => {
      clearActiveRideOrder(id);
      purgeRideOrderFromClientCaches(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      showSearchTimeoutApology();
    },
    [queryClient, showSearchTimeoutApology]
  );

  const autoCancelAfterSearchTimeout = useCallback(
    async (
      id: string,
      options?: {
        reasonCode?: string;
        reasonText?: string;
      }
    ) => {
      if (timeoutApologyShownRef.current) return;
      cancelledRef.current = true;
      clearRideSearchTimer(id);
      setTimeoutSheetVisible(false);
      tipBoostExpiresAtRef.current = null;
      clearActiveRideOrder(id);
      purgeRideOrderFromClientCaches(queryClient, id);
      try {
        await cancelRideOrder(id, {
          cancelMode: "timeout",
          reasonCode: options?.reasonCode ?? "RIDER_SEARCH_TIMEOUT",
          reasonText:
            options?.reasonText ?? "No rider accepted within the search window",
        });
      } catch {
        /* server may have cancelled already */
      }
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      showSearchTimeoutApology();
    },
    [queryClient, showSearchTimeoutApology]
  );

  const beginTipBoostDecision = useCallback((expiresAt: string) => {
    tipBoostExpiresAtRef.current = expiresAt;
    setTipBoostDecisionRemainingSec(
      remainingSecFromExpiresAt(expiresAt, RIDE_TIP_BOOST_DECISION_SEC)
    );
    searchWindowEndedRef.current = true;
    setPhase("tip_boost");
    setTimeoutSheetVisible(true);
  }, []);

  const returnToRideHome = useCallback(() => {
    router.replace("/home/service/ride");
  }, [router]);

  const openLiveRideTracking = useCallback(
    (assignedOrderId: string) => {
      const trackingParams: Record<string, string> = { id: assignedOrderId };
      if (openedFromRideHome) trackingParams.returnTo = "ride";
      router.replace({
        pathname: "/orders/[id]",
        params: trackingParams,
      });
    },
    [router, openedFromRideHome]
  );

  const tryOpenLiveRideTracking = useCallback(
    async (assignedOrderId: string) => {
      if (navigatedToLiveRef.current || cancelledRef.current) return;
      navigatedToLiveRef.current = true;
      rememberActivePersonRide(assignedOrderId);
      useOrderStore.getState().addActiveOrder({
        orderId: assignedOrderId,
        status: "ORDER_PLACED",
        etaMinutes: 0,
        storeId: null,
        storeName: null,
        placedAt: Date.now(),
        serviceType: "ride",
      });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      clearRideSearchTimer(assignedOrderId);

      // Hydrate captain profile BEFORE tracking screen paints — do not wait for map/WS/GPS.
      try {
        const [detail, rideStatus] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ["order", assignedOrderId],
            queryFn: () => orderService.getOrder(assignedOrderId),
          }),
          getRideOrderStatus(assignedOrderId).catch(() => null),
        ]);
        if (rideStatus?.rider && !detail?.rider) {
          seedOrderDetailCache(queryClient, assignedOrderId, {
            orderId: assignedOrderId,
            status: detail?.status ?? "RIDER_ASSIGNED",
            rider: rideStatus.rider,
          });
        }
      } catch {
        // Still open tracking; RideAcceptedTrackingScreen will refetch.
      }

      openLiveRideTracking(assignedOrderId);
    },
    [openLiveRideTracking, queryClient]
  );

  const handleSearchWindowEnded = useCallback(async () => {
    if (cancelledRef.current || !orderId) return;

    // After tip-boost extension window ends, always auto-cancel — never re-open tip sheet.
    if (searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS) {
      if (!searchWindowEndedRef.current) {
        searchWindowEndedRef.current = true;
        setTimeoutSheetVisible(false);
        await autoCancelAfterSearchTimeout(orderId);
      }
      return;
    }

    if (searchWindowEndedRef.current) return;

    try {
      const status = await getRideOrderStatus(orderId);
      searchExtensionsUsedRef.current = status.dispatchRetryCount ?? searchExtensionsUsedRef.current;

      if (status.cancelled) {
        cancelledRef.current = true;
        clearRideSearchTimer(orderId);
        setTimeoutSheetVisible(false);
        finalizeRideCancelledLocally(orderId);
        return;
      }
      if (isRideCaptainAssigned(status)) {
        tryOpenLiveRideTracking(status.orderId);
        return;
      }
      const retryCount = status.dispatchRetryCount ?? 0;
      if (retryCount >= RIDE_MAX_SEARCH_EXTENSIONS) {
        searchWindowEndedRef.current = true;
        setTimeoutSheetVisible(false);
        await autoCancelAfterSearchTimeout(orderId);
        return;
      }
    } catch {
      if (searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS) {
        searchWindowEndedRef.current = true;
        setTimeoutSheetVisible(false);
        await autoCancelAfterSearchTimeout(orderId);
        return;
      }
    }

    if (timeoutSheetVisible) return;
    try {
      const result = await markRideSearchWindowEnded(orderId);
      const expiresAt =
        result.searchExpiresAt ??
        new Date(Date.now() + RIDE_TIP_BOOST_DECISION_SEC * 1000).toISOString();
      beginTipBoostDecision(expiresAt);
    } catch {
      beginTipBoostDecision(
        new Date(Date.now() + RIDE_TIP_BOOST_DECISION_SEC * 1000).toISOString()
      );
    }
  }, [
    orderId,
    timeoutSheetVisible,
    tryOpenLiveRideTracking,
    autoCancelAfterSearchTimeout,
    finalizeRideCancelledLocally,
    beginTipBoostDecision,
  ]);

  const resumeSearchAfterExtension = useCallback(
    (extensionSec: number, expiresAt: string, dispatchRetryCount: number) => {
      setTimeoutSheetVisible(false);
      tipBoostExpiresAtRef.current = null;
      searchWindowEndedRef.current = false;
      searchExtensionsUsedRef.current = Math.max(
        searchExtensionsUsedRef.current,
        dispatchRetryCount
      );
      searchExpiresAtRef.current = expiresAt;
      setSearchTimeoutSec(extensionSec);
      setRemainingSec(remainingSecFromExpiresAt(expiresAt, extensionSec));
      setTimerReady(true);
      if (orderId) {
        rememberRideSearchTimer(orderId, expiresAt, extensionSec);
      }
      setPhase("searching");
    },
    [orderId]
  );

  const handleExtendSearch = useCallback(
    async (tipAmount: number) => {
      if (!orderId || tipBoostLoadingAction) return;
      const action: TipBoostLoadingAction = tipAmount > 0 ? "add_tip" : "continue";
      setTipBoostLoadingAction(action);
      try {
        const result = await extendRideSearch(orderId, { tipAmount });
        setActiveTipAmount(result.customerTipAmount);
        resumeSearchAfterExtension(
          result.extensionSec,
          result.searchExpiresAt,
          result.dispatchRetryCount
        );
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (err as Error)?.message ??
          "Could not extend search. Please try again.";
        Alert.alert("Something went wrong", message);
      } finally {
        setTipBoostLoadingAction(null);
      }
    },
    [orderId, tipBoostLoadingAction, resumeSearchAfterExtension]
  );

  const handleContinueWithoutTip = useCallback(() => {
    void handleExtendSearch(0);
  }, [handleExtendSearch]);

  useEffect(() => {
    if (!isResumeMode) return;

    const existingOrderId = params.orderId!.trim();
    let cancelled = false;

    Promise.all([orderService.getOrder(existingOrderId), getRideOrderStatus(existingOrderId)])
      .then(([order, status]) => {
        if (cancelled) return;

        const tipAmount = Math.max(
          0,
          Number(status.customerTipAmount ?? order.tipAmount ?? 0)
        );
        const orderGrandTotal = Math.max(0, Number(order.totalAmount ?? 0) - tipAmount);
        const baseFare =
          orderGrandTotal > 0
            ? orderGrandTotal
            : status.estimatedFare != null &&
                Number.isFinite(status.estimatedFare) &&
                status.estimatedFare > 0
              ? status.estimatedFare
              : 0;
        const imageKey = resolveRideCatalogImageKey(order.rideType);

        const quotedKm = resolveRideFareDistanceKm({
          params,
          tripStateKm: tripKm,
          orderDistanceKm:
            order.distanceKm != null ? Number(order.distanceKm) : null,
        });

        const resumeLabels = rideLabelsFromCheckoutMetadata(
          order.checkoutMetadata as Record<string, unknown> | undefined
        );

        setTripState({
          pickupAddress: order.merchantAddress?.trim() || pickupAddress,
          dropAddress: order.deliveryAddress?.trim() || dropAddress,
          pickupLabel:
            resumeLabels.pickupLabel ||
            resolvePlaceDisplayName({
              fullAddress: order.merchantAddress?.trim() || pickupAddress,
            }),
          dropLabel:
            resumeLabels.dropLabel ||
            resolvePlaceDisplayName({
              fullAddress: order.deliveryAddress?.trim() || dropAddress,
            }),
          pickupLat: order.pickupLat ?? pickupLat,
          pickupLng: order.pickupLng ?? pickupLng,
          dropLat: order.deliveryLat ?? dropLat,
          dropLng: order.deliveryLng ?? dropLng,
          rideTypeId: order.rideType?.trim() || rideTypeId,
          rideName: getRideServiceLabel(order.rideType),
          rideImageKey: imageKey,
          fare: baseFare,
          tripKm: quotedKm,
        });
        setActiveTipAmount(tipAmount);
        searchExtensionsUsedRef.current = status.dispatchRetryCount ?? 0;

        if (status.cancelled) {
          clearRideSearchTimer(existingOrderId);
          cancelledRef.current = true;
          finalizeRideCancelledLocally(existingOrderId);
          return;
        }

        if (isRideCaptainAssigned(status)) {
          tryOpenLiveRideTracking(status.orderId);
          return;
        }

        if (status.awaitingTipBoost) {
          if (searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS) {
            void autoCancelAfterSearchTimeout(existingOrderId);
            return;
          }
          const tipBoostExpired =
            status.searchExpiresAt != null &&
            remainingSecFromExpiresAt(status.searchExpiresAt, 0) <= 0;
          if (tipBoostExpired) {
            void autoCancelAfterSearchTimeout(existingOrderId, {
              reasonCode: "TIP_BOOST_DECISION_TIMEOUT",
              reasonText: "No response on search options within 1.5 minutes",
            });
            return;
          }
          beginTipBoostDecision(
            status.searchExpiresAt ??
              new Date(Date.now() + RIDE_TIP_BOOST_DECISION_SEC * 1000).toISOString()
          );
        } else {
          setPhase("searching");
        }

        if (status.searchExpiresAt && !status.awaitingTipBoost) {
          searchExpiresAtRef.current = status.searchExpiresAt;
          const left = remainingSecFromExpiresAt(
            status.searchExpiresAt,
            RIDE_RIDER_SEARCH_TIMEOUT_SEC
          );
          const windowSec = Math.max(
            RIDE_RIDER_SEARCH_TIMEOUT_SEC,
            cachedSearchTimer?.windowSec ?? 0,
            left
          );
          setSearchTimeoutSec(windowSec);
          setRemainingSec(left);
          rememberRideSearchTimer(existingOrderId, status.searchExpiresAt, windowSec);

          if (
            searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS &&
            left <= 0 &&
            !isRideCaptainAssigned(status)
          ) {
            void autoCancelAfterSearchTimeout(existingOrderId);
            return;
          }
        }
        setTimerReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (err as Error)?.message ??
          "Could not load ride details.";
        setPlacementError(message);
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    isResumeMode,
    params.orderId,
    pickupAddress,
    dropAddress,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    rideTypeId,
    tripKm,
    router,
    returnToRideHome,
    tryOpenLiveRideTracking,
    cachedSearchTimer,
    autoCancelAfterSearchTimeout,
    finalizeRideCancelledLocally,
    beginTipBoostDecision,
  ]);

  useEffect(() => {
    if (placingRef.current || orderId) return;
    if (isResumeMode) return;

    const placementErrorMsg = validateRidePlacementCoords({
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      pickupAddress,
      dropAddress,
      stopsJson: params.stops,
    });
    if (placementErrorMsg) {
      setPlacementError(placementErrorMsg);
      setPhase("error");
      return;
    }

    const quotedTripKm = fareTripKm ?? tripKm;
    if (quotedTripKm == null || !Number.isFinite(quotedTripKm) || quotedTripKm <= 0) {
      setPlacementError("Route distance is missing. Go back and refresh ride options.");
      setPhase("error");
      return;
    }

    placingRef.current = true;
    let cancelled = false;

    placeRideOrder({
      pickupAddress: pickupAddress.trim(),
      pickupLabel: resolvePlaceDisplayName({
        primary: pickupLabel,
        fullAddress: pickupAddress,
      }),
      pickupLat: pickupLat!,
      pickupLng: pickupLng!,
      dropAddress: dropAddress.trim(),
      dropLabel: resolvePlaceDisplayName({
        primary: dropLabel,
        fullAddress: dropAddress,
      }),
      dropLat: dropLat!,
      dropLng: dropLng!,
      intermediateStops: stopsForApi.length > 0 ? stopsForApi : undefined,
      rideType: rideTypeId,
      estimatedFare: slabFareForPlacement,
      customerTipAmount: Number.isFinite(initialTipAmount) ? initialTipAmount : 0,
      tripKm: quotedTripKm,
      paymentMethod: "online",
      bookedForSelf: params.bookedForSelf !== "false",
      passengerName: params.passengerName ?? null,
      passengerPhone: params.passengerPhone ?? null,
      pickupDistanceFromBookerKm:
        params.pickupDistanceFromBookerKm != null
          ? Number(params.pickupDistanceFromBookerKm)
          : null,
      farPickupPromptShown: params.farPickupPromptShown === "true",
      farPickupAcknowledged: params.farPickupAcknowledged === "true",
      searchTimeoutSec: RIDE_RIDER_SEARCH_TIMEOUT_SEC,
      pickupPincode: params.pickupPincode?.trim() || undefined,
      pickupState: params.pickupState?.trim() || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setOrderId(result.orderId);
        trackActiveRideOrder(result.orderId);
        void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
        if (result.totalAmount != null && Number.isFinite(result.totalAmount) && result.totalAmount > 0) {
          setTripState((prev) => ({ ...prev, fare: Math.round(result.totalAmount) }));
        }
        searchExtensionsUsedRef.current = 0;
        searchWindowEndedRef.current = false;
        searchExpiresAtRef.current = result.searchExpiresAt;
        setSearchTimeoutSec(result.searchTimeoutSec);
        setRemainingSec(
          remainingSecFromExpiresAt(result.searchExpiresAt, result.searchTimeoutSec)
        );
        rememberRideSearchTimer(result.orderId, result.searchExpiresAt, result.searchTimeoutSec);
        setTimerReady(true);
        setPhase("searching");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const data = (err as { response?: { data?: { error?: string; message?: string; code?: string } } })
          ?.response?.data;
        const message =
          data?.code === "SERVICE_BLOCKED_IN_LOCATION" || data?.error === "SERVICE_BLOCKED_IN_LOCATION"
            ? data?.message ||
              "This service is temporarily unavailable in your current location. Please try again later or choose another nearby location."
            : data?.error ?? data?.message ?? (err as Error)?.message ?? "Could not place ride order.";
        setPlacementError(message);
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    orderId,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    pickupAddress,
    dropAddress,
    isResumeMode,
    params.bookedForSelf,
    params.passengerName,
    params.passengerPhone,
    params.pickupDistanceFromBookerKm,
    params.farPickupPromptShown,
    params.farPickupAcknowledged,
    stopsForApi,
    rideTypeId,
    slabFareForPlacement,
    initialTipAmount,
    tripKm,
    fareTripKm,
    params.pickupPincode,
  ]);

  useEffect(() => {
    if (phase !== "searching" || !searchExpiresAtRef.current) return;

    const syncRemaining = () => {
      const expiresAt = searchExpiresAtRef.current;
      if (!expiresAt) return;
      const left = remainingSecFromExpiresAt(expiresAt, 0);
      setRemainingSec(left);
      if (left <= 0) {
        void handleSearchWindowEnded();
      }
    };

    syncRemaining();
    const timer = setInterval(syncRemaining, 1000);
    return () => clearInterval(timer);
  }, [phase, handleSearchWindowEnded]);

  useEffect(() => {
    if (phase !== "tip_boost" || !timeoutSheetVisible || !orderId) return;

    const syncTipBoostDecision = () => {
      const expiresAt = tipBoostExpiresAtRef.current;
      if (!expiresAt) return;
      const left = remainingSecFromExpiresAt(expiresAt, 0);
      setTipBoostDecisionRemainingSec(left);
      if (left <= 0 && !timeoutApologyShownRef.current && !cancelledRef.current) {
        void autoCancelAfterSearchTimeout(orderId, {
          reasonCode: "TIP_BOOST_DECISION_TIMEOUT",
          reasonText: "No response on search options within 1.5 minutes",
        });
      }
    };

    syncTipBoostDecision();
    const timer = setInterval(syncTipBoostDecision, 1000);
    return () => clearInterval(timer);
  }, [phase, timeoutSheetVisible, orderId, autoCancelAfterSearchTimeout]);

  const syncRideSearchStatus = useCallback(async () => {
    if (!orderId || navigatedToLiveRef.current || cancelledRef.current) return;

    try {
      const status = await getRideOrderStatus(orderId);
      setDispatchDeclinedCount(status.dispatchDeclinedCount ?? 0);

      if (isRideCaptainAssigned(status)) {
        tryOpenLiveRideTracking(status.orderId);
        return;
      }

      if (status.cancelled) {
        clearRideSearchTimer(orderId);
        cancelledRef.current = true;
        setTimeoutSheetVisible(false);
        finalizeRideCancelledLocally(orderId);
        return;
      }

      if (status.awaitingTipBoost && !timeoutSheetVisible) {
        if (searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS) {
          void autoCancelAfterSearchTimeout(orderId);
          return;
        }
        const tipBoostExpired =
          status.searchExpiresAt != null &&
          remainingSecFromExpiresAt(status.searchExpiresAt, 0) <= 0;
        if (tipBoostExpired) {
          void autoCancelAfterSearchTimeout(orderId, {
            reasonCode: "TIP_BOOST_DECISION_TIMEOUT",
            reasonText: "No response on search options within 1.5 minutes",
          });
          return;
        }
        beginTipBoostDecision(
          status.searchExpiresAt ??
            new Date(Date.now() + RIDE_TIP_BOOST_DECISION_SEC * 1000).toISOString()
        );
        if (status.customerTipAmount != null) {
          setActiveTipAmount(status.customerTipAmount);
        }
        return;
      }

      if (status.awaitingTipBoost && timeoutSheetVisible) {
        if (status.searchExpiresAt) {
          tipBoostExpiresAtRef.current = status.searchExpiresAt;
        }
        const tipBoostExpired =
          status.searchExpiresAt != null &&
          remainingSecFromExpiresAt(status.searchExpiresAt, 0) <= 0;
        if (tipBoostExpired) {
          void autoCancelAfterSearchTimeout(orderId, {
            reasonCode: "TIP_BOOST_DECISION_TIMEOUT",
            reasonText: "No response on search options within 1.5 minutes",
          });
        }
        return;
      }

      searchExtensionsUsedRef.current = status.dispatchRetryCount ?? searchExtensionsUsedRef.current;

      const retryCount = status.dispatchRetryCount ?? 0;
      const searchExpired =
        status.searchExpiresAt != null &&
        remainingSecFromExpiresAt(status.searchExpiresAt, 0) <= 0;

      if (
        phase === "searching" &&
        !status.awaitingTipBoost &&
        !isRideCaptainAssigned(status) &&
        !status.cancelled &&
        searchExpired &&
        (retryCount >= RIDE_MAX_SEARCH_EXTENSIONS ||
          searchExtensionsUsedRef.current >= RIDE_MAX_SEARCH_EXTENSIONS)
      ) {
        void autoCancelAfterSearchTimeout(orderId);
        return;
      }

      if (status.searchExpiresAt && phase === "searching") {
        searchExpiresAtRef.current = status.searchExpiresAt;
        rememberRideSearchTimer(orderId, status.searchExpiresAt, searchTimeoutSec);
      }
    } catch {
      /* ignore transient poll errors */
    }
  }, [
    orderId,
    phase,
    timeoutSheetVisible,
    tryOpenLiveRideTracking,
    searchTimeoutSec,
    autoCancelAfterSearchTimeout,
    finalizeRideCancelledLocally,
    beginTipBoostDecision,
  ]);

  useEffect(() => {
    if (!orderId || phase === "placing" || phase === "cancelled" || phase === "error") return;

    void syncRideSearchStatus();
    const poll = setInterval(() => {
      void syncRideSearchStatus();
    }, RIDE_SEARCH_POLL_MS);

    return () => clearInterval(poll);
  }, [orderId, phase, syncRideSearchStatus]);

  useEffect(() => {
    if (!orderId || phase === "placing" || phase === "cancelled" || phase === "error") return;

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void syncRideSearchStatus();
      }
    });
    return () => sub.remove();
  }, [orderId, phase, syncRideSearchStatus]);

  const handleTipBoostCancel = useCallback(() => {
    setTimeoutSheetVisible(false);
    setCancelFlowStep("reason");
  }, []);

  const openCancelFlow = useCallback(() => {
    setTripDetailsVisible(false);
    setCancelFlowStep("reason");
  }, []);

  const closeCancelFlow = useCallback(() => {
    setCancelFlowStep(null);
    setSelectedCancelReason(null);
    setCancelLoading(false);
  }, []);

  const executeCancelRide = useCallback(async () => {
    if (cancelledRef.current || cancelLoading) return;
    cancelledRef.current = true;
    setCancelLoading(true);
    setPhase("cancelled");
    setTripDetailsVisible(false);
    setTimeoutSheetVisible(false);
    closeCancelFlow();

    if (orderId) {
      purgeRideOrderFromClientCaches(queryClient, orderId);
      try {
        await cancelRideOrder(orderId, {
          reasonCode: selectedCancelReason?.id ?? "CUSTOMER_CANCELLED",
          reasonText: selectedCancelReason?.label ?? "Customer cancelled while searching for rider",
          cancelMode: "manual",
        });
      } catch {
        /* best-effort */
      }
      clearRideSearchTimer(orderId);
      clearActiveRideOrder(orderId);
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
    }

    showMapToast(
      RIDE_CUSTOMER_CANCELLED_TOAST.title,
      RIDE_CUSTOMER_CANCELLED_TOAST.message,
      5000
    );
    await new Promise((resolve) => setTimeout(resolve, 4500));
    returnToRideHome();
  }, [cancelLoading, orderId, selectedCancelReason, closeCancelFlow, returnToRideHome, showMapToast, queryClient]);

  const handleBack = useCallback(() => {
    if (cancelFlowStep != null) {
      closeCancelFlow();
      return;
    }
    if (tripDetailsVisible) {
      setTripDetailsVisible(false);
      return;
    }
    if (shareSheetVisible) {
      setShareSheetVisible(false);
      return;
    }
    if (timeoutSheetVisible) {
      setTimeoutSheetVisible(false);
      return;
    }
    if (openedFromRideHome || isResumeMode) {
      returnToRideHome();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    returnToRideHome();
  }, [
    cancelFlowStep,
    tripDetailsVisible,
    shareSheetVisible,
    timeoutSheetVisible,
    closeCancelFlow,
    openedFromRideHome,
    isResumeMode,
    router,
    returnToRideHome,
  ]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleCancelRide = openCancelFlow;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapSection}>
        <RideSearchingMap
          center={mapCenter}
          nearbyRiders={nearbyRiders}
          riderMarkerImageKey={riderMarkerImageKey}
          bottomMapPadding={mapBottomPadding}
          style={StyleSheet.absoluteFill}
        />

        <Pressable
          style={[styles.backFab, { top: insets.top + 8 }]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>

        <RideMapToast
          visible={mapToast != null}
          title={mapToast?.title ?? ""}
          message={mapToast?.message}
          topInset={insets.top}
        />
      </View>

      <View style={styles.sheetHost}>
        {phase !== "cancelled" ? (
          <RideSearchingBottomSheet
            phase={sheetPhase}
            title={sheetTitle}
            subtitle={sheetSubtitle}
            elapsedLabel={
              timerReady && phase !== "error" && phase !== "tip_boost"
                ? formatElapsedSec(elapsedSec)
                : undefined
            }
            fare={totalFare}
            rideImage={rideImage}
            rideName={rideName}
            pickupLabel={pickupLabel}
            dropLabel={dropLabel}
            tripKm={fareTripKm ?? tripKm}
            pickupDistanceKm={pickupDistanceKm}
            routeEtaMins={routeEtaMins}
            nearbyRidersCount={nearbyRiders.length}
            activeMitraSathiCount={activeMitraSathiCount}
            dispatchDeclinedCount={dispatchDeclinedCount}
            showFastestTag={showFastestTag}
            placementError={placementError}
            bottomInset={insets.bottom}
            onTripDetails={() => setTripDetailsVisible(true)}
            onShareTrip={() => setShareSheetVisible(true)}
            shareTripEnabled={Boolean(orderId)}
            onRetry={returnToRideBook}
            onCancelRide={handleCancelRide}
            showCancel={phase === "searching" || phase === "tip_boost"}
          />
        ) : null}
      </View>

      <RideTipBoostSheet
        visible={timeoutSheetVisible}
        loadingAction={tipBoostLoadingAction}
        decisionRemainingSec={tipBoostDecisionRemainingSec}
        orderTotal={fare}
        existingTipAmount={activeTipAmount}
        heroImage={rideImage ?? undefined}
        onAddTipAndContinue={(tip) => void handleExtendSearch(tip)}
        onContinueWithoutTip={handleContinueWithoutTip}
        onCancelOrder={handleTipBoostCancel}
      />

      <RideTripShareSheet
        visible={shareSheetVisible}
        orderId={orderId ?? ""}
        onClose={() => setShareSheetVisible(false)}
      />

      <RideSearchingTripDetailsSheet
        visible={tripDetailsVisible}
        rideName={rideName}
        rideImage={rideImage}
        pickupAddress={pickupLabel || pickupAddress || "—"}
        dropAddress={dropLabel || dropAddress || "—"}
        stops={stops.map((_, index) => ({ label: `Stop ${index + 1}` }))}
        totalFare={totalFare}
        tipAmount={activeTipAmount}
        onBack={() => setTripDetailsVisible(false)}
        onCancelRide={openCancelFlow}
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
        heroImage={rideImage ?? undefined}
        onConfirm={() => void executeCancelRide()}
        onKeepSearching={closeCancelFlow}
        onClose={closeCancelFlow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapSection: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
    zIndex: 0,
  },
  sheetHost: {
    width: "100%",
    zIndex: 2,
  },
  backFab: {
    position: "absolute",
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
});
