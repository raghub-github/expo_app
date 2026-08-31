/**
 * Confirm pickup – Rapido-style map pin + nearby snap points before booking.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { MapboxWebPannableMap } from "@/components/maps/MapboxWebPannableMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { reverseGeocode, resolvePlaceDisplayName } from "@/services/location.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  buildNearbyPickupSnaps,
  type PickupSnapPoint,
} from "@/lib/nearby-pickup-points";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import * as Location from "expo-location";
import { parseRideStopsParam } from "@/lib/ride-serviceability";
import {
  fetchAndStoreRideRoute,
  rideRouteParamsFromSnapshot,
} from "@/services/rideRoute.service";
import { parseRideFareDistanceKm, rideFareDistanceNavParams } from "@/lib/ride-fare-distance";
import { parseMapCoordParam } from "@/lib/map-coordinates";

const MAP_ZOOM_DELTA = 0.006;
const GEOCODE_MOVE_METERS = 14;

function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = (a.latitude - b.latitude) * 111_320;
  const dLng =
    (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

type AddressState = {
  primary: string;
  fullAddress: string;
};

function formatPrimaryLabel(primary: string): string {
  const trimmed = primary.trim();
  if (!trimmed) return "PICKUP POINT";
  if (trimmed.length <= 28 && !trimmed.includes(",")) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function PickupCenterPin() {
  return (
    <View style={styles.pinOverlay} pointerEvents="none">
      <View style={styles.pickupLabelPill}>
        <AppText style={styles.pickupLabelText}>Pickup Point</AppText>
      </View>
      <View style={styles.pinShadow}>
        <Ionicons name="location-sharp" size={56} color={GatiMitraColors.primaryMint} />
        <View style={styles.pinTipDot} />
      </View>
    </View>
  );
}

function SnapPointMarker({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.snapOuter, selected && styles.snapOuterSelected]}>
      <View style={[styles.snapInner, selected && styles.snapInnerSelected]} />
    </View>
  );
}

export default function RideConfirmPickupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<CustomerMapRef>(null);

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
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
    estimatedFare?: string;
    quotedGrandTotal?: string;
    quotedListFare?: string;
    tripKm?: string;
    routeDistanceKm?: string;
    routeEtaMins?: string;
    customerTipAmount?: string;
    pickupPincode?: string;
    pickupState?: string;
    couponCode?: string;
    selectedPlatformOfferId?: string;
    forceNoAutoOffer?: string;
    viaRouteName?: string;
  }>();

  const initialLat = parseMapCoordParam(params.pickupLat, 24.7969);
  const initialLng = parseMapCoordParam(params.pickupLng, 84.9914);
  const setLastRidePickup = useRecentLocationStore((s) => s.setLastRidePickup);
  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);

  const centerCoordRef = useRef({
    latitude: initialLat,
    longitude: initialLng,
  });
  const [address, setAddress] = useState<AddressState>({
    primary: params.pickupLabel?.trim() || params.pickup?.trim() || "Pickup point",
    fullAddress: params.pickup?.trim() || "",
  });
  const addressRef = useRef(address);
  addressRef.current = address;
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null);
  const selectedSnapIdRef = useRef<string | null>(null);
  const lastGeocodedRef = useRef({ latitude: initialLat, longitude: initialLng });
  selectedSnapIdRef.current = selectedSnapId;

  const snapPoints = useMemo(
    () => buildNearbyPickupSnaps(initialLat, initialLng),
    [initialLat, initialLng]
  );

  const initialRegion = useMemo(
    () => ({
      latitude: initialLat,
      longitude: initialLng,
      latitudeDelta: MAP_ZOOM_DELTA,
      longitudeDelta: MAP_ZOOM_DELTA,
    }),
    [initialLat, initialLng]
  );

  const snapPointsPayload = useMemo(
    () =>
      snapPoints.map((point) => ({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        selected: selectedSnapId === point.id,
      })),
    [snapPoints, selectedSnapId]
  );

  const updateAddressFromCoords = useCallback(
    async (latitude: number, longitude: number, quiet = false) => {
      lastGeocodedRef.current = { latitude, longitude };
      if (!quiet) setGeocoding(true);
      try {
        const result = await reverseGeocode(longitude, latitude);
        const primary = resolvePlaceDisplayName(result);
        const fullAddress = result.fullAddress || primary;
        setAddress((prev) =>
          prev.primary === primary && prev.fullAddress === fullAddress
            ? prev
            : { primary, fullAddress }
        );
      } catch {
        const fullAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setAddress((prev) =>
          prev.primary === "Pickup point" && prev.fullAddress === fullAddress
            ? prev
            : { primary: "Pickup point", fullAddress }
        );
      } finally {
        if (!quiet) setGeocoding(false);
      }
    },
    []
  );

  useEffect(() => {
    const hasLabel = Boolean(params.pickupLabel?.trim() || params.pickup?.trim());
    updateAddressFromCoords(initialLat, initialLng, hasLabel);
  }, [initialLat, initialLng, params.pickup, params.pickupLabel, updateAddressFromCoords]);

  const animateToCoord = useCallback((latitude: number, longitude: number) => {
    mapRef.current?.animateToRegion?.({
      latitude,
      longitude,
      latitudeDelta: MAP_ZOOM_DELTA,
      longitudeDelta: MAP_ZOOM_DELTA,
    });
  }, []);

  const handleRegionChange = useCallback(
    (region: { latitude: number; longitude: number }) => {
      centerCoordRef.current = { latitude: region.latitude, longitude: region.longitude };
    },
    []
  );

  const handleRegionChangeComplete = useCallback(
    (region: { latitude: number; longitude: number }) => {
      const { latitude, longitude } = region;
      centerCoordRef.current = { latitude, longitude };
      if (selectedSnapIdRef.current) setSelectedSnapId(null);
      if (metersBetween(lastGeocodedRef.current, { latitude, longitude }) < GEOCODE_MOVE_METERS) {
        return;
      }
      updateAddressFromCoords(latitude, longitude);
    },
    [updateAddressFromCoords]
  );

  const handleSelectSnap = useCallback(
    (point: PickupSnapPoint) => {
      setSelectedSnapId(point.id);
      centerCoordRef.current = { latitude: point.latitude, longitude: point.longitude };
      animateToCoord(point.latitude, point.longitude);
      updateAddressFromCoords(point.latitude, point.longitude);
    },
    [animateToCoord, updateAddressFromCoords]
  );

  const handleSnapPress = useCallback(
    (id: string) => {
      const point = snapPoints.find((p) => p.id === id);
      if (point) handleSelectSnap(point);
    },
    [snapPoints, handleSelectSnap]
  );

  const handleMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      centerCoordRef.current = { latitude, longitude };
      setSelectedSnapId(null);
      animateToCoord(latitude, longitude);
      await updateAddressFromCoords(latitude, longitude);
    } finally {
      setLocating(false);
    }
  }, [animateToCoord, updateAddressFromCoords]);

  const handleConfirmPickup = useCallback(async () => {
    if (confirming) return;

    const { latitude, longitude } = centerCoordRef.current;
    const { primary, fullAddress } = addressRef.current;
    const resolvedAddress = fullAddress.trim() || primary.trim() || "Pickup point";
    const bookingPickupLabel = resolvePlaceDisplayName({
      primary: params.pickupLabel || primary,
      fullAddress: resolvedAddress,
    });
    const bookingDropLabel = resolvePlaceDisplayName({
      primary: params.dropLabel || String(params.drop ?? ""),
      fullAddress: String(params.drop ?? ""),
    });

    setConfirming(true);
    try {
      setLastRidePickup({
        latitude,
        longitude,
        primary: primary.trim() || resolvedAddress,
        fullAddress: resolvedAddress,
        kind: "pickup",
      });
      addRecentLocation({
        latitude,
        longitude,
        primary: primary.trim() || resolvedAddress,
        fullAddress: resolvedAddress,
        kind: "pickup",
      });

      const dropLat = params.dropLat != null ? Number(params.dropLat) : null;
      const dropLng = params.dropLng != null ? Number(params.dropLng) : null;
      const stopCoords = parseRideStopsParam(params.stops).map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));

      let routeParams: Record<string, string> = {};
      const quotedFareKm = parseRideFareDistanceKm(params);

      if (dropLat != null && dropLng != null && Number.isFinite(dropLat) && Number.isFinite(dropLng)) {
        const snapshot = await fetchAndStoreRideRoute({
          pickup: { latitude, longitude },
          drop: { latitude: dropLat, longitude: dropLng },
          stops: stopCoords,
          force: true,
        });
        if (quotedFareKm != null) {
          routeParams = {
            ...rideFareDistanceNavParams(quotedFareKm),
            ...(snapshot
              ? {
                  routeDurationSeconds: String(snapshot.routeDurationSeconds),
                  routeEtaMins: String(snapshot.routeEtaMinutes),
                  ...(snapshot.viaLabel?.trim()
                    ? { viaRouteName: snapshot.viaLabel.trim() }
                    : {}),
                }
              : {}),
          };
        } else if (snapshot) {
          routeParams = rideRouteParamsFromSnapshot(snapshot);
        }
      } else if (quotedFareKm != null) {
        routeParams = rideFareDistanceNavParams(quotedFareKm);
      } else if (params.tripKm) {
        routeParams.tripKm = String(params.tripKm);
      }

      const navParams: Record<string, string> = {
        pickup: resolvedAddress,
        drop: String(params.drop ?? ""),
        pickupLabel: bookingPickupLabel,
        dropLabel: bookingDropLabel,
        selectedRideId: String(params.selectedRideId ?? ""),
        selectedRideName: String(params.selectedRideName ?? "Ride"),
        selectedRideImageKey: String(params.selectedRideImageKey ?? "bike"),
        pickupLat: String(latitude),
        pickupLng: String(longitude),
        ...routeParams,
      };
      if (params.dropLat) navParams.dropLat = String(params.dropLat);
      if (params.dropLng) navParams.dropLng = String(params.dropLng);
      if (params.stops) navParams.stops = String(params.stops);
      if (params.estimatedFare != null && String(params.estimatedFare).trim() !== "") {
        navParams.estimatedFare = String(params.estimatedFare);
      }
      if (params.quotedListFare != null && String(params.quotedListFare).trim() !== "") {
        navParams.quotedListFare = String(params.quotedListFare);
      }
      if (params.quotedGrandTotal != null && String(params.quotedGrandTotal).trim() !== "") {
        navParams.quotedGrandTotal = String(params.quotedGrandTotal);
      }
      if (params.viaRouteName != null && String(params.viaRouteName).trim() !== "") {
        navParams.viaRouteName = String(params.viaRouteName);
      } else if (routeParams.viaRouteName) {
        navParams.viaRouteName = routeParams.viaRouteName;
      }
      if (params.customerTipAmount) navParams.customerTipAmount = String(params.customerTipAmount);
      if (params.pickupPincode) navParams.pickupPincode = String(params.pickupPincode);
      if (params.pickupState) navParams.pickupState = String(params.pickupState);
      if (params.bookedForSelf) navParams.bookedForSelf = String(params.bookedForSelf);
      if (params.passengerName) navParams.passengerName = String(params.passengerName);
      if (params.passengerPhone) navParams.passengerPhone = String(params.passengerPhone);
      if (params.selectedPlatformOfferId) {
        navParams.selectedPlatformOfferId = String(params.selectedPlatformOfferId);
      }
      if (params.forceNoAutoOffer) navParams.forceNoAutoOffer = String(params.forceNoAutoOffer);

      router.replace({ pathname: "/home/service/ride-searching", params: navParams });
    } finally {
      setConfirming(false);
    }
  }, [
    confirming,
    setLastRidePickup,
    addRecentLocation,
    params,
    router,
  ]);

  const sheetBottom = Math.max(insets.bottom, 16);
  const fabBottom = 16;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapWrap}>
        <MapboxWebPannableMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          snapPoints={snapPointsPayload}
          onSnapPointPress={handleSnapPress}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
        />

        <PickupCenterPin />

        <TouchableOpacity
          style={[styles.fab, styles.fabBack, { bottom: fabBottom }]}
          onPress={() => router.back()}
          activeOpacity={0.88}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fab, styles.fabLocate, { bottom: fabBottom }]}
          onPress={handleMyLocation}
          activeOpacity={0.88}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Ionicons name="locate" size={22} color="#2563EB" />
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
        <View style={styles.sheetIntro}>
          <View style={styles.sheetIntroIcon}>
            <Ionicons name="map-outline" size={22} color={GatiMitraColors.primaryMint} />
          </View>
          <View style={styles.sheetIntroText}>
            <AppText style={styles.sheetTitle}>Check your pickup point</AppText>
            <AppText style={styles.sheetSubtitle}>Select a nearby point for easier pickup</AppText>
          </View>
        </View>

        <View style={styles.addressCard}>
          <AppText style={styles.addressPrimary} numberOfLines={1}>
            {formatPrimaryLabel(address.primary)}
          </AppText>
          <AppText style={styles.addressFull} numberOfLines={2}>
            {address.fullAddress || "—"}
          </AppText>
          {geocoding ? (
            <View style={styles.geocodeOverlay} pointerEvents="none">
              <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
          onPress={handleConfirmPickup}
          activeOpacity={0.9}
          disabled={confirming}
        >
          {confirming ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <AppText style={styles.confirmBtnText}>Confirm pickup</AppText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapWrap: {
    flex: 1,
    minHeight: 280,
    backgroundColor: "#E5E7EB",
  },
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 36,
  },
  pickupLabelPill: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  pickupLabelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  pinShadow: {
    alignItems: "center",
    shadowColor: "#14532D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 7,
    elevation: 12,
  },
  pinTipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#15803D",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    marginTop: -14,
  },
  snapOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(34, 197, 94, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  snapOuterSelected: {
    backgroundColor: "rgba(34, 197, 94, 0.55)",
    transform: [{ scale: 1.15 }],
  },
  snapInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  snapInnerSelected: {
    backgroundColor: "#15803D",
  },
  fab: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  fabBack: {
    left: 16,
  },
  fabLocate: {
    right: 16,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  sheetIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  sheetIntroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetIntroText: {
    flex: 1,
    paddingTop: 2,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  addressCard: {
    borderWidth: 2,
    borderColor: GatiMitraColors.primaryMint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    height: 78,
    justifyContent: "center",
    overflow: "hidden",
  },
  geocodeOverlay: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  addressPrimary: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  addressFull: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  confirmBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.65,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
