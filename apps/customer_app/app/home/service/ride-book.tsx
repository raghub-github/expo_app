/**
 * Ride book screen – Rapido-style map + bottom sheet, all service options, mint CTA.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { RideBookMap } from "@/components/maps/RideBookMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { GatiMitraColors } from "@/constants/gatimitra";
import { resolvePlaceDisplayName } from "@/services/location.service";
import { RideServiceUnavailableSheet } from "@/features/ride/RideServiceUnavailableSheet";
import { parseRideStopsParam } from "@/lib/ride-serviceability";
import {
  getCalculatedRouteWithStops,
  type LatLng,
} from "@/services/directions.service";
import { RideRouteMapPillOverlay } from "@/features/ride/RideRouteMapPillOverlay";
import {
  rideMapFitPadding,
  rideRouteFitMaxZoom,
  routeBoundsFitPoints,
  RIDE_BOOK_SHEET_HEIGHT_RATIO,
  type InwardBias,
} from "@/features/ride/ride-map-pill-layout";
import { useRideConfirmPickupStore } from "@/store/rideConfirmPickupStore";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import type { RideAvailabilityOption } from "@/services/rideAvailability.service";
import { estimateRideFare } from "@/features/ride/rideOptions";
import { ActiveRideBottomSheet } from "@/components/ride/ActiveRideBottomSheet";
import { useActivePersonRideOrders } from "@/hooks/useActivePersonRideOrders";
import { RidePreBookTipSheet } from "@/features/ride/RidePreBookTipSheet";
import { shouldShowPreBookTipSheet } from "@/lib/ride-tip-amounts";

const DEFAULT_REGION = {
  latitude: 24.7969,
  longitude: 84.9914,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const SELECTED_BORDER = "#0F172A";

type ConfirmedPickupOverride = {
  primary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

function truncateAddress(text: string, max = 24): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatDropTime(etaMins: number): string {
  const d = new Date(Date.now() + etaMins * 60_000);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function estimateFare(baseFare: number, tripKm: number | null): number {
  return estimateRideFare(baseFare, tripKm);
}

function RideOptionCard({
  option,
  selected,
  tripKm,
  routeEtaMins,
  onSelect,
}: {
  option: RideAvailabilityOption;
  selected: boolean;
  tripKm: number | null;
  routeEtaMins: number | null;
  onSelect: () => void;
}) {
  const price = estimateFare(option.baseFare, tripKm);
  const travelMins = routeEtaMins ?? Math.round((tripKm ?? 3) * 2);
  const awayMins = option.nearestRiderEtaMins ?? option.etaMins;
  const dropLabel = formatDropTime(awayMins + travelMins);

  return (
    <TouchableOpacity
      style={[styles.rideCard, selected && styles.rideCardSelected]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <Image source={resolveRideImage(option.imageKey)} style={styles.rideImage} resizeMode="contain" />
      <View style={styles.rideInfo}>
        <View style={styles.rideNameRow}>
          <Text style={styles.rideName}>{option.name}</Text>
          {option.capacity != null ? (
            <View style={styles.capacityWrap}>
              <Ionicons name="person" size={11} color="#6B7280" />
              <Text style={styles.capacityText}>{option.capacity}</Text>
            </View>
          ) : null}
          {option.tag === "FASTEST" ? (
            <View style={styles.fastestTag}>
              <Text style={styles.fastestText}>FASTEST</Text>
            </View>
          ) : null}
          {option.tag === "SAVE" ? (
            <View style={styles.saveTag}>
              <Text style={styles.saveText}>%</Text>
            </View>
          ) : null}
        </View>
        {option.subtitle ? <Text style={styles.rideSubtitle}>{option.subtitle}</Text> : null}
        <Text style={styles.rideTiming}>
          {awayMins} mins away • Drop {dropLabel}
        </Text>
      </View>
      <Text style={styles.ridePrice}>₹{price}</Text>
    </TouchableOpacity>
  );
}

export default function RideBookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    pickup?: string;
    drop?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropLat?: string;
    dropLng?: string;
    stops?: string;
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
  }>();

  const [serviceUnavailableVisible, setServiceUnavailableVisible] = useState(false);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [tripKm, setTripKm] = useState<number | null>(null);
  const [routeEtaMins, setRouteEtaMins] = useState<number | null>(null);
  const routeRequestRef = useRef(0);
  const mapRef = useRef<CustomerMapRef>(null);
  const [mapSyncToken, setMapSyncToken] = useState(0);
  const [mapFrameTick, setMapFrameTick] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const mapFrameRafRef = useRef<number | null>(null);

  const bumpMapOverlay = useCallback(() => {
    setMapSyncToken((v) => v + 1);
  }, []);

  const syncMapOverlayDuringPan = useCallback(() => {
    if (mapFrameRafRef.current != null) return;
    mapFrameRafRef.current = requestAnimationFrame(() => {
      mapFrameRafRef.current = null;
      setMapFrameTick((v) => v + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (mapFrameRafRef.current != null) {
        cancelAnimationFrame(mapFrameRafRef.current);
      }
    },
    []
  );

  const consumePendingConfirmPickup = useRideConfirmPickupStore((s) => s.consumePendingResult);
  const [confirmedPickup, setConfirmedPickup] = useState<ConfirmedPickupOverride | null>(null);

  useFocusEffect(
    useCallback(() => {
      const nextPickup = consumePendingConfirmPickup();
      if (!nextPickup) return;
      setConfirmedPickup({
        primary: nextPickup.primary,
        fullAddress: nextPickup.fullAddress,
        latitude: nextPickup.latitude,
        longitude: nextPickup.longitude,
      });
    }, [consumePendingConfirmPickup])
  );

  const pickupLabel = truncateAddress(
    resolvePlaceDisplayName({
      primary: confirmedPickup?.primary ?? params.pickup,
      fullAddress: confirmedPickup?.fullAddress ?? params.pickup,
    })
  );
  const dropLabel = truncateAddress(
    resolvePlaceDisplayName({
      primary: params.drop,
      fullAddress: params.drop,
    })
  );

  const pickupLat =
    confirmedPickup?.latitude ??
    (params.pickupLat != null ? Number(params.pickupLat) : null);
  const pickupLng =
    confirmedPickup?.longitude ??
    (params.pickupLng != null ? Number(params.pickupLng) : null);
  const dropLat = params.dropLat != null ? Number(params.dropLat) : null;
  const dropLng = params.dropLng != null ? Number(params.dropLng) : null;

  const {
    data: availability,
    isLoading: availabilityLoading,
    isError: availabilityError,
  } = useNearbyRideAvailability(pickupLat, pickupLng);

  const { activeRides } = useActivePersonRideOrders(true);
  const hasActiveRide = activeRides.length > 0;

  const availableOptions = availability?.options ?? [];
  const allNearbyRiders = availability?.riders ?? [];

  const selectedRide =
    availableOptions.find((r) => r.id === selectedRideId) ?? availableOptions[0] ?? null;

  const nearbyRiders = useMemo(() => {
    if (!selectedRide?.vehicleTypes?.length) return allNearbyRiders;
    const allowed = new Set(selectedRide.vehicleTypes);
    return allNearbyRiders.filter((rider) => {
      const types = rider.vehicleTypes?.length ? rider.vehicleTypes : [rider.vehicleType];
      return types.some((type) => allowed.has(type));
    });
  }, [allNearbyRiders, selectedRide]);

  const stopCoords = useMemo(() => parseRideStopsParam(params.stops), [params.stops]);

  useEffect(() => {
    const pickup =
      pickupLat != null && pickupLng != null
        ? { latitude: pickupLat, longitude: pickupLng }
        : null;
    const noRidersNearPickup =
      !availabilityLoading &&
      !availabilityError &&
      pickup != null &&
      availableOptions.length === 0;
    setServiceUnavailableVisible(noRidersNearPickup);
  }, [
    pickupLat,
    pickupLng,
    availabilityLoading,
    availabilityError,
    availableOptions.length,
  ]);

  useEffect(() => {
    if (availableOptions.length === 0) return;
    if (!selectedRideId || !availableOptions.some((o) => o.id === selectedRideId)) {
      setSelectedRideId(availableOptions[0]!.id);
    }
  }, [availableOptions, selectedRideId]);

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

  useEffect(() => {
    if (!pickupPoint || !dropPoint) {
      setRouteCoordinates([]);
      setTripKm(null);
      setRouteEtaMins(null);
      return;
    }

    const requestId = ++routeRequestRef.current;
    const vehicleId = selectedRideId;

    setRouteCoordinates([]);
    setRouteLoading(true);
    getCalculatedRouteWithStops(pickupPoint, stopCoords, dropPoint, vehicleId)
      .then((route) => {
        if (requestId !== routeRequestRef.current) return;
        if (route) {
          setRouteCoordinates(route.coordinates);
          setTripKm(route.distanceKm);
          setRouteEtaMins(route.etaMinutes);
        } else {
          setRouteCoordinates([]);
          setTripKm(null);
          setRouteEtaMins(null);
        }
      })
      .finally(() => {
        if (requestId === routeRequestRef.current) setRouteLoading(false);
      });
  }, [
    pickupPoint,
    dropPoint,
    stopCoords,
    selectedRideId,
  ]);

  const mapFitPoints = useMemo(() => {
    if (routeCoordinates.length < 2) return [];
    const endpoints: LatLng[] = [];
    if (pickupPoint) endpoints.push(pickupPoint);
    stopCoords.forEach((s) => endpoints.push(s));
    if (dropPoint) endpoints.push(dropPoint);
    return routeBoundsFitPoints(routeCoordinates, endpoints);
  }, [routeCoordinates, pickupPoint, dropPoint, stopCoords]);

  const showRoadPolyline = routeCoordinates.length >= 2;

  const pillBias = useMemo((): { pickup: InwardBias; drop: InwardBias } => {
    if (!pickupPoint || !dropPoint) {
      return { pickup: "none", drop: "none" };
    }
    const pickupIsLeft = pickupPoint.longitude <= dropPoint.longitude;
    return {
      pickup: pickupIsLeft ? "left" : "right",
      drop: pickupIsLeft ? "right" : "left",
    };
  }, [pickupPoint, dropPoint]);

  const effectiveBottomSheetHeight = useMemo(() => {
    if (bottomSheetHeight > 0) return bottomSheetHeight;
    return Math.round(Dimensions.get("window").height * RIDE_BOOK_SHEET_HEIGHT_RATIO);
  }, [bottomSheetHeight]);

  const mapEdgePadding = useMemo(
    () =>
      rideMapFitPadding({
        topInset: insets.top,
        bottomSheetHeightPx: effectiveBottomSheetHeight,
      }),
    [insets.top, effectiveBottomSheetHeight]
  );

  const mapFitMaxZoom = useMemo(() => rideRouteFitMaxZoom(tripKm), [tripKm]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    bumpMapOverlay();
  }, [bumpMapOverlay]);

  useEffect(() => {
    if (!mapReady) return;
    if (routeLoading) return;
    if (routeCoordinates.length < 2) return;
    if (mapFitPoints.length < 2) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(mapFitPoints, {
        edgePadding: mapEdgePadding,
        animated: true,
        maxZoom: mapFitMaxZoom,
      });
      setTimeout(bumpMapOverlay, 520);
    }, 450);

    return () => clearTimeout(timer);
  }, [
    mapReady,
    routeLoading,
    routeCoordinates.length,
    mapFitPoints,
    mapEdgePadding,
    mapFitMaxZoom,
    bumpMapOverlay,
  ]);

  const effectivePickupAddress =
    confirmedPickup?.fullAddress ?? String(params.pickup ?? "");

  const goEditLocations = useCallback(
    (focusField: "pickup" | "drop" | "add-stop") => {
      const restoreParams: Record<string, string> = {
        restore: "true",
        focusField,
      };
      if (effectivePickupAddress) restoreParams.pickup = effectivePickupAddress;
      if (params.drop) restoreParams.drop = String(params.drop);
      if (pickupLat != null) restoreParams.pickupLat = String(pickupLat);
      if (pickupLng != null) restoreParams.pickupLng = String(pickupLng);
      if (params.dropLat) restoreParams.dropLat = String(params.dropLat);
      if (params.dropLng) restoreParams.dropLng = String(params.dropLng);
      if (params.stops) restoreParams.stops = String(params.stops);
      router.push({ pathname: "/home/service/ride-pickup", params: restoreParams });
    },
    [effectivePickupAddress, params, pickupLat, pickupLng, router]
  );

  const navigateToConfirmPickup = useCallback(
    (customerTipAmount = 0) => {
      if (!selectedRide || !selectedRideId) return;
      const baseFare = estimateFare(selectedRide.baseFare, tripKm);
      const navParams: Record<string, string> = {
        pickup: effectivePickupAddress,
        drop: String(params.drop ?? ""),
        selectedRideId,
        selectedRideName: selectedRide.name,
        selectedRideImageKey: selectedRide.imageKey,
      };
      if (pickupLat != null) navParams.pickupLat = String(pickupLat);
      if (pickupLng != null) navParams.pickupLng = String(pickupLng);
      if (params.dropLat) navParams.dropLat = String(params.dropLat);
      if (params.dropLng) navParams.dropLng = String(params.dropLng);
      if (params.stops) navParams.stops = String(params.stops);
      if (params.bookedForSelf) navParams.bookedForSelf = String(params.bookedForSelf);
      if (params.passengerName) navParams.passengerName = String(params.passengerName);
      if (params.passengerPhone) navParams.passengerPhone = String(params.passengerPhone);
      navParams.estimatedFare = String(baseFare);
      if (customerTipAmount > 0) navParams.customerTipAmount = String(customerTipAmount);
      if (tripKm != null) navParams.tripKm = String(tripKm);
      setTipSheetVisible(false);
      router.push({ pathname: "/home/service/ride-confirm-pickup", params: navParams });
    },
    [
      effectivePickupAddress,
      params,
      pickupLat,
      pickupLng,
      selectedRideId,
      selectedRide,
      tripKm,
      router,
    ]
  );

  const handleBookPress = useCallback(() => {
    if (!selectedRide) return;
    if (shouldShowPreBookTipSheet(tripKm)) {
      setTipSheetVisible(true);
      return;
    }
    navigateToConfirmPickup(0);
  }, [selectedRide, tripKm, navigateToConfirmPickup]);

  const mapCenter = useMemo(
    () =>
      pickupPoint ??
      dropPoint ?? {
        latitude: DEFAULT_REGION.latitude,
        longitude: DEFAULT_REGION.longitude,
      },
    [pickupPoint, dropPoint]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapSection}>
        <RideBookMap
          ref={mapRef}
          center={mapCenter}
          routeCoordinates={routeCoordinates}
          showRoadPolyline={showRoadPolyline}
          stopCoords={stopCoords}
          nearbyRiders={nearbyRiders}
          style={StyleSheet.absoluteFill}
          onMapReady={handleMapReady}
          onRegionChange={syncMapOverlayDuringPan}
          onRegionChangeComplete={bumpMapOverlay}
        />

        <RideRouteMapPillOverlay
          mapRef={mapRef}
          pickupPoint={pickupPoint}
          dropPoint={dropPoint}
          pickupLabel={pickupLabel}
          dropLabel={dropLabel}
          pickupBias={pillBias.pickup}
          dropBias={pillBias.drop}
          syncToken={mapSyncToken}
          mapFrameTick={mapFrameTick}
          onEditPickup={() => goEditLocations("pickup")}
          onEditDrop={() => goEditLocations("drop")}
        />

        {routeLoading ? (
          <View style={styles.routeLoadingPill}>
            <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
            <Text style={styles.routeLoadingText}>Calculating route…</Text>
          </View>
        ) : null}

        <View style={styles.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.backFab, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.mapFabCol}>
            <TouchableOpacity
              style={styles.mapFab}
              onPress={() => goEditLocations("add-stop")}
              activeOpacity={0.88}
            >
              <Ionicons name="add" size={18} color="#111827" />
              <Text style={styles.mapFabText}>Add stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locateFab} activeOpacity={0.88}>
              <Ionicons name="locate" size={22} color="#2563EB" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {!serviceUnavailableVisible ? (
        <View
          style={[styles.bottomSheet, { paddingBottom: insets.bottom + 12 }]}
          onLayout={(event) => {
            const h = event.nativeEvent.layout.height;
            if (h > 0) setBottomSheetHeight(h);
          }}
        >
          {hasActiveRide ? (
            <View style={styles.activeRideBannerWrap}>
              <ActiveRideBottomSheet rides={activeRides} embedded />
            </View>
          ) : null}
          <View style={styles.sheetHandle} />
          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {availabilityLoading && availableOptions.length === 0 ? (
              <View style={styles.optionsLoading}>
                <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
                <Text style={styles.optionsLoadingText}>Finding nearby riders…</Text>
              </View>
            ) : (
              availableOptions.map((option) => (
                <RideOptionCard
                  key={option.id}
                  option={option}
                  selected={selectedRideId === option.id}
                  tripKm={tripKm}
                  routeEtaMins={selectedRideId === option.id ? routeEtaMins : null}
                  onSelect={() => setSelectedRideId(option.id)}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.payOffersRow}>
            <TouchableOpacity style={styles.payOffersHalf} activeOpacity={0.85}>
              <Ionicons name="cash-outline" size={18} color="#111827" />
              <Text style={styles.payOffersText}>Cash</Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
            <View style={styles.payOffersDivider} />
            <TouchableOpacity style={styles.payOffersHalf} activeOpacity={0.85}>
              <Ionicons name="pricetag-outline" size={18} color="#111827" />
              <Text style={styles.payOffersText}>Offers</Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.bookBtn, !selectedRide && styles.bookBtnDisabled]}
            activeOpacity={0.9}
            onPress={handleBookPress}
            disabled={!selectedRide}
          >
            <Text style={styles.bookBtnText}>
              {selectedRide ? `Book ${selectedRide.name}` : "Book ride"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <RideServiceUnavailableSheet
        visible={serviceUnavailableVisible}
        onOkay={() => {
          setServiceUnavailableVisible(false);
          router.back();
        }}
      />

      {serviceUnavailableVisible && hasActiveRide ? (
        <ActiveRideBottomSheet rides={activeRides} bottomInset={insets.bottom + 16} />
      ) : null}

      <RidePreBookTipSheet
        visible={tipSheetVisible && !!selectedRide}
        baseFare={selectedRide ? estimateFare(selectedRide.baseFare, tripKm) : 0}
        rideName={selectedRide?.name ?? "Ride"}
        pickupLabel={pickupLabel}
        dropLabel={dropLabel}
        onConfirm={navigateToConfirmPickup}
        onClose={() => setTipSheetVisible(false)}
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
    minHeight: 260,
    overflow: "visible",
  },
  routeLoadingPill: {
    position: "absolute",
    alignSelf: "center",
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  routeLoadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 12,
    pointerEvents: "box-none",
    zIndex: 10,
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
  stopPinOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#6366F1",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  stopPinText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  mapFabCol: {
    position: "absolute",
    right: 12,
    bottom: 20,
    alignItems: "flex-end",
    gap: 10,
  },
  mapFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  mapFabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  locateFab: {
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
  bottomSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -18,
    maxHeight: "52%",
    paddingHorizontal: 16,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  activeRideBannerWrap: {
    marginHorizontal: -16,
    marginTop: -8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  optionsScroll: {
    flexGrow: 0,
  },
  optionsContent: {
    paddingBottom: 4,
  },
  optionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
  },
  optionsLoadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  rideCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#FFFFFF",
  },
  rideCardSelected: {
    borderColor: SELECTED_BORDER,
  },
  rideImage: {
    width: 56,
    height: 56,
    marginRight: 12,
  },
  rideInfo: {
    flex: 1,
    minWidth: 0,
  },
  rideNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  rideName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  capacityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  capacityText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  fastestTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fastestText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#15803D",
    letterSpacing: 0.3,
  },
  saveTag: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  rideSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
  },
  rideTiming: {
    fontSize: 12,
    color: "#6B7280",
  },
  ridePrice: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 8,
  },
  payOffersRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
    marginBottom: 12,
  },
  payOffersHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  payOffersDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: "#D1D5DB",
  },
  payOffersText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  bookBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  bookBtnDisabled: {
    opacity: 0.5,
  },
  bookBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
