/**
 * Full address form after confirming pin on map.
 * Reverse-geocode auto-fills city/state/pincode; Home/Work uniqueness; 500m nearby check; double-tap guard.
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";
import { reverseGeocode } from "@/services/location.service";

const NEARBY_RADIUS_METERS = 500;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const BG = "#F5F7FA";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const TEAL = "#14b8a6";

export default function LocationAddressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);

  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    primary?: string;
    fullAddress?: string;
    fromOnboarding?: string;
  }>();

  const lat = params.latitude != null ? parseFloat(params.latitude) : NaN;
  const lon = params.longitude != null ? parseFloat(params.longitude) : NaN;
  const baseFullAddress = (params.fullAddress ?? "").trim();
  const fromOnboarding = params.fromOnboarding === "1";

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [landmark, setLandmark] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [label, setLabel] = useState<"Home" | "Work" | "Other">("Home");
  const [customLabel, setCustomLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(true);
  const [error, setError] = useState("");

  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    retry: false,
  });

  const hasHome = savedAddresses.some((a) => (a.label ?? "").toLowerCase() === "home");
  const hasWork = savedAddresses.some((a) => (a.label ?? "").toLowerCase() === "work");

  useEffect(() => {
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setGeocodeLoading(false);
      return;
    }
    let cancelled = false;
    setGeocodeLoading(true);
    reverseGeocode(lon, lat)
      .then((result) => {
        if (cancelled) return;
        if (result.city) setCity(result.city);
        if (result.state) setState(result.state);
        if (result.pincode) setPincode(result.pincode);
        if (result.secondary) setLine2(result.secondary);
      })
      .catch(() => {
        if (!cancelled) setError("Could not fetch location details.");
      })
      .finally(() => {
        if (!cancelled) setGeocodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const handleSave = async () => {
    if (submittingRef.current) return;
    if (!line1.trim()) {
      setError("Please enter flat / house / building details.");
      return;
    }
    if (!contactName.trim()) {
      setError("Please enter the contact name for this address.");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError("Location is missing. Please try again.");
      return;
    }
    const cityVal = city.trim() || "—";
    const stateVal = state.trim() || "—";
    const pincodeVal = pincode.trim() || "—";

    const finalLabel = label === "Other" && customLabel.trim() ? customLabel.trim() : label;
    const fullAddress = [line1.trim(), line2.trim(), cityVal !== "—" ? cityVal : "", stateVal !== "—" ? stateVal : "", pincodeVal !== "—" ? pincodeVal : ""]
      .filter(Boolean)
      .join(", ");

    const savedWithin500m: Address | null = (() => {
      let best: { addr: Address; distance: number } | null = null;
      for (const addr of savedAddresses) {
        const d = distanceMeters(lat, lon, addr.latitude, addr.longitude);
        if (d <= NEARBY_RADIUS_METERS && (!best || d < best.distance)) best = { addr, distance: d };
      }
      return best?.addr ?? null;
    })();

    if (savedWithin500m) {
      Alert.alert(
        "Address nearby",
        `You already have a saved address "${savedWithin500m.label ?? "Address"}" very close to this location. Do you want to use it instead?`,
        [
          { text: "Use saved address", onPress: async () => {
            try {
              await addressService.setActiveLocation({
                latitude: savedWithin500m.latitude,
                longitude: savedWithin500m.longitude,
                address: savedWithin500m.fullAddress,
              });
              queryClient.invalidateQueries({ queryKey: ["addresses"] });
              if (fromOnboarding) router.replace("/(onboarding)/permissions");
              else router.replace("/(tabs)/");
            } catch {
              setError("Could not set location.");
            }
          } },
          { text: "Save as new", style: "cancel", onPress: () => doSave(finalLabel, fullAddress, cityVal, stateVal, pincodeVal) },
        ]
      );
      return;
    }

    await doSave(finalLabel, fullAddress, cityVal, stateVal, pincodeVal);
  };

  const doSave = async (
    finalLabel: string,
    fullAddress: string,
    cityVal: string,
    stateVal: string,
    pincodeVal: string
  ) => {
    if (submittingRef.current) return;
    setError("");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await addressService.addAddress({
        label: finalLabel,
        fullAddress,
        landmark: landmark.trim() || null,
        city: cityVal === "—" ? null : cityVal,
        state: stateVal === "—" ? null : stateVal,
        pincode: pincodeVal === "—" ? null : pincodeVal,
        country: "IN",
        latitude: lat,
        longitude: lon,
        isDefault: fromOnboarding,
        contactName: contactName.trim() || null,
        contactMobile: contactMobile.trim() || null,
      });
      await addressService.setActiveLocation({ latitude: lat, longitude: lon, address: fullAddress });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      if (fromOnboarding) {
        router.replace("/(onboarding)/permissions");
      } else {
        router.replace("/(tabs)/");
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not save address. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={TITLE_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add full address</Text>
        <View style={styles.headerRight} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.subtitle}>
            We've pinned your location on the map. Add flat / house / building details so riders can find you easily.
          </Text>

          <Text style={styles.label}>Flat / House / Building *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Flat 501, Shyam Residency"
            placeholderTextColor={TEXT_GRAY}
            value={line1}
            onChangeText={setLine1}
            editable={!submitting}
          />

          <Text style={styles.label}>Street / Area (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Area, street name"
            placeholderTextColor={TEXT_GRAY}
            value={line2}
            onChangeText={setLine2}
            editable={!submitting}
          />

          <Text style={styles.label}>City *</Text>
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor={TEXT_GRAY}
            value={city}
            onChangeText={setCity}
            editable={!submitting}
          />

          <Text style={styles.label}>State *</Text>
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor={TEXT_GRAY}
            value={state}
            onChangeText={setState}
            editable={!submitting}
          />

          <Text style={styles.label}>Pincode *</Text>
          <TextInput
            style={styles.input}
            placeholder="Pincode"
            placeholderTextColor={TEXT_GRAY}
            value={pincode}
            onChangeText={setPincode}
            keyboardType="number-pad"
            editable={!submitting}
          />

          <Text style={styles.label}>Landmark (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Nearby shop / signal / landmark"
            placeholderTextColor={TEXT_GRAY}
            value={landmark}
            onChangeText={setLandmark}
            editable={!submitting}
          />

          <Text style={styles.label}>Contact name (for this address)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Raghu Bhunia, Mom, Office"
            placeholderTextColor={TEXT_GRAY}
            value={contactName}
            onChangeText={setContactName}
            editable={!submitting}
          />

          <Text style={styles.label}>Contact mobile (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Mobile number used by receiver"
            placeholderTextColor={TEXT_GRAY}
            value={contactMobile}
            onChangeText={setContactMobile}
            keyboardType="phone-pad"
            editable={!submitting}
          />

          <Text style={styles.label}>Save as</Text>
          <View style={styles.chipRow}>
            {(["Home", "Work", "Other"] as const).map((opt) => {
              const disabled = (opt === "Home" && hasHome) || (opt === "Work" && hasWork) || submitting;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, label === opt && styles.chipActive, disabled && styles.chipDisabled]}
                  onPress={() => !disabled && setLabel(opt)}
                  disabled={disabled}
                >
                  <Text style={[styles.chipText, label === opt && styles.chipTextActive, disabled && styles.chipTextDisabled]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {label === "Other" && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Label name (e.g. Mom's house)"
              placeholderTextColor={TEXT_GRAY}
              value={customLabel}
              onChangeText={setCustomLabel}
              editable={!submitting}
            />
          )}

          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Map location</Text>
            <Text style={styles.summaryText} numberOfLines={3}>
              {geocodeLoading ? "Loading…" : baseFullAddress || "Location selected on map"}
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (submitting || geocodeLoading) && styles.primaryBtnDisabled]}
            onPress={handleSave}
            disabled={submitting || geocodeLoading}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Save & Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: TITLE_DARK },
  headerRight: { width: 32 },
  scroll: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  subtitle: { fontSize: 14, color: TEXT_GRAY, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: TITLE_DARK, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: TITLE_DARK,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFF",
  },
  chipActive: { borderColor: TEAL, backgroundColor: "#E0F2F1" },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: 13, color: TITLE_DARK },
  chipTextActive: { fontWeight: "600", color: TEAL },
  chipTextDisabled: { color: TEXT_GRAY },
  summaryBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  summaryTitle: { fontSize: 13, fontWeight: "600", color: TITLE_DARK, marginBottom: 4 },
  summaryText: { fontSize: 13, color: TEXT_GRAY },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 4, marginBottom: 4 },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});
