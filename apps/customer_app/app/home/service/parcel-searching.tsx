/**
 * Parcel booking → captain search.
 * Same layout as ride searching: full-bleed map + RideSearchingBottomSheet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, BackHandler, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { RideSearchingMap } from "@/components/maps/RideSearchingMap";
import { RideSearchingBottomSheet } from "@/features/ride/RideSearchingBottomSheet";
import { RideSearchingTripDetailsSheet } from "@/features/ride/RideSearchingTripDetailsSheet";
import { RideCancelReasonSheet } from "@/features/ride/RideCancelReasonSheet";
import { RideCancelConfirmSheet } from "@/features/ride/RideCancelConfirmSheet";
import { RideServiceUnavailableSheet } from "@/features/ride/RideServiceUnavailableSheet";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { placeParcelOrder, cancelParcelOrder } from "@/services/parcelBooking.service";
import { useParcelBookingStore } from "@/features/parcel/parcelBookingStore";
import { useOrderStore } from "@/store/orderStore";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import { parcelCategoryHasNearbySupply } from "@/features/parcel/parcelVehicleEta";
import type { ParcelVehicleCategoryCode } from "@/features/parcel/parcelGuidelinesConfig";
import { PARCEL_SEARCH_CANCEL_REASONS } from "@/lib/parcel-cancel-reasons";
import type { RideCancelReason } from "@/lib/ride-cancel-reasons";
import { useQueryClient } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import {
  isActiveOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import { getRideAvailability } from "@/services/rideAvailability.service";
import { haversineKm } from "@/lib/billSummary";
import { appAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import {
  clearRideSearchTimer,
  readRideSearchTimer,
  rememberRideSearchTimer,
  remainingSecFromExpiresAt,
} from "@/lib/ride-search-timer-cache";

const DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC = 4 * 60;

const SEARCH_TIMEOUT_APOLOGY = {
  title: "We're sorry",
  message:
    "We couldn't find a captain nearby right now. Your parcel has been cancelled. Please try again in a few minutes.",
} as const;

type CancelFlowStep = null | "reason" | "confirm";

function paramStr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function paramNum(value: string | string[] | undefined): number | undefined {
  const n = Number(paramStr(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function coordNum(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function ParcelSearchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    orderId?: string;
    returnTo?: string;
    vehicleId?: string;
    vehicleName?: string;
    imageKey?: string;
    fare?: string;
    tripKm?: string;
    routeEtaMins?: string;
    payAt?: string;
    paymentMethod?: string;
    selectedPlatformOfferId?: string;
    forceNoAutoOffer?: string;
    quotedGrandTotal?: string;
  }>();

  const resumeOrderId = paramStr(params.orderId);

  const pickup = useParcelBookingStore((s) => s.pickup);
  const drop = useParcelBookingStore((s) => s.drop);
  const receiver = useParcelBookingStore((s) => s.receiver);
  const setPickup = useParcelBookingStore((s) => s.setPickup);
  const setDrop = useParcelBookingStore((s) => s.setDrop);
  const setReceiver = useParcelBookingStore((s) => s.setReceiver);
  const setSearchInFlight = useParcelBookingStore((s) => s.setSearchInFlight);

  const [phase, setPhase] = useState<"placing" | "searching" | "error" | "cancelled">(
    resumeOrderId ? "searching" : "placing"
  );
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(resumeOrderId || null);
  const [resumeFare, setResumeFare] = useState(0);
  const [cancelFlowStep, setCancelFlowStep] = useState<CancelFlowStep>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const [apologySheetVisible, setApologySheetVisible] = useState(false);
  const placingRef = useRef(false);
  const placedOnceRef = useRef(false);
  const cancelledRef = useRef(false);
  const navigatedToLiveRef = useRef(false);
  const timeoutApologyShownRef = useRef(false);
  const searchExpiresAtRef = useRef<string | null>(
    resumeOrderId ? readRideSearchTimer(resumeOrderId)?.expiresAt ?? null : null
  );

  const fare = Math.max(0, Math.round(paramNum(params.fare) ?? 0));
  const quotedGrandTotal = Math.max(0, Math.round(paramNum(params.quotedGrandTotal) ?? 0));
  const displayFare =
    quotedGrandTotal > 0 ? quotedGrandTotal : fare > 0 ? fare : resumeFare;
  const selectedPlatformOfferId = paramNum(params.selectedPlatformOfferId);
  const forceNoAutoOffer = paramStr(params.forceNoAutoOffer) === "true";
  const paramTripKm = paramNum(params.tripKm);
  const etaMins = paramNum(params.routeEtaMins) ?? null;

  const vehicleCategory = (paramStr(params.vehicleId) || "2_wheeler") as ParcelVehicleCategoryCode;
  const vehicleName = paramStr(params.vehicleName) || "2 Wheeler";
  const imageKey = paramStr(params.imageKey) || "bike";
  const rideImage =
    imageKey === "van"
      ? appAssetSource(CX.home.serviceParcel)
      : resolveRideImage(imageKey === "auto" ? "auto" : "bike");

  const [fetchedPickupLabel, setFetchedPickupLabel] = useState("");
  const [fetchedDropLabel, setFetchedDropLabel] = useState("");
  const [fetchedTripKm, setFetchedTripKm] = useState<number | undefined>(undefined);

  const pickupLabel =
    pickup?.fullAddress?.trim() ||
    pickup?.primary?.trim() ||
    fetchedPickupLabel ||
    "Pickup";
  const dropLabel =
    drop?.fullAddress?.trim() || drop?.primary?.trim() || fetchedDropLabel || "Drop";

  const tripKm = useMemo(() => {
    if (paramTripKm != null && paramTripKm > 0) return paramTripKm;
    if (fetchedTripKm != null && fetchedTripKm > 0) return fetchedTripKm;
    if (pickup && drop) {
      const km = haversineKm(pickup.latitude, pickup.longitude, drop.latitude, drop.longitude);
      return km > 0 ? Math.round(km * 100) / 100 : undefined;
    }
    return undefined;
  }, [paramTripKm, fetchedTripKm, pickup, drop]);
  const mapCenter = useMemo(
    () =>
      pickup
        ? { latitude: pickup.latitude, longitude: pickup.longitude }
        : drop
          ? { latitude: drop.latitude, longitude: drop.longitude }
          : { latitude: 28.6139, longitude: 77.209 },
    [pickup, drop]
  );

  const { data: availability } = useNearbyRideAvailability(
    pickup?.latitude ?? null,
    pickup?.longitude ?? null,
    tripKm ?? null,
    { serviceType: "parcel" }
  );
  const nearbyRiders = availability?.riders ?? [];
  const pickupDistanceKm = useMemo(() => {
    const matched = nearbyRiders.filter((r) =>
      parcelCategoryHasNearbySupply([r], vehicleCategory)
    );
    const pool = matched.length > 0 ? matched : nearbyRiders;
    let nearest = Infinity;
    for (const r of pool) {
      const km = Number(r.distanceKm);
      if (Number.isFinite(km) && km >= 0 && km < nearest) nearest = km;
    }
    return Number.isFinite(nearest) && nearest < Infinity ? nearest : null;
  }, [nearbyRiders, vehicleCategory]);

  const goBackToBook = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/home/service/parcel-book" as never);
  }, [router]);

  const returnToParcelHome = useCallback(() => {
    router.replace("/home/service/parcels" as never);
  }, [router]);

  const openLiveParcelTracking = useCallback(
    (assignedOrderId: string) => {
      if (navigatedToLiveRef.current || cancelledRef.current) return;
      navigatedToLiveRef.current = true;
      clearRideSearchTimer(assignedOrderId);
      useParcelBookingStore.getState().setSearchInFlight(false);
      router.replace({
        pathname: "/orders/[id]",
        params: { id: assignedOrderId, returnTo: "parcel" },
      } as never);
    },
    [router]
  );

  const showSearchTimeoutApology = useCallback(() => {
    if (timeoutApologyShownRef.current) return;
    timeoutApologyShownRef.current = true;
    useParcelBookingStore.getState().markGuidelinesShown();
    setPhase("cancelled");
    setTripDetailsVisible(false);
    setCancelFlowStep(null);
    setApologySheetVisible(true);
  }, []);

  const dismissSearchTimeoutApology = useCallback(() => {
    setApologySheetVisible(false);
    setSearchInFlight(false);
    useParcelBookingStore.getState().markGuidelinesShown();
    returnToParcelHome();
  }, [returnToParcelHome, setSearchInFlight]);

  const autoCancelAfterSearchTimeout = useCallback(
    async (id: string) => {
      if (timeoutApologyShownRef.current) return;
      cancelledRef.current = true;
      clearRideSearchTimer(id);
      useOrderStore.getState().removeActiveOrder(id);
      try {
        await cancelParcelOrder(id, {
          cancelMode: "timeout",
          reasonCode: "RIDER_SEARCH_TIMEOUT",
          reasonText: "No rider accepted within the search window",
        });
      } catch {
        /* server cron may have cancelled already */
      }
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      showSearchTimeoutApology();
    },
    [queryClient, showSearchTimeoutApology]
  );

  const runPlace = useCallback(async () => {
    if (!pickup || !drop || !receiver) {
      goBackToBook();
      return;
    }
    if (placingRef.current || cancelledRef.current) return;
    placingRef.current = true;
    setPhase("placing");
    setPlacementError(null);

    try {
      const supply = await getRideAvailability({
        pickupLat: pickup.latitude,
        pickupLng: pickup.longitude,
        tripKm: tripKm != null && tripKm <= 500 ? tripKm : undefined,
        serviceType: "parcel",
      });
      if (!parcelCategoryHasNearbySupply(supply.riders, vehicleCategory)) {
        setPlacementError(
          "No parcel captains are available near pickup right now. Try a different pickup or try again shortly."
        );
        setPhase("error");
        placingRef.current = false;
        return;
      }
    } catch {
      setPlacementError("Could not check captain availability. Please try again.");
      setPhase("error");
      placingRef.current = false;
      return;
    }

    const payload = {
      pickupAddress: pickup.fullAddress || pickup.primary,
      pickupLabel: pickup.primary,
      pickupLat: pickup.latitude,
      pickupLng: pickup.longitude,
      dropAddress: drop.fullAddress || drop.primary,
      dropLabel: drop.primary,
      dropLat: drop.latitude,
      dropLng: drop.longitude,
      vehicleCategory,
      estimatedFare: fare,
      tripKm,
      payAt: (paramStr(params.payAt) === "drop" ? "drop" : "pickup") as "pickup" | "drop",
      receiverName: receiver.name,
      receiverMobile: receiver.mobile,
      paymentMethod: (paramStr(params.paymentMethod) === "online" ? "online" : "cash") as
        | "cash"
        | "online",
      ...(selectedPlatformOfferId != null ? { selectedPlatformOfferId } : {}),
      ...(forceNoAutoOffer ? { forceNoAutoOffer: true } : {}),
    };

    try {
      let res;
      try {
        res = await placeParcelOrder(payload);
      } catch (firstErr) {
        const code = (firstErr as { response?: { data?: { code?: string }; status?: number } })
          ?.response?.data?.code;
        const status = (firstErr as { response?: { status?: number } })?.response?.status;
        if (status === 409 || code === "ORDER_ID_CONFLICT") {
          res = await placeParcelOrder(payload);
        } else {
          throw firstErr;
        }
      }
      if (cancelledRef.current) {
        try {
          await cancelParcelOrder(res.orderId, {
            reasonCode: "CUSTOMER_CANCELLED",
            reasonText: "Customer cancelled while placing",
            cancelMode: "manual",
          });
        } catch {
          /* best-effort */
        }
        return;
      }
      setOrderId(res.orderId);
      setPhase("searching");
      placedOnceRef.current = true;
      setSearchInFlight(true);
      if (res.totalAmount != null && Number.isFinite(res.totalAmount) && res.totalAmount > 0) {
        setResumeFare(Math.round(res.totalAmount));
      }
      if (pickup) {
        setFetchedPickupLabel(pickup.fullAddress?.trim() || pickup.primary?.trim() || "");
      }
      if (drop) {
        setFetchedDropLabel(drop.fullAddress?.trim() || drop.primary?.trim() || "");
      }
      const windowSec =
        res.searchTimeoutSec > 0 ? res.searchTimeoutSec : DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC;
      if (res.searchExpiresAt) {
        searchExpiresAtRef.current = res.searchExpiresAt;
        rememberRideSearchTimer(res.orderId, res.searchExpiresAt, windowSec);
      } else {
        const fallbackExpires = new Date(Date.now() + windowSec * 1000).toISOString();
        searchExpiresAtRef.current = fallbackExpires;
        rememberRideSearchTimer(res.orderId, fallbackExpires, windowSec);
      }
      useOrderStore.getState().addActiveOrder({
        orderId: res.orderId,
        formattedOrderId: res.formattedOrderId,
        status: "ORDER_PLACED",
        etaMinutes: 0,
        storeId: null,
        storeName: null,
        placedAt: Date.now(),
        serviceType: "parcel",
        vehicleImageKey: imageKey || vehicleCategory,
      });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (e) {
      if (cancelledRef.current) return;
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ||
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : "Could not place parcel order");
      setPlacementError(
        /Failed query|duplicate key|unique constraint/i.test(msg)
          ? "Could not place parcel — please try again"
          : msg
      );
      setPhase("error");
    } finally {
      placingRef.current = false;
    }
  }, [
    pickup,
    drop,
    receiver,
    fare,
    selectedPlatformOfferId,
    forceNoAutoOffer,
    tripKm,
    vehicleCategory,
    imageKey,
    params.payAt,
    params.paymentMethod,
    goBackToBook,
    queryClient,
    setSearchInFlight,
  ]);

  useEffect(() => {
    if (!resumeOrderId) return;
    if (cancelledRef.current) return;
    placedOnceRef.current = true;
    setOrderId(resumeOrderId);
    setPhase("searching");

    let alive = true;
    void orderService
      .getOrder(resumeOrderId)
      .then((detail) => {
        if (!alive || cancelledRef.current) return;
        const status = normalizeCustomerOrderStatus(detail.status);
        if (status === "CANCELLED" || status === "DELIVERED") {
          returnToParcelHome();
          return;
        }
        const assigned =
          !!detail.rider ||
          (status !== "SEARCHING_RIDER" &&
            status !== "PLACED" &&
            status !== "ORDER_PLACED" &&
            status !== "CREATED" &&
            isActiveOrderStatus(status));
        if (assigned) {
          openLiveParcelTracking(resumeOrderId);
          return;
        }

        const meta = (detail.checkoutMetadata ?? {}) as Record<string, unknown>;
        const metaExpires =
          typeof meta.searchExpiresAt === "string" ? meta.searchExpiresAt.trim() : "";
        const cached = readRideSearchTimer(resumeOrderId);
        const expiresAt = cached?.expiresAt || metaExpires || null;
        if (expiresAt) {
          searchExpiresAtRef.current = expiresAt;
          const windowSec =
            cached?.windowSec ??
            (typeof meta.searchTimeoutSec === "number" && meta.searchTimeoutSec > 0
              ? Number(meta.searchTimeoutSec)
              : DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC);
          rememberRideSearchTimer(resumeOrderId, expiresAt, windowSec);
          if (remainingSecFromExpiresAt(expiresAt, 0) <= 0) {
            void autoCancelAfterSearchTimeout(resumeOrderId);
            return;
          }
        } else if (detail.createdAt) {
          const createdMs = new Date(detail.createdAt).getTime();
          if (Number.isFinite(createdMs)) {
            const fallbackExpires = new Date(
              createdMs + DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC * 1000
            ).toISOString();
            searchExpiresAtRef.current = fallbackExpires;
            rememberRideSearchTimer(
              resumeOrderId,
              fallbackExpires,
              DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC
            );
            if (remainingSecFromExpiresAt(fallbackExpires, 0) <= 0) {
              void autoCancelAfterSearchTimeout(resumeOrderId);
              return;
            }
          }
        }

        const amount = detail.totalAmount;
        if (amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0) {
          setResumeFare(Math.round(Number(amount)));
        }
        const dist = Number(detail.distanceKm);
        if (Number.isFinite(dist) && dist > 0) {
          setFetchedTripKm(Math.round(dist * 100) / 100);
        } else {
          const metaKm = Number(meta.tripKm ?? meta.routeDistanceKm);
          if (Number.isFinite(metaKm) && metaKm > 0) {
            setFetchedTripKm(Math.round(metaKm * 100) / 100);
          }
        }

        const pickupLat =
          coordNum(detail.pickupLat) ?? coordNum(meta.pickupLat);
        const pickupLng =
          coordNum(detail.pickupLng) ?? coordNum(meta.pickupLng);
        const dropLat =
          coordNum(detail.deliveryLat) ?? coordNum(meta.dropLat);
        const dropLng =
          coordNum(detail.deliveryLng) ?? coordNum(meta.dropLng);
        const pLabel =
          (typeof meta.pickupLabel === "string" && meta.pickupLabel.trim()) ||
          detail.merchantAddress?.trim() ||
          "Pickup";
        const pickupFull =
          (typeof meta.pickupFullAddress === "string" && meta.pickupFullAddress.trim()) ||
          pLabel;
        const dLabel =
          (typeof meta.dropLabel === "string" && meta.dropLabel.trim()) ||
          detail.deliveryAddress?.trim() ||
          "Drop";
        const dropFull =
          (typeof meta.dropFullAddress === "string" && meta.dropFullAddress.trim()) || dLabel;

        if (
          pickupLat != null &&
          pickupLng != null &&
          Number.isFinite(pickupLat) &&
          Number.isFinite(pickupLng)
        ) {
          setPickup({
            primary: pLabel,
            fullAddress: pickupFull,
            latitude: pickupLat,
            longitude: pickupLng,
          });
        }
        if (
          dropLat != null &&
          dropLng != null &&
          Number.isFinite(dropLat) &&
          Number.isFinite(dropLng)
        ) {
          setDrop({
            primary: dLabel,
            fullAddress: dropFull,
            latitude: dropLat,
            longitude: dropLng,
          });
        }
        const receiverName =
          (typeof meta.receiverName === "string" && meta.receiverName.trim()) || "";
        const receiverMobile =
          (typeof meta.receiverMobile === "string" && meta.receiverMobile.trim()) || "";
        if (receiverName || receiverMobile) {
          setReceiver({ name: receiverName || "Receiver", mobile: receiverMobile || "—" });
        }
        setFetchedPickupLabel(pickupFull);
        setFetchedDropLabel(dropFull);
        setSearchInFlight(true);
      })
      .catch(() => {
        /* keep searching UI; poll will retry */
      });

    return () => {
      alive = false;
    };
  }, [
    resumeOrderId,
    openLiveParcelTracking,
    returnToParcelHome,
    autoCancelAfterSearchTimeout,
    setPickup,
    setDrop,
    setReceiver,
    setSearchInFlight,
  ]);

  useEffect(() => {
    if (resumeOrderId) return;
    if (placedOnceRef.current || cancelledRef.current) return;
    void runPlace();
  }, [runPlace, resumeOrderId]);

  useEffect(() => {
    if (phase !== "searching" || !orderId || cancelledRef.current) return;
    let alive = true;
    const poll = async () => {
      if (!alive || cancelledRef.current || navigatedToLiveRef.current) return;
      try {
        const detail = await orderService.getOrder(orderId);
        const status = normalizeCustomerOrderStatus(detail.status);
        if (status === "CANCELLED") {
          cancelledRef.current = true;
          clearRideSearchTimer(orderId);
          useOrderStore.getState().removeActiveOrder(orderId);
          showSearchTimeoutApology();
          return;
        }
        const assigned =
          !!detail.rider ||
          (status !== "SEARCHING_RIDER" &&
            status !== "PLACED" &&
            status !== "ORDER_PLACED" &&
            status !== "CREATED" &&
            isActiveOrderStatus(status));
        if (assigned) {
          useOrderStore.getState().updateOrderStatus(orderId, status as never);
          openLiveParcelTracking(orderId);
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 4_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [phase, orderId, openLiveParcelTracking, showSearchTimeoutApology]);

  useEffect(() => {
    if (phase !== "searching" || !searchExpiresAtRef.current) return;
    if (cancelledRef.current || timeoutApologyShownRef.current) return;

    const syncRemaining = () => {
      if (cancelledRef.current || timeoutApologyShownRef.current) return;
      const expiresAt = searchExpiresAtRef.current;
      if (!expiresAt) return;
      if (remainingSecFromExpiresAt(expiresAt, 0) <= 0 && orderId) {
        void autoCancelAfterSearchTimeout(orderId);
      }
    };

    syncRemaining();
    const timer = setInterval(syncRemaining, 1000);
    return () => clearInterval(timer);
  }, [phase, orderId, autoCancelAfterSearchTimeout]);

  const openCancelFlow = useCallback(() => {
    if (phase === "placing") return;
    setCancelFlowStep("reason");
  }, [phase]);

  const closeCancelFlow = useCallback(() => {
    setCancelFlowStep(null);
    setSelectedCancelReason(null);
    setCancelLoading(false);
  }, []);

  const executeCancelParcel = useCallback(async () => {
    if (cancelledRef.current || cancelLoading) return;
    cancelledRef.current = true;
    setCancelLoading(true);
    setPhase("cancelled");
    const reasonCode = selectedCancelReason?.id ?? "CUSTOMER_CANCELLED";
    const reasonText =
      selectedCancelReason?.label ?? "Customer cancelled while searching for captain";
    closeCancelFlow();

    if (orderId) {
      clearRideSearchTimer(orderId);
      try {
        await cancelParcelOrder(orderId, {
          reasonCode,
          reasonText,
          cancelMode: "manual",
        });
      } catch {
        /* best-effort */
      }
      useOrderStore.getState().removeActiveOrder(orderId);
    }

    setSearchInFlight(false);
    returnToParcelHome();
  }, [cancelLoading, orderId, selectedCancelReason, closeCancelFlow, returnToParcelHome, setSearchInFlight]);

  const handleBack = useCallback(() => {
    if (cancelFlowStep != null) {
      closeCancelFlow();
      return;
    }
    if (tripDetailsVisible) {
      setTripDetailsVisible(false);
      return;
    }
    // Back leaves the screen — cancel only via Cancel parcel CTA.
    if (orderId || resumeOrderId) returnToParcelHome();
    else goBackToBook();
  }, [
    cancelFlowStep,
    tripDetailsVisible,
    orderId,
    resumeOrderId,
    closeCancelFlow,
    returnToParcelHome,
    goBackToBook,
  ]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const CAPTAIN_NEARBY_SLOGAN = "Captain nearby assigning one soon";
  const sheetTitle =
    phase === "placing"
      ? "Booking your parcel…"
      : phase === "error"
        ? "Booking failed"
        : "Searching For Rider…";
  const sheetSubtitle =
    phase === "placing"
      ? "Confirming fare and notifying captains"
      : phase === "error"
        ? placementError ?? "Please try again"
        : CAPTAIN_NEARBY_SLOGAN;

  if (phase === "cancelled" && !apologySheetVisible) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {phase !== "cancelled" ? (
        <>
          <View style={styles.mapSection}>
            <RideSearchingMap
              center={mapCenter}
              nearbyRiders={nearbyRiders}
              riderMarkerImageKey={imageKey === "auto" ? "auto" : "bike"}
              bottomMapPadding={380}
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
              phase={phase === "error" ? "error" : phase === "placing" ? "placing" : "searching"}
              title={sheetTitle}
              subtitle={sheetSubtitle}
              searchingTitle="Searching For Rider…"
              fare={displayFare}
              rideImage={rideImage}
              rideName={vehicleName}
              pickupLabel={pickupLabel}
              dropLabel={dropLabel}
              tripKm={tripKm}
              pickupDistanceKm={pickupDistanceKm}
              routeEtaMins={etaMins}
              nearbyRidersCount={nearbyRiders.length}
              activeMitraSathiCount={nearbyRiders.length}
              placementError={placementError}
              bottomInset={insets.bottom}
              onRetry={goBackToBook}
              showCancel={phase === "searching" || phase === "error"}
              cancelTitle="Cancel parcel"
              cancelSubtitle="Free cancellation before captain accepts"
              onCancelRide={openCancelFlow}
              shareTripEnabled={false}
              showFullAddresses
              onTripDetails={() => setTripDetailsVisible(true)}
            />
          </View>

          <RideSearchingTripDetailsSheet
            visible={tripDetailsVisible}
            rideName={vehicleName}
            rideImage={rideImage}
            pickupAddress={pickupLabel}
            dropAddress={dropLabel}
            totalFare={displayFare}
            statusLabel={CAPTAIN_NEARBY_SLOGAN}
            cancelLabel="Cancel parcel"
            onBack={() => setTripDetailsVisible(false)}
            onCancelRide={() => {
              setTripDetailsVisible(false);
              openCancelFlow();
            }}
          />

          <RideCancelReasonSheet
            visible={cancelFlowStep === "reason"}
            onClose={closeCancelFlow}
            reasons={PARCEL_SEARCH_CANCEL_REASONS}
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
            heroImage={rideImage ?? undefined}
            title="Are you sure you want to cancel this parcel?"
            message="By cancelling, you'll need to start a new search that may take longer to find a captain."
            confirmLabel="Cancel my parcel"
            keepLabel="Keep searching"
            onConfirm={() => void executeCancelParcel()}
            onKeepSearching={closeCancelFlow}
            onClose={closeCancelFlow}
          />
        </>
      ) : null}

      <RideServiceUnavailableSheet
        visible={apologySheetVisible}
        title={SEARCH_TIMEOUT_APOLOGY.title}
        message={SEARCH_TIMEOUT_APOLOGY.message}
        okayLabel="OK"
        iconName="sad-outline"
        onOkay={dismissSearchTimeoutApology}
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
