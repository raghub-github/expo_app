/**
 * Confirm location on map – pin fixed at center, map draggable.
 * Coordinates and address update as the user moves the map.
 */

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { reverseGeocode } from "@/services/location.service";

const TEAL = "#14b8a6";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;

const GEOCODE_DEBOUNCE_MS = 400;

export default function LocationMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    primary?: string;
    fullAddress?: string;
  }>();

  const queryClient = useQueryClient();
  const { setAddressAndCoords } = useLocationStore();
  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);

  const lat = params.latitude != null ? parseFloat(params.latitude) : DEFAULT_LAT;
  const lng = params.longitude != null ? parseFloat(params.longitude) : DEFAULT_LNG;

  const [centerCoord, setCenterCoord] = useState({ latitude: lat, longitude: lng });
  const [address, setAddress] = useState({
    primary: params.primary ?? "Selected location",
    secondary: params.fullAddress ?? "",
    fullAddress: params.fullAddress ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialRegion: Region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  };

  const updateAddressFromCoords = useCallback(async (latitude: number, longitude: number) => {
    setGeocoding(true);
    try {
      const result = await reverseGeocode(longitude, latitude);
      setAddress(result);
    } catch {
      setAddress({
        primary: "Selected location",
        secondary: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
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

  const handleRegionChange = useCallback(
    (region: Region) => {
      const { latitude, longitude } = region;
      setCenterCoord({ latitude, longitude });
      scheduleGeocode(latitude, longitude);
    },
    [scheduleGeocode]
  );

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
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

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      const result = await reverseGeocode(centerCoord.longitude, centerCoord.latitude);
      setAddressAndCoords(result, {
        latitude: centerCoord.latitude,
        longitude: centerCoord.longitude,
      });
      addRecentLocation({
        latitude: centerCoord.latitude,
        longitude: centerCoord.longitude,
        primary: result.primary,
        fullAddress: result.fullAddress,
      });
      queryClient.invalidateQueries({ queryKey: ["merchants"] });
      router.back();
      router.back();
    } catch (e) {
      Alert.alert("Error", "Could not set location. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [centerCoord, setAddressAndCoords, addRecentLocation, queryClient, router]);

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.container}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
          </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm location</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Map – draggable; pin is fixed at center via overlay */}
      <View style={styles.mapWrap}>
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          scrollEnabled
          zoomEnabled
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
        <Text style={styles.hintText}>Drag the map to move the pin to the correct location</Text>
      </View>

      {/* Address card */}
      <View style={[styles.addressCard, { paddingBottom: insets.bottom + 16 }]}>
        {geocoding ? (
          <View style={styles.addressRow}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.geocodingText}>Updating address…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.addressPrimary} numberOfLines={1}>
              {address.primary}
            </Text>
            <Text style={styles.addressFull} numberOfLines={2}>
              {address.fullAddress || address.secondary}
            </Text>
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
              <Text style={styles.confirmBtnText}>Confirm location</Text>
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
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  geocodingText: { fontSize: 14, color: TEXT_GRAY },
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
