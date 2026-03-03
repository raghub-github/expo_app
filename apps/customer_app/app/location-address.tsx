/**
 * Full address form after confirming pin on map.
 * Always shown for new/changing locations so user can enter door/building details.
 */

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { addressService } from "@/services/address.service";

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
  const [landmark, setLandmark] = useState("");
  const [label, setLabel] = useState<"Home" | "Work" | "Other">("Home");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!line1.trim()) {
      setError("Please enter flat / house / building details.");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError("Location is missing. Please try again.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const finalFull =
        baseFullAddress && !baseFullAddress.toLowerCase().startsWith(line1.trim().toLowerCase())
          ? `${line1.trim()}, ${baseFullAddress}`
          : line1.trim() || baseFullAddress;
      await addressService.addAddress({
        label,
        fullAddress: finalFull,
        landmark: landmark.trim() || null,
        city: null,
        state: null,
        pincode: null,
        country: null,
        latitude: lat,
        longitude: lon,
        isDefault: fromOnboarding,
      });
      await addressService.setActiveLocation({ latitude: lat, longitude: lon, address: finalFull });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      if (fromOnboarding) {
        router.replace("/(onboarding)/permissions");
      } else {
        router.back();
        router.back();
      }
    } catch {
      setError("Could not save address. Please try again.");
    } finally {
      setSubmitting(false);
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
            We’ve pinned your location on the map. Add flat / house / building details so riders can find you easily.
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

          <Text style={styles.label}>Landmark (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Nearby shop / signal / landmark"
            placeholderTextColor={TEXT_GRAY}
            value={landmark}
            onChangeText={setLandmark}
            editable={!submitting}
          />

          <Text style={styles.label}>Save as</Text>
          <View style={styles.chipRow}>
            {(["Home", "Work", "Other"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, label === opt && styles.chipActive]}
                onPress={() => setLabel(opt)}
                disabled={submitting}
              >
                <Text style={[styles.chipText, label === opt && styles.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Map location</Text>
            <Text style={styles.summaryText} numberOfLines={3}>
              {baseFullAddress || "Location selected on map"}
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleSave}
            disabled={submitting}
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
  chipText: { fontSize: 13, color: TITLE_DARK },
  chipTextActive: { fontWeight: "600", color: TEAL },
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

