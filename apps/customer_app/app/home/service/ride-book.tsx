/**
 * Ride book screen – map with route, editable pickup/drop, ride cards with distance, Book button.
 */

import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Polyline, Marker } from "react-native-maps";
import { GatiMitraColors } from "@/constants/gatimitra";
import { customerMapProps } from "@/lib/mapViewProps";

const { width, height: WINDOW_HEIGHT } = Dimensions.get("window");
const PAD = 14;
/** Map area extra large; vehicle cards sit below in scroll. */
const MAP_HEIGHT = Math.round(WINDOW_HEIGHT * 0.48);

/** Distance in km between two points (Haversine). */
function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `~${Math.round(km * 1000)} m`;
  return `~${km.toFixed(1)} km`;
}

const RIDE_OPTIONS = [
  { id: "bike", name: "Bike", tag: "FASTEST", time: "2 mins away", dropTime: "Drop 12:02 pm", price: "₹24", icon: "bicycle" as const },
  { id: "auto", name: "Auto", tag: null, time: "4 mins", dropTime: "Drop 12:05 pm", price: "₹55", icon: "bus" as const },
  { id: "erickshaw", name: "Personal E-Rickshaw", tag: null, time: "2 mins", dropTime: "Drop 12:03 pm", price: "₹45", icon: "car" as const },
];

