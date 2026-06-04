/**
 * Customer waits for rider assignment after confirming pickup (Rapido-style).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  useWindowDimensions,
  BackHandler,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RideSearchingMap } from "@/components/maps/RideSearchingMap";
import { RideSearchingBottomSheet } from "@/features/ride/RideSearchingBottomSheet";
import { resolvePlaceDisplayName } from "@/services/location.service";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { RIDE_RIDER_SEARCH_TIMEOUT_SEC } from "@/features/ride/rideOptions";
import { RideTipBoostSheet } from "@/features/ride/RideSearchTimeoutSheet";
import { RideSearchingTripDetailsSheet } from "@/features/ride/RideSearchingTripDetailsSheet";
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
  cancelRideOrder,
  markRideSearchWindowEnded,
  extendRideSearch,
} from "@/services/rideBooking.service";
import { orderService } from "@/services/order.service";
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
import { RIDE_MAX_SEARCH_EXTENSIONS } from "@/lib/ride-search-extensions";

type SearchPhase = "placing" | "searching" | "tip_boost" | "assigned" | "timeout" | "cancelled" | "error";
type CancelFlowStep = null | "reason" | "confirm";

type TripState = {
  pickupAddress: string;
  dropAddress: string;
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
  pickupLat?: string;
  pickupLng?: string;
  dropLat?: string;
  dropLng?: string;
  selectedRideId?: string;
  selectedRideName?: string;
  selectedRideImageKey?: string;
  estimatedFare?: string;
  tripKm?: string;
}): TripState {
  return {
    pickupAddress: String(params.pickup ?? ""),
    dropAddress: String(params.drop ?? ""),
    pickupLat: params.pickupLat != null ? Number(params.pickupLat) : null,
    pickupLng: params.pickupLng != null ? Number(params.pickupLng) : null,
    dropLat: params.dropLat != null ? Number(params.dropLat) : null,
    dropLng: params.dropLng != null ? Number(params.dropLng) : null,
    rideTypeId: String(params.selectedRideId ?? ""),
    rideName: String(params.selectedRideName ?? "Ride"),
    rideImageKey: String(params.selectedRideImageKey ?? "bike"),
    fare: params.estimatedFare != null ? Number(params.estimatedFare) : 0,
    tripKm: params.tripKm != null ? Number(params.tripKm) : undefined,
  };
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function RideSearchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapBottomPadding = Math.min(520, Math.max(300, Math.round(windowHeight * 0.46)));

  const params = useLocalSearchParams<{
    pickup?: string;
    drop?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropLat?: string;
    dropLng?: string;
    stops?: string;
    selectedRideId?: string;
    selectedRideName?: string;
    selectedRideImageKey?: string;
    estimatedFare?: string;
    tripKm?: string;
    orderId?: string;
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
    pickupDistanceFromBookerKm?: string;
    farPickupPromptShown?: string;
    farPickupAcknowledged?: string;
    customerTipAmount?: string;
  }>();

  const [tripState, setTripState] = useState(() => buildTripStateFromParams(params));
  const {
    pickupAddress,
    dropAddress,
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
  const rideImage = resolveRideImage(rideImageKey);
  const initialTipAmount =
    params.customerTipAmount != null ? Math.max(0, Number(params.customerTipAmount)) : 0;
  const [activeTipAmount, setActiveTipAmount] = useState(initialTipAmount);
  const totalFare = fare + (Number.isFinite(activeTipAmount) ? activeTipAmount : 0);
  const stops = useMemo(() => parseRideStopsParam(params.stops), [params.stops]);
  const stopsForApi = useMemo(() => parseRideStopsForOrder(params.stops), [params.stops]);
  const shouldHydrateFromOrder = Boolean(params.orderId?.trim() && !params.pickup?.trim());
  const resumeOrderId = params.orderId?.trim() ?? "";
  const cachedSearchTimer = resumeOrderId ? readRideSearchTimer(resumeOrderId) : null;

  const pickupLabel = resolvePlaceDisplayName({
    primary: pickupAddress,
    fullAddress: pickupAddress,
  });

  const [phase, setPhase] = useState<SearchPhase>(() =>
    cachedSearchTimer && resumeOrderId ? "searching" : "placing"
  );
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
  const [timerReady, setTimerReady] = useState(Boolean(cachedSearchTimer) || !shouldHydrateFromOrder);
  const [timeoutSheetVisible, setTimeoutSheetVisible] = useState(false);
  const [tipBoostLoading, setTipBoostLoading] = useState(false);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const [cancelFlowStep, setCancelFlowStep] = useState<CancelFlowStep>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const placingRef = useRef(false);
  const resumeHydratedRef = useRef(false);
  const searchWindowEndedRef = useRef(false);

  const progress = 1 - remainingSec / Math.max(1, searchTimeoutSec);

  const mapCenter = useMemo(() => {
    if (pickupLat != null && pickupLng != null) {
      return { latitude: pickupLat, longitude: pickupLng };
    }
    return { latitude: 24.7969, longitude: 84.9914 };
  }, [pickupLat, pickupLng]);

  const { data: availability } = useNearbyRideAvailability(pickupLat, pickupLng);

  const nearbyRiders = useMemo(() => {
    const all = availability?.riders ?? [];
    const selectedOption = availability?.options?.find((o) => o.id === rideTypeId);
    if (!selectedOption?.vehicleTypes?.length) return all;
    const allowed = new Set(selectedOption.vehicleTypes);
    return all.filter((rider) => {
      const types = rider.vehicleTypes?.length ? rider.vehicleTypes : [rider.vehicleType];
      return types.some((type) => allowed.has(type));
    });
  }, [availability, rideTypeId]);

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
      : "Please wait while we match you with a nearby rider.";

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

  const autoCancelAfterSearchTimeout = useCallback(
    async (id: string) => {
      cancelledRef.current = true;
      clearRideSearchTimer(id);
      setTimeoutSheetVisible(false);
      try {
        await cancelRideOrder(id, {
          cancelMode: "timeout",
          reasonCode: "RIDER_SEARCH_TIMEOUT",
          reasonText: "No rider accepted within the search window",
        });
      } catch {
        /* server may have cancelled already */
      }
      setPhase("cancelled");
      Alert.alert(
        "No rider available",
        "We couldn't find a rider this time. Please try booking again.",
        [{ text: "OK", onPress: returnToRideBook }]
      );
    },
    [returnToRideBook]
  );

  const handleSearchWindowEnded = useCallback(async () => {
    if (cancelledRef.current || searchWindowEndedRef.current) return;
    if (!orderId) return;

    try {
      const status = await getRideOrderStatus(orderId);
      if (status.cancelled) {
        cancelledRef.current = true;
        clearRideSearchTimer(orderId);
        setTimeoutSheetVisible(false);
        setPhase("cancelled");
        Alert.alert(
          "No rider available",
          "We couldn't find a rider this time. Please try booking again.",
          [{ text: "OK", onPress: returnToRideBook }]
        );
        return;
      }
      if (status.riderAssigned) {
        clearRideSearchTimer(orderId);
        setPhase("assigned");
        router.replace({
          pathname: "/orders/[id]",
          params: { id: status.orderId },
        });
        return;
      }
      const retryCount = status.dispatchRetryCount ?? 0;
      if (retryCount >= RIDE_MAX_SEARCH_EXTENSIONS) {
        searchWindowEndedRef.current = true;
        await autoCancelAfterSearchTimeout(orderId);
        return;
      }
    } catch {
      /* fall through to tip sheet */
    }

    if (timeoutSheetVisible) return;
    searchWindowEndedRef.current = true;
    setPhase("tip_boost");
    setTimeoutSheetVisible(true);
    try {
      await markRideSearchWindowEnded(orderId);
    } catch {
      /* best-effort */
    }
  }, [
    orderId,
    timeoutSheetVisible,
    router,
    returnToRideBook,
    autoCancelAfterSearchTimeout,
  ]);

  const resumeSearchAfterExtension = useCallback((extensionSec: number, expiresAt: string) => {
    setTimeoutSheetVisible(false);
    searchWindowEndedRef.current = false;
    searchExpiresAtRef.current = expiresAt;
    setSearchTimeoutSec(extensionSec);
    setRemainingSec(remainingSecFromExpiresAt(expiresAt, extensionSec));
    setTimerReady(true);
    if (orderId) {
      rememberRideSearchTimer(orderId, expiresAt, extensionSec);
    }
    setPhase("searching");
  }, [orderId]);

  const handleExtendSearch = useCallback(
    async (tipAmount: number) => {
      if (!orderId || tipBoostLoading) return;
      setTipBoostLoading(true);
      try {
        const result = await extendRideSearch(orderId, { tipAmount });
        setActiveTipAmount(result.customerTipAmount);
        resumeSearchAfterExtension(result.extensionSec, result.searchExpiresAt);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (err as Error)?.message ??
          "Could not extend search. Please try again.";
        Alert.alert("Something went wrong", message);
      } finally {
        setTipBoostLoading(false);
      }
    },
    [orderId, tipBoostLoading, resumeSearchAfterExtension]
  );

  const handleContinueWithoutTip = useCallback(() => {
    void handleExtendSearch(0);
  }, [handleExtendSearch]);

  const returnToRideHome = useCallback(() => {
    router.replace("/home/service/ride");
  }, [router]);

  useEffect(() => {
    if (!shouldHydrateFromOrder || resumeHydratedRef.current) return;

    const existingOrderId = params.orderId!.trim();
    resumeHydratedRef.current = true;
    let cancelled = false;

    Promise.all([orderService.getOrder(existingOrderId), getRideOrderStatus(existingOrderId)])
      .then(([order, status]) => {
        if (cancelled) return;

        const tipAmount = Math.max(
          0,
          Number(status.customerTipAmount ?? order.tipAmount ?? 0)
        );
        const baseFare =
          status.estimatedFare != null && Number.isFinite(status.estimatedFare) && status.estimatedFare > 0
            ? status.estimatedFare
            : Math.max(0, Number(order.totalAmount ?? 0) - tipAmount);
        const imageKey = resolveRideCatalogImageKey(order.rideType);

        setTripState({
          pickupAddress: order.merchantAddress?.trim() || pickupAddress,
          dropAddress: order.deliveryAddress?.trim() || dropAddress,
          pickupLat: order.pickupLat ?? pickupLat,
          pickupLng: order.pickupLng ?? pickupLng,
          dropLat: order.deliveryLat ?? dropLat,
          dropLng: order.deliveryLng ?? dropLng,
          rideTypeId: order.rideType?.trim() || rideTypeId,
          rideName: getRideServiceLabel(order.rideType),
          rideImageKey: imageKey,
          fare: baseFare,
          tripKm:
            order.distanceKm != null && Number.isFinite(Number(order.distanceKm))
              ? Number(order.distanceKm)
              : tripKm,
        });
        setActiveTipAmount(tipAmount);

        if (status.cancelled) {
          clearRideSearchTimer(existingOrderId);
          cancelledRef.current = true;
          setPhase("cancelled");
          Alert.alert(
            "No rider available",
            "We couldn't find a rider this time. Please try booking again.",
            [{ text: "OK", onPress: returnToRideHome }]
          );
          return;
        }

        if (status.riderAssigned) {
          clearRideSearchTimer(existingOrderId);
          setPhase("assigned");
          router.replace({
            pathname: "/orders/[id]",
            params: { id: status.orderId },
          });
          return;
        }

        if (status.awaitingTipBoost) {
          setPhase("tip_boost");
          setTimeoutSheetVisible(true);
        } else {
          setPhase("searching");
        }

        if (status.searchExpiresAt) {
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
    shouldHydrateFromOrder,
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
    cachedSearchTimer,
  ]);

  useEffect(() => {
    if (placingRef.current || orderId) return;
    if (shouldHydrateFromOrder) return;

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

    placingRef.current = true;
    let cancelled = false;

    placeRideOrder({
      pickupAddress: pickupAddress.trim(),
      pickupLat,
      pickupLng,
      dropAddress: dropAddress.trim(),
      dropLat,
      dropLng,
      intermediateStops: stopsForApi.length > 0 ? stopsForApi : undefined,
      rideType: rideTypeId,
      estimatedFare: Number.isFinite(fare) ? fare : 0,
      customerTipAmount: Number.isFinite(initialTipAmount) ? initialTipAmount : 0,
      tripKm,
      paymentMethod: "cash",
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
    })
      .then((result) => {
        if (cancelled) return;
        setOrderId(result.orderId);
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
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (err as Error)?.message ??
          "Could not place ride order.";
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
    shouldHydrateFromOrder,
    params.bookedForSelf,
    params.passengerName,
    params.passengerPhone,
    params.pickupDistanceFromBookerKm,
    params.farPickupPromptShown,
    params.farPickupAcknowledged,
    stopsForApi,
    rideTypeId,
    fare,
    initialTipAmount,
    tripKm,
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
    if ((phase !== "searching" && phase !== "tip_boost") || !orderId) return;

    const poll = setInterval(() => {
      getRideOrderStatus(orderId)
        .then((status) => {
          if (status.awaitingTipBoost && !timeoutSheetVisible) {
            setPhase("tip_boost");
            setTimeoutSheetVisible(true);
            if (status.customerTipAmount != null) {
              setActiveTipAmount(status.customerTipAmount);
            }
            return;
          }
          const retryCount = status.dispatchRetryCount ?? 0;
          if (
            phase === "searching" &&
            !status.awaitingTipBoost &&
            !status.riderAssigned &&
            !status.cancelled &&
            status.searchExpiresAt &&
            remainingSecFromExpiresAt(status.searchExpiresAt, 0) <= 0 &&
            retryCount >= RIDE_MAX_SEARCH_EXTENSIONS
          ) {
            void autoCancelAfterSearchTimeout(orderId);
            return;
          }
          if (status.cancelled) {
            clearRideSearchTimer(orderId);
            cancelledRef.current = true;
            setTimeoutSheetVisible(false);
            setPhase("cancelled");
            Alert.alert(
              "No rider available",
              "We couldn't find a rider this time. Please try booking again.",
              [{ text: "OK", onPress: returnToRideBook }]
            );
            return;
          }
          if (status.riderAssigned) {
            clearRideSearchTimer(orderId);
            setPhase("assigned");
            router.replace({
              pathname: "/orders/[id]",
              params: { id: status.orderId },
            });
            return;
          }
          if (status.searchExpiresAt && phase === "searching") {
            searchExpiresAtRef.current = status.searchExpiresAt;
            rememberRideSearchTimer(orderId, status.searchExpiresAt, searchTimeoutSec);
          }
        })
        .catch(() => {
          /* ignore transient poll errors */
        });
    }, 5000);

    return () => clearInterval(poll);
  }, [
    phase,
    orderId,
    router,
    timeoutSheetVisible,
    returnToRideBook,
    searchTimeoutSec,
    autoCancelAfterSearchTimeout,
  ]);

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
    }
    returnToRideHome();
  }, [cancelLoading, orderId, selectedCancelReason, closeCancelFlow, returnToRideHome]);

  const handleBack = useCallback(() => {
    if (cancelFlowStep != null) {
      closeCancelFlow();
      return;
    }
    if (tripDetailsVisible) {
      setTripDetailsVisible(false);
      return;
    }
    if (timeoutSheetVisible) {
      setTimeoutSheetVisible(false);
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
    timeoutSheetVisible,
    closeCancelFlow,
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
      </View>

      <View style={styles.sheetHost}>
        <RideSearchingBottomSheet
        phase={sheetPhase}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        countdownLabel={
          timerReady && phase !== "error" && phase !== "tip_boost"
            ? formatCountdown(remainingSec)
            : undefined
        }
        progress={progress}
        fare={totalFare}
        rideImage={rideImage}
        pickupLabel={pickupLabel}
        tripKm={tripKm}
        placementError={placementError}
        bottomInset={insets.bottom}
        onTripDetails={() => setTripDetailsVisible(true)}
        onRetry={returnToRideBook}
        onCancelRide={handleCancelRide}
        showCancel={phase === "searching" || phase === "tip_boost"}
        />
      </View>

      <RideTipBoostSheet
        visible={timeoutSheetVisible}
        loading={tipBoostLoading}
        orderTotal={fare}
        existingTipAmount={activeTipAmount}
        onAddTipAndContinue={(tip) => void handleExtendSearch(tip)}
        onContinueWithoutTip={handleContinueWithoutTip}
        onCancelOrder={handleTipBoostCancel}
      />

      <RideSearchingTripDetailsSheet
        visible={tripDetailsVisible}
        rideName={rideName}
        rideImage={rideImage}
        pickupAddress={pickupAddress || "—"}
        dropAddress={dropAddress || "—"}
        stops={stops.map((_, index) => ({ label: `Stop ${index + 1}` }))}
        totalFare={totalFare}
        tipAmount={activeTipAmount}
        paymentMethod="Cash"
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
    justifyContent: "flex-end",
  },
  mapSection: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 220,
    zIndex: 0,
  },
  sheetHost: {
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
