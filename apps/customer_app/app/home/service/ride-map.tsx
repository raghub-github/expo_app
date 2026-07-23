/**
 * Ride map picker – select pickup, drop, or stop on map (Rapido-style).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { MapboxWebPannableMap } from "@/components/maps/MapboxWebPannableMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reverseGeocode, resolvePlaceDisplayName } from "@/services/location.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  useRideMapPickerStore,
  type RideMapPickerField,
} from "@/store/rideMapPickerStore";

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;
const GEOCODE_DEBOUNCE_MS = 350;
const FAB_SHEET_GAP = 12;
/** Until onLayout runs, keep FABs above a typical sheet height. */
const DEFAULT_SHEET_HEIGHT = 300;

function selectButtonLabel(field: RideMapPickerField): string {
  if (field === "pickup") return "Select Pickup";
  if (field === "stop") return "Select Stop";
  return "Select Drop";
}

export default function RideMapPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<CustomerMapRef>(null);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPendingResult = useRideMapPickerStore((s) => s.setPendingResult);

  const params = useLocalSearchParams<{
    field?: string;
    stopIndex?: string;
    latitude?: string;
    longitude?: string;
    primary?: string;
    fullAddress?: string;
  }>();

  const field = (params.field === "pickup" || params.field === "stop" ? params.field : "drop") as RideMapPickerField;
  const stopIndex = params.stopIndex != null ? Number(params.stopIndex) : undefined;
  const initialLat = params.latitude != null ? parseFloat(params.latitude) : DEFAULT_LAT;
  const initialLng = params.longitude != null ? parseFloat(params.longitude) : DEFAULT_LNG;

  const [centerCoord, setCenterCoord] = useState({ latitude: initialLat, longitude: initialLng });
  const [address, setAddress] = useState({
    primary: params.primary ?? "Selected location",
    fullAddress: params.fullAddress ?? "",
  });
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET_HEIGHT);

  const fabBottom = sheetHeight + FAB_SHEET_GAP;

  const initialRegion = {
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  const updateAddressFromCoords = useCallback(async (latitude: number, longitude: number) => {
    setGeocoding(true);
    try {
      const result = await reverseGeocode(longitude, latitude);
      setAddress(result);
    } catch {
      setAddress({
        primary: "Selected location",
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

  const handleRegionChangeComplete = useCallback(
    (region: { latitude: number; longitude: number }) => {
      const { latitude, longitude } = region;
      setCenterCoord({ latitude, longitude });
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
        geocodeTimeoutRef.current = null;
      }
      updateAddressFromCoords(latitude, longitude);
    },
    [updateAddressFromCoords]
  );

  const handleRegionChange = useCallback(
    (region: { latitude: number; longitude: number }) => {
      setCenterCoord({ latitude: region.latitude, longitude: region.longitude });
      scheduleGeocode(region.latitude, region.longitude);
    },
    [scheduleGeocode]
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
      mapRef.current?.animateToRegion?.({
        latitude,
        longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      });
      await updateAddressFromCoords(latitude, longitude);
    } finally {
      setLocating(false);
    }
  }, [updateAddressFromCoords]);

  const handleConfirm = useCallback(() => {
    const displayPrimary = resolvePlaceDisplayName(address);
    setPendingResult({
      field,
      stopIndex: field === "stop" ? stopIndex : undefined,
      primary: displayPrimary,
      fullAddress: address.fullAddress || displayPrimary,
      latitude: centerCoord.latitude,
      longitude: centerCoord.longitude,
    });
    router.back();
  }, [field, stopIndex, address, centerCoord, setPendingResult, router]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <MapboxWebPannableMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      />

      {/* Center pin */}
      <View style={styles.pinOverlay} pointerEvents="none">
        <Ionicons name="location" size={44} color="#D32F2F" />
      </View>

      {/* Floating controls */}
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

      {/* Bottom sheet */}
      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setSheetHeight(h);
        }}
      >
        <View style={styles.sheetHeader}>
          <AppText style={styles.sheetTitle}>Select your location</AppText>
          <TouchableOpacity style={styles.changeBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <AppText style={styles.changeBtnText}>Change</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.addressBox}>
          <View style={styles.addressDot} />
          <View style={styles.addressTextCol}>
            {geocoding ? (
              <View style={styles.geocodeRow}>
                <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
                <AppText style={styles.geocodingText}>Updating address…</AppText>
              </View>
            ) : (
              <>
                <AppText style={styles.addressPrimary} numberOfLines={1}>
                  {resolvePlaceDisplayName(address)}
                </AppText>
                <AppText style={styles.addressFull} numberOfLines={2}>
                  {address.fullAddress}
                </AppText>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={handleConfirm}
          activeOpacity={0.9}
          disabled={geocoding}
        >
          <AppText style={styles.confirmBtnText}>{selectButtonLabel(field)}</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E5E7EB",
  },
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
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
    elevation: 8,
    zIndex: 30,
  },
  fabBack: {
    left: 16,
  },
  fabLocate: {
    right: 16,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
    zIndex: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 12,
  },
  changeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
  },
  changeBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#FAFAFA",
  },
  addressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D32F2F",
    marginTop: 4,
    marginRight: 12,
  },
  addressTextCol: {
    flex: 1,
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
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
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
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
