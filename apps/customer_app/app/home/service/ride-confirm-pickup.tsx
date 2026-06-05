/**
 * Confirm pickup – Rapido-style map pin + nearby snap points before booking.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
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

const GEOCODE_DEBOUNCE_MS = 350;
const MAP_ZOOM_DELTA = 0.006;

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
        <Text style={styles.pickupLabelText}>Pickup Point</Text>
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
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
    estimatedFare?: string;
    tripKm?: string;
    customerTipAmount?: string;
  }>();

  const initialLat = params.pickupLat != null ? Number(params.pickupLat) : 24.7969;
  const initialLng = params.pickupLng != null ? Number(params.pickupLng) : 84.9914;
  const setLastRidePickup = useRecentLocationStore((s) => s.setLastRidePickup);
  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);

  const [centerCoord, setCenterCoord] = useState({
    latitude: initialLat,
    longitude: initialLng,
  });
  const [address, setAddress] = useState<AddressState>({
    primary: params.pickup?.trim() || "Pickup point",
    fullAddress: params.pickup?.trim() || "",
  });
  const centerCoordRef = useRef(centerCoord);
  const addressRef = useRef(address);
  centerCoordRef.current = centerCoord;
  addressRef.current = address;
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null);

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

  const updateAddressFromCoords = useCallback(async (latitude: number, longitude: number) => {
    setGeocoding(true);
    try {
      const result = await reverseGeocode(longitude, latitude);
      setAddress({
        primary: resolvePlaceDisplayName(result),
        fullAddress: result.fullAddress || resolvePlaceDisplayName(result),
      });
    } catch {
      setAddress({
        primary: "Pickup point",
        fullAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      });
    } finally {
      setGeocoding(false);
    }
  }, []);

  const scheduleGeocode = useCallback(
    (latitude: number, longitude: number) => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      geocodeTimeoutRef.current = setTimeout(() => {
        geocodeTimeoutRef.current = null;
        updateAddressFromCoords(latitude, longitude);
      }, GEOCODE_DEBOUNCE_MS);
    },
    [updateAddressFromCoords]
  );

  useEffect(() => {
    updateAddressFromCoords(initialLat, initialLng);
  }, [initialLat, initialLng, updateAddressFromCoords]);

  useEffect(
    () => () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    },
    []
  );

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
      setCenterCoord({ latitude: region.latitude, longitude: region.longitude });
      setSelectedSnapId(null);
      scheduleGeocode(region.latitude, region.longitude);
    },
    [scheduleGeocode]
  );

  const handleRegionChangeComplete = useCallback(
    (region: { latitude: number; longitude: number }) => {
      const { latitude, longitude } = region;
      setCenterCoord({ latitude, longitude });
      setSelectedSnapId(null);
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
        geocodeTimeoutRef.current = null;
      }
      updateAddressFromCoords(latitude, longitude);
    },
    [updateAddressFromCoords]
  );

  const handleSelectSnap = useCallback(
    (point: PickupSnapPoint) => {
      setSelectedSnapId(point.id);
      setCenterCoord({ latitude: point.latitude, longitude: point.longitude });
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
      setCenterCoord({ latitude, longitude });
      setSelectedSnapId(null);
      animateToCoord(latitude, longitude);
      await updateAddressFromCoords(latitude, longitude);
    } finally {
      setLocating(false);
    }
  }, [animateToCoord, updateAddressFromCoords]);

  const handleConfirmPickup = useCallback(() => {
    if (geocoding) return;

    const { latitude, longitude } = centerCoordRef.current;
    const { primary, fullAddress } = addressRef.current;
    const resolvedAddress = fullAddress.trim() || primary.trim() || "Pickup point";

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

    const navParams: Record<string, string> = {
      pickup: resolvedAddress,
      drop: String(params.drop ?? ""),
      selectedRideId: String(params.selectedRideId ?? ""),
      selectedRideName: String(params.selectedRideName ?? "Ride"),
      selectedRideImageKey: String(params.selectedRideImageKey ?? "bike"),
      pickupLat: String(latitude),
      pickupLng: String(longitude),
    };
    if (params.dropLat) navParams.dropLat = String(params.dropLat);
    if (params.dropLng) navParams.dropLng = String(params.dropLng);
    if (params.stops) navParams.stops = String(params.stops);
    if (params.estimatedFare) navParams.estimatedFare = String(params.estimatedFare);
    if (params.customerTipAmount) navParams.customerTipAmount = String(params.customerTipAmount);
    if (params.tripKm) navParams.tripKm = String(params.tripKm);
    if (params.bookedForSelf) navParams.bookedForSelf = String(params.bookedForSelf);
    if (params.passengerName) navParams.passengerName = String(params.passengerName);
    if (params.passengerPhone) navParams.passengerPhone = String(params.passengerPhone);

    router.replace({ pathname: "/home/service/ride-searching", params: navParams });
  }, [
    geocoding,
    setLastRidePickup,
    addRecentLocation,
    params,
    router,
  ]);

  const sheetBottom = Math.max(insets.bottom, 16);
  const fabBottom = sheetBottom + 200;

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
            <Text style={styles.sheetTitle}>Check your pickup point</Text>
            <Text style={styles.sheetSubtitle}>Select a nearby point for easier pickup</Text>
          </View>
        </View>

        <View style={styles.addressCard}>
          {geocoding ? (
            <View style={styles.geocodeRow}>
              <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
              <Text style={styles.geocodingText}>Updating address…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.addressPrimary} numberOfLines={2}>
                {formatPrimaryLabel(address.primary)}
              </Text>
              <Text style={styles.addressFull} numberOfLines={3}>
                {address.fullAddress || "—"}
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, geocoding && styles.confirmBtnDisabled]}
          onPress={handleConfirmPickup}
          activeOpacity={0.9}
          disabled={geocoding}
        >
          <Text style={styles.confirmBtnText}>Confirm pickup</Text>
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
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    minHeight: 72,
    justifyContent: "center",
  },
  geocodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  geocodingText: {
    fontSize: 14,
    color: "#6B7280",
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