const DEFAULT_REGION = {
  latitude: 24.7969,
  longitude: 84.9914,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

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
  }>();
  const [pickupText, setPickupText] = useState(params.pickup ?? "Pickup location");
  const [dropText, setDropText] = useState(params.drop ?? "Drop location");

  const [selectedRideId, setSelectedRideId] = useState<string>("bike");

  const selectedRide = RIDE_OPTIONS.find((r) => r.id === selectedRideId) ?? RIDE_OPTIONS[0];

  const pickupLat = params.pickupLat != null ? Number(params.pickupLat) : null;
  const pickupLng = params.pickupLng != null ? Number(params.pickupLng) : null;
  const dropLat = params.dropLat != null ? Number(params.dropLat) : null;
  const dropLng = params.dropLng != null ? Number(params.dropLng) : null;

  const distanceKmVal =
    pickupLat != null && pickupLng != null && dropLat != null && dropLng != null
      ? distanceKm(pickupLat, pickupLng, dropLat, dropLng)
      : null;
  const distanceText = distanceKmVal != null ? formatDistance(distanceKmVal) : null;

  const routeCoordinates = useMemo(() => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return [];
    return [
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropLat, longitude: dropLng },
    ];
  }, [pickupLat, pickupLng, dropLat, dropLng]);

  const mapRegion = useMemo(() => {
    if (routeCoordinates.length < 2) return DEFAULT_REGION;
    const lats = routeCoordinates.map((c) => c.latitude);
    const lngs = routeCoordinates.map((c) => c.longitude);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const pad = 0.01;
    return {
      latitude: (latMin + latMax) / 2,
      longitude: (lngMin + lngMax) / 2,
      latitudeDelta: Math.max(0.05, latMax - latMin + pad * 2),
      longitudeDelta: Math.max(0.05, lngMax - lngMin + pad * 2),
    };
  }, [routeCoordinates]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* Map section */}
      <View style={[styles.mapWrap, { height: MAP_HEIGHT }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          {...customerMapProps()}
          initialRegion={DEFAULT_REGION}
          region={routeCoordinates.length >= 2 ? mapRegion : undefined}
          showsUserLocation
          loadingIndicatorColor={GatiMitraColors.emerald}
        >
          {routeCoordinates.length >= 2 && (
            <>
              <Polyline
                coordinates={routeCoordinates}
                strokeColor={GatiMitraColors.emerald}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />
              <Marker
                coordinate={routeCoordinates[0]}
                pinColor={GatiMitraColors.emerald}
                title="Pickup"
              />
              <Marker
                coordinate={routeCoordinates[1]}
                pinColor={GatiMitraColors.warmOrange}
                title="Drop"
              />
            </>
          )}
        </MapView>
        <View style={styles.mapOverlay}>
          <TouchableOpacity style={styles.backCircle} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.chipsContainer}>
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Ionicons name="location" size={14} color={GatiMitraColors.emerald} />
                <TextInput
                  style={styles.chipInput}
                  value={pickupText}
                  onChangeText={setPickupText}
                  placeholder="Pickup location"
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  numberOfLines={1}
                />
                <Ionicons name="create-outline" size={14} color={GatiMitraColors.textSecondary} />
              </View>
            </View>
            <View style={[styles.chipRow, { marginTop: 4 }]}>
              <View style={styles.chip}>
                <Ionicons name="location" size={14} color={GatiMitraColors.warmOrange} />
                <TextInput
                  style={styles.chipInput}
                  value={dropText}
                  onChangeText={setDropText}
                  placeholder="Drop location"
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  numberOfLines={1}
                />
                <Ionicons name="create-outline" size={14} color={GatiMitraColors.textSecondary} />
              </View>
            </View>
          </View>
          <View style={styles.mapActions}>
            <TouchableOpacity style={styles.mapActionBtn}>
              <Ionicons name="add-circle-outline" size={20} color={GatiMitraColors.textPrimary} />
              <Text style={styles.mapActionText}>Add stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.currentLocBtn}>
              <Ionicons name="locate" size={22} color={GatiMitraColors.emerald} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Ride options */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {RIDE_OPTIONS.map((ride) => (
          <TouchableOpacity
            key={ride.id}
            style={[styles.rideCard, selectedRideId === ride.id && styles.rideCardSelected]}
            onPress={() => setSelectedRideId(ride.id)}
            activeOpacity={0.8}
          >
            <View style={styles.rideIconWrap}>
              <Ionicons name={ride.icon} size={28} color={GatiMitraColors.textPrimary} />
            </View>
            <View style={styles.rideInfo}>
              <View style={styles.rideNameRow}>
                <Text style={styles.rideName}>{ride.name}</Text>
                {ride.tag && (
                  <View style={styles.fastestTag}>
                    <Text style={styles.fastestText}>{ride.tag}</Text>
                  </View>
                )}
              </View>
              {distanceText != null && (
                <Text style={styles.rideDistance}>{distanceText}</Text>
              )}
              <Text style={styles.rideTime}>{ride.time}</Text>
              <Text style={styles.rideDrop}>{ride.dropTime}</Text>
            </View>
            <Text style={styles.ridePrice}>{ride.price}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.bottomOption}>
          <Ionicons name="cash-outline" size={20} color={GatiMitraColors.textPrimary} />
          <Text style={styles.bottomOptionText}>Cash</Text>
          <Ionicons name="chevron-forward" size={16} color={GatiMitraColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bookBtn}
          onPress={() => {}}
          activeOpacity={0.9}
        >
          <Text style={styles.bookBtnText}>Book {selectedRide.name}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  mapWrap: {
    width: "100%",
    overflow: "hidden",
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: PAD,
    paddingTop: 0,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginBottom: 2,
  },
  chipsContainer: {
    marginTop: -18,
  },
  chipRow: {
    flexDirection: "row",
    alignSelf: "center",
    width: "82%",
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    ...GatiMitraColors.elevationShadow,
  },
  chipInput: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraColors.textPrimary,
    fontWeight: "600",
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  mapActions: {
    position: "absolute",
    right: PAD,
    bottom: 8,
    alignItems: "flex-end",
    gap: 6,
  },
  mapActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  mapActionText: { fontSize: 11, fontWeight: "600", color: GatiMitraColors.textPrimary },
  currentLocBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraColors.elevationShadow,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: PAD, paddingTop: 8 },
  rideCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.background,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
    ...GatiMitraColors.elevationShadow,
  },
  rideCardSelected: { borderColor: GatiMitraColors.emerald },
  rideIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rideInfo: { flex: 1 },
  rideNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  rideName: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  fastestTag: {
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fastestText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  rideDistance: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
    marginBottom: 2,
  },
  rideTime: { fontSize: 12, color: GatiMitraColors.textSecondary, marginBottom: 1 },
  rideDrop: { fontSize: 11, color: GatiMitraColors.textSecondary },
  ridePrice: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary, marginLeft: 6 },
  bottomBar: {
    backgroundColor: GatiMitraColors.background,
    paddingHorizontal: PAD,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
  },
  bottomOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    marginBottom: 4,
  },
  bottomOptionText: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  bookBtn: {
    backgroundColor: GatiMitraColors.mint,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    ...GatiMitraColors.elevationShadow,
  },
  bookBtnText: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
});
