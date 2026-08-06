/**
 * Customer waits for parcel captain after booking (ride-searching style).
 * Map on top, searching sheet anchored at bottom (not top).
 * Cancel flow mirrors ride: reason sheet → confirm sheet → API cancel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, BackHandler, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { RideSearchingMap } from "@/components/maps/RideSearchingMap";
import { RideSearchingBottomSheet } from "@/features/ride/RideSearchingBottomSheet";
import { RideCancelReasonSheet } from "@/features/ride/RideCancelReasonSheet";
import { RideCancelConfirmSheet } from "@/features/ride/RideCancelConfirmSheet";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { placeParcelOrder, cancelParcelOrder } from "@/services/parcelBooking.service";
import { useParcelBookingStore } from "@/features/parcel/parcelBookingStore";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import { PARCEL_SEARCH_CANCEL_REASONS } from "@/lib/parcel-cancel-reasons";
import type { RideCancelReason } from "@/lib/ride-cancel-reasons";

type CancelFlowStep = null | "reason" | "confirm";

export default function ParcelSearchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    vehicleId?: string;
    vehicleName?: string;
    imageKey?: string;
    fare?: string;
    tripKm?: string;
    routeEtaMins?: string;
    payAt?: string;
    paymentMethod?: string;
  }>();

  const pickup = useParcelBookingStore((s) => s.pickup);
  const drop = useParcelBookingStore((s) => s.drop);
  const receiver = useParcelBookingStore((s) => s.receiver);

  const [phase, setPhase] = useState<"placing" | "searching" | "error" | "cancelled">("placing");
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [cancelFlowStep, setCancelFlowStep] = useState<CancelFlowStep>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<RideCancelReason | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const placingRef = useRef(false);
  const placedOnceRef = useRef(false);
  const cancelledRef = useRef(false);

  const fare = Math.max(0, Math.round(Number(params.fare) || 0));
  const tripKm =
    params.tripKm != null && Number(params.tripKm) > 0 ? Number(params.tripKm) : undefined;
  const etaMins =
    params.routeEtaMins != null && Number(params.routeEtaMins) > 0
      ? Number(params.routeEtaMins)
      : null;

  const vehicleName = params.vehicleName?.trim() || "Parcel";
  const imageKey = params.imageKey ?? "bike";
  const rideImage =
    imageKey === "van"
      ? null
      : resolveRideImage(imageKey === "auto" ? "auto" : "bike");

  const pickupLabel = pickup?.primary || pickup?.fullAddress || "Pickup";
  const dropLabel = drop?.primary || drop?.fullAddress || "Drop";
  const mapCenter = pickup
    ? { latitude: pickup.latitude, longitude: pickup.longitude }
    : drop
      ? { latitude: drop.latitude, longitude: drop.longitude }
      : { latitude: 28.6139, longitude: 77.209 };

  const { data: availability } = useNearbyRideAvailability(
    pickup?.latitude ?? null,
    pickup?.longitude ?? null,
    tripKm ?? null
  );
  const nearbyRiders = availability?.riders ?? [];

  const goBackToBook = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/home/service/parcel-book" as never);
  }, [router]);

  const returnToParcelHome = useCallback(() => {
    router.replace("/home/service/parcels" as never);
  }, [router]);

  const runPlace = useCallback(async () => {
    if (!pickup || !drop || !receiver) {
      goBackToBook();
      return;
    }
    if (placingRef.current || cancelledRef.current) return;
    placingRef.current = true;
    setPhase("placing");
    setPlacementError(null);

    const payload = {
      pickupAddress: pickup.fullAddress || pickup.primary,
      pickupLabel: pickup.primary,
      pickupLat: pickup.latitude,
      pickupLng: pickup.longitude,
      dropAddress: drop.fullAddress || drop.primary,
      dropLabel: drop.primary,
      dropLat: drop.latitude,
      dropLng: drop.longitude,
      vehicleCategory: params.vehicleId || "2_wheeler",
      estimatedFare: fare,
      tripKm,
      payAt: (params.payAt === "drop" ? "drop" : "pickup") as "pickup" | "drop",
      receiverName: receiver.name,
      receiverMobile: receiver.mobile,
      paymentMethod: (params.paymentMethod === "online" ? "online" : "cash") as
        | "cash"
        | "online",
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
        // User cancelled while place was in-flight — cancel the new order.
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
    tripKm,
    params.vehicleId,
    params.payAt,
    params.paymentMethod,
    goBackToBook,
  ]);

  useEffect(() => {
    if (placedOnceRef.current || cancelledRef.current) return;
    void runPlace();
  }, [runPlace]);

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
      try {
        await cancelParcelOrder(orderId, {
          reasonCode,
          reasonText,
          cancelMode: "manual",
        });
      } catch {
        /* best-effort */
      }
    }

    returnToParcelHome();
  }, [
    cancelLoading,
    orderId,
    selectedCancelReason,
    closeCancelFlow,
    returnToParcelHome,
  ]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (cancelFlowStep != null) {
        closeCancelFlow();
        return true;
      }
      if (phase === "placing") return true;
      if (phase === "searching" || phase === "error") {
        openCancelFlow();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [phase, cancelFlowStep, closeCancelFlow, openCancelFlow]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapSection}>
        <RideSearchingMap
          center={mapCenter}
          nearbyRiders={nearbyRiders}
          riderMarkerImageKey={
            imageKey === "auto" ? "auto" : imageKey === "van" ? "cab" : "bike"
          }
          bottomMapPadding={380}
          style={StyleSheet.absoluteFill}
        />

        <Pressable
          style={[styles.backFab, { top: insets.top + 8 }]}
          onPress={() => {
            if (phase === "searching" || phase === "error") openCancelFlow();
            else goBackToBook();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>
      </View>

      {phase !== "cancelled" ? (
        <View style={styles.sheetHost}>
          <RideSearchingBottomSheet
            phase={phase === "error" ? "error" : phase === "placing" ? "placing" : "searching"}
            title={
              phase === "placing"
                ? "Booking your parcel…"
                : phase === "error"
                  ? "Booking failed"
                  : "Looking for nearby captains…"
            }
            subtitle={
              phase === "placing"
                ? "Confirming fare and finding captains"
                : phase === "error"
                  ? placementError ?? "Please try again"
                  : `Parcel on ${vehicleName}${orderId ? ` · ${orderId}` : ""}`
            }
            fare={fare}
            rideImage={rideImage}
            rideName={vehicleName}
            pickupLabel={pickupLabel}
            dropLabel={dropLabel}
            tripKm={tripKm}
            routeEtaMins={etaMins}
            nearbyRidersCount={nearbyRiders.length}
            showCancel={phase === "searching" || phase === "error"}
            cancelTitle="Cancel Parcel"
            cancelSubtitle="Free cancellation before captain accepts"
            onCancelRide={openCancelFlow}
            onRetry={() => {
              cancelledRef.current = false;
              placedOnceRef.current = false;
              void runPlace();
            }}
            bottomInset={insets.bottom}
          />
        </View>
      ) : null}

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
        message="By cancelling this parcel, you'll have to restart the search that may lead to delay in finding a captain."
        confirmLabel="Cancel my parcel"
        keepLabel="Keep searching"
        onConfirm={() => void executeCancelParcel()}
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
