/**
 * Confirm location on map – pin fixed at center, map draggable.
 * Coordinates and address update as the user moves the map.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { MapboxWebPannableMap } from "@/components/maps/MapboxWebPannableMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { reverseGeocode } from "@/services/location.service";
import {
  isValidMapCoordinate,
  parseMapCoordParam,
  resolveMapCenter,
} from "@/lib/map-coordinates";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { useQueryClient } from "@tanstack/react-query";
// Full address is collected on a separate screen after map confirm.

const TEAL = "#14b8a6";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;

const GEOCODE_DEBOUNCE_MS = 500;
const PIN_RANGE_RADIUS_METERS = 120;
/** Ignore map settle events within this distance of the last geocoded pin. */
const GEOCODE_MIN_MOVE_METERS = 25;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function AddressRowSkeleton() {
  return (
    <View style={styles.addressSkeletonWrap}>
      <View style={[styles.skeletonLine, { width: "68%", height: 16, marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: "92%", height: 13 }]} />
    </View>
  );
}

export default function LocationMapScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    primary?: string;
    fullAddress?: string;
    fromOnboarding?: string;
    afterSaveReturn?: string;
  }>();

  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);

  const hasPassedAddress = Boolean(params.fullAddress?.trim() || params.primary?.trim());

  const fallbackCenter = { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG };
  const parsedLat = parseMapCoordParam(params.latitude, DEFAULT_LAT);
  const parsedLng = parseMapCoordParam(params.longitude, DEFAULT_LNG);
  const { latitude: lat, longitude: lng } = resolveMapCenter(parsedLat, parsedLng, fallbackCenter);

  const [centerCoord, setCenterCoord] = useState({ latitude: lat, longitude: lng });
  const centerCoordRef = useRef(centerCoord);
  const [address, setAddress] = useState({
    primary: params.primary ?? "Selected location",
    secondary: params.fullAddress ?? "",
    fullAddress: params.fullAddress ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeSeqRef = useRef(0);
  const coordRafRef = useRef<number | null>(null);
  const initialCoordsRef = useRef({ latitude: lat, longitude: lng });
  const lastGeocodedRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [userHasMovedMap, setUserHasMovedMap] = useState(false);
  const leavingConfirmedRef = useRef(false);
  const locationSnapshotRef = useRef(useLocationStore.getState());

  const initialRegion = useMemo(
    () => ({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }),
    [lat, lng]
  );

  const updateAddressFromCoords = useCallback(async (latitude: number, longitude: number) => {
    const seq = ++geocodeSeqRef.current;
    setGeocoding(true);
    try {
      const result = await reverseGeocode(longitude, latitude);
      if (seq !== geocodeSeqRef.current) return;
      setAddress(result);
      lastGeocodedRef.current = { latitude, longitude };
    } catch {
      if (seq !== geocodeSeqRef.current) return;
      setAddress({
        primary: "Selected location",
        secondary: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        fullAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      });
      lastGeocodedRef.current = { latitude, longitude };
    } finally {
      if (seq === geocodeSeqRef.current) setGeocoding(false);
    }
  }, []);

  const shouldGeocodeCoords = useCallback((latitude: number, longitude: number) => {
    if (!userHasMovedMap) return false;
    const last = lastGeocodedRef.current;
    if (!last) return true;
    return haversineMeters(last.latitude, last.longitude, latitude, longitude) >= GEOCODE_MIN_MOVE_METERS;
  }, [userHasMovedMap]);

  const scheduleGeocode = useCallback(
    (latitude: number, longitude: number) => {
      if (!shouldGeocodeCoords(latitude, longitude)) return;
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      geocodeTimeoutRef.current = setTimeout(() => {
        geocodeTimeoutRef.current = null;
        if (!shouldGeocodeCoords(latitude, longitude)) return;
        void updateAddressFromCoords(latitude, longitude);
      }, GEOCODE_DEBOUNCE_MS);
    },
    [shouldGeocodeCoords, updateAddressFromCoords]
  );

  const applyCenterCoord = useCallback((latitude: number, longitude: number) => {
    centerCoordRef.current = { latitude, longitude };
    setCenterCoord({ latitude, longitude });
  }, []);

  const handleRegionChange = useCallback((region: { latitude: number; longitude: number }) => {
    const { latitude, longitude } = region;
    if (!isValidMapCoordinate(latitude, longitude)) return;
    centerCoordRef.current = { latitude, longitude };
    if (coordRafRef.current != null) return;
    coordRafRef.current = requestAnimationFrame(() => {
      coordRafRef.current = null;
      setCenterCoord({ ...centerCoordRef.current });
    });
  }, []);

  const handleRegionChangeComplete = useCallback(
    (region: { latitude: number; longitude: number }) => {
      const { latitude, longitude } = region;
      if (!isValidMapCoordinate(latitude, longitude)) return;
      if (coordRafRef.current != null) {
        cancelAnimationFrame(coordRafRef.current);
        coordRafRef.current = null;
      }

      const movedFromInitial =
        haversineMeters(
          initialCoordsRef.current.latitude,
          initialCoordsRef.current.longitude,
          latitude,
          longitude
        ) >= GEOCODE_MIN_MOVE_METERS;
      if (movedFromInitial) setUserHasMovedMap(true);

      applyCenterCoord(latitude, longitude);
      scheduleGeocode(latitude, longitude);
    },
    [applyCenterCoord, scheduleGeocode]
  );

  useFocusEffect(
    useCallback(() => {
      locationSnapshotRef.current = useLocationStore.getState();
      leavingConfirmedRef.current = false;
    }, [])
  );

  useEffect(() => {
    if (hasPassedAddress) {
      lastGeocodedRef.current = { latitude: lat, longitude: lng };
    }
    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      if (coordRafRef.current != null) cancelAnimationFrame(coordRafRef.current);
      geocodeSeqRef.current += 1;
      if (!leavingConfirmedRef.current) {
        const snap = locationSnapshotRef.current;
        if (snap.coords && snap.address) {
          useLocationStore
            .getState()
            .setAddressAndCoords(snap.address, snap.coords, {
              source: snap.locationSource ?? "selected",
            });
        }
      }
    };
  }, [hasPassedAddress, lat, lng]);

  const restoreSnapshotLocation = useCallback(() => {
    const snap = locationSnapshotRef.current;
    if (snap.coords && snap.address) {
      useLocationStore.getState().setAddressAndCoords(snap.address, snap.coords, {
        source: snap.locationSource ?? "selected",
      });
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    const { latitude, longitude } = centerCoordRef.current;
    try {
      const result =
        userHasMovedMap || !hasPassedAddress
          ? await reverseGeocode(longitude, latitude)
          : {
              primary: address.primary,
              secondary: address.secondary,
              fullAddress: address.fullAddress || address.secondary,
            };
      leavingConfirmedRef.current = true;
      addRecentLocation({
        latitude,
        longitude,
        primary: result.primary,
        fullAddress: result.fullAddress,
      });
      void invalidateFoodHomeLocationQueries(queryClient);
      router.push({
        pathname: "/location-address",
        params: {
          latitude: String(latitude),
          longitude: String(longitude),
          primary: result.primary,
          fullAddress: result.fullAddress,
          fromOnboarding: params.fromOnboarding === "1" ? "1" : undefined,
          afterSaveReturn: params.afterSaveReturn === "checkout" ? "checkout" : undefined,
        },
      });
    } catch (e) {
      Alert.alert("Error", "Could not set location. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    addRecentLocation,
    address,
    hasPassedAddress,
    router,
    params.fromOnboarding,
    params.afterSaveReturn,
    userHasMovedMap,
  ]);

  const handleBack = useCallback(() => {
    restoreSnapshotLocation();
    router.back();
  }, [restoreSnapshotLocation, router]);

  const showAddressSkeleton = geocoding && userHasMovedMap;

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.container}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
          </TouchableOpacity>
        <AppText style={styles.headerTitle}>Confirm location</AppText>
        <View style={styles.headerRight} />
      </View>

      {/* Map – draggable; pin is fixed at center via overlay */}
      <View style={styles.mapWrap}>
        <MapboxWebPannableMap
          style={styles.map}
          initialRegion={initialRegion}
          circleRadiusMeters={PIN_RANGE_RADIUS_METERS}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
        />
        {/* Fixed center pin */}
        <View style={styles.pinOverlay} pointerEvents="none">
          <View style={styles.pinOuter}>
            <Ionicons name="location" size={36} color={TEAL} />
          </View>
        </View>
      </View>

      {/* Coordinates – update instantly */}
      <View style={styles.coordsBar}>
        <Text style={styles.coordsText}>
          {centerCoord.latitude.toFixed(5)}, {centerCoord.longitude.toFixed(5)}
        </Text>
      </View>

      {/* Hint */}
      <View style={styles.hintWrap}>
        <Ionicons name="move-outline" size={18} color={TEXT_GRAY} />
        <AppText style={styles.hintText}>Drag the map to move the pin to the correct location</AppText>
      </View>

      {/* Address card */}
      <View style={[styles.addressCard, { paddingBottom: insets.bottom + 16 }]}>
        {showAddressSkeleton ? (
          <AddressRowSkeleton />
        ) : (
          <>
            <AppText style={styles.addressPrimary} numberOfLines={1}>
              {address.primary}
            </AppText>
            <AppText style={styles.addressFull} numberOfLines={2}>
              {address.fullAddress || address.secondary}
            </AppText>
          </>
        )}
        <TouchableOpacity
          style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <AppText style={styles.confirmBtnText}>Confirm location</AppText>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  headerRight: { width: 36 },
  mapWrap: {
    flex: 1,
    position: "relative",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  pinOuter: {
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CARD_BG,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  coordsBar: {
    backgroundColor: CARD_BG,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  coordsText: {
    fontSize: 12,
    ...(Platform.OS === "ios" ? { fontFamily: "Menlo" } : { fontFamily: "monospace" }),
    color: TEXT_GRAY,
  },
  hintWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  hintText: { fontSize: 13, color: TEXT_GRAY },
  addressCard: {
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  addressSkeletonWrap: { minHeight: 44, justifyContent: "center" },
  skeletonLine: {
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
  },
  addressPrimary: { fontSize: 16, fontWeight: "700", color: TITLE_DARK },
  addressFull: { fontSize: 13, color: TEXT_GRAY, marginTop: 4 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TEAL,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
