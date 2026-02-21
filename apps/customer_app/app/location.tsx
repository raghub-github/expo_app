/**
 * Select a location – GatiMitra. Search in header (forward geocode), use current location, add address, saved addresses.
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocationStore } from "@/store/locationStore";
import { searchPlaces, type PlaceSearchResult } from "@/services/location.service";
import type { ReverseGeocodeResult } from "@/services/location.service";

const BG = "#F5F7FA";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const TEAL = "#14b8a6";
const TEAL_LIGHT = "#E0F2F1";
const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
});

type SavedAddress = {
  id: string;
  label: string;
  primary: string;
  fullAddress: string;
  phone?: string;
  distance?: string;
};

const MOCK_SAVED_ADDRESSES: SavedAddress[] = [
  {
    id: "1",
    label: "Home",
    primary: "Home",
    fullAddress: "rajesh building/08/2nd floor, 2nd Floor, Bahadurpur Bagicha, Bahadurpur, Patna",
    phone: "+91-9113194305",
    distance: "88 km",
  },
  {
    id: "2",
    label: "Work",
    primary: "Work",
    fullAddress: "456, Park Ave, City - 400002",
    phone: "+91-9876543210",
    distance: "390 km",
  },
];

function savedToAddress(s: SavedAddress): ReverseGeocodeResult {
  return {
    primary: s.label,
    secondary: s.fullAddress.slice(0, 80),
    fullAddress: s.fullAddress,
  };
}

const SEARCH_DEBOUNCE_MS = 250;

export default function SelectLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { address, requestPermissionAndFetch, setAddress, loading } = useLocationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const currentLocationName = address?.primary ?? "Current location";

  // Forward geocode when user types in search (debounced; abort stale for real-time)
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      searchPlaces(query, { signal: controller.signal })
        .then((results) => {
          if (!controller.signal.aborted) setSearchResults(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, [searchQuery]);

  const handleUseCurrentLocation = async () => {
    await requestPermissionAndFetch();
    router.back();
  };

  const handleSelectSearchResult = (place: PlaceSearchResult) => {
    router.push({
      pathname: "/location-map",
      params: {
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        primary: place.primary,
        fullAddress: place.fullAddress,
      },
    });
  };

  const handleSelectSaved = (saved: SavedAddress) => {
    setAddress(savedToAddress(saved));
    router.back();
  };

  const filteredSaved = MOCK_SAVED_ADDRESSES.filter(
    (a) =>
      !searchQuery.trim() ||
      a.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.fullAddress.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showSearchSection = searchQuery.trim().length >= 2;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      {/* Header with integrated search – minimal gap below status bar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select a location</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.searchBarWrap}>
          <View style={[styles.searchBar, SHADOW]}>
            <Ionicons name="search" size={20} color={TEAL} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for area, street name..."
              placeholderTextColor={TEXT_GRAY}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={TEXT_GRAY} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search results from API */}
        {showSearchSection && (
          <View style={[styles.sectionHeadRow, { marginTop: 0 }]}>
            <Ionicons name="search" size={14} color={TEAL} />
            <Text style={styles.sectionHeading}>SEARCH RESULTS</Text>
          </View>
        )}
        {showSearchSection && searchLoading && (
          <View style={styles.searchLoadingWrap}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.searchLoadingText}>Searching for places...</Text>
          </View>
        )}
        {showSearchSection && !searchLoading && searchResults.length > 0 && (
          <View style={styles.searchResultsWrap}>
            {searchResults.map((place, index) => (
              <TouchableOpacity
                key={`${place.fullAddress}-${index}`}
                style={[styles.addressCard, SHADOW]}
                onPress={() => handleSelectSearchResult(place)}
                activeOpacity={0.85}
              >
                <View style={styles.addressCardLeft}>
                  <View style={[styles.addressIconWrap, { backgroundColor: TEAL_LIGHT }]}>
                    <Ionicons name="location" size={22} color={TEAL} />
                  </View>
                  <View style={styles.addressCardContent}>
                    <Text style={styles.addressLabel}>{place.primary}</Text>
                    <Text style={styles.addressLine} numberOfLines={2}>
                      {place.fullAddress}
                    </Text>
                  </View>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={TEAL} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {showSearchSection && !searchLoading && searchResults.length === 0 && (
          <View style={styles.emptySaved}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="search-outline" size={40} color={BORDER} />
            </View>
            <Text style={styles.emptySavedText}>No places found. Try a different search.</Text>
          </View>
        )}

        {/* Use current location */}
        <TouchableOpacity
          style={[styles.optionCard, SHADOW]}
          onPress={handleUseCurrentLocation}
          activeOpacity={0.85}
          disabled={loading}
        >
          <View style={[styles.optionIconWrap, { backgroundColor: TEAL_LIGHT }]}>
            <Ionicons name="locate" size={24} color={TEAL} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Use current location</Text>
            <Text style={styles.optionSub} numberOfLines={1}>
              {loading ? "Getting location..." : currentLocationName}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={TEAL} />
          ) : (
            <View style={styles.chevronWrap}>
              <Ionicons name="chevron-forward" size={20} color={TEAL} />
            </View>
          )}
        </TouchableOpacity>

        {/* Add Address */}
        <TouchableOpacity
          style={[styles.optionCard, SHADOW]}
          onPress={() => router.push("/profile/addresses")}
          activeOpacity={0.85}
        >
          <View style={[styles.optionIconWrap, { backgroundColor: "#EDE9FE" }]}>
            <Ionicons name="add" size={24} color="#7c3aed" />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Add Address</Text>
            <Text style={styles.optionSub}>Save a new delivery address</Text>
          </View>
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={20} color={TEAL} />
          </View>
        </TouchableOpacity>

        {/* SAVED ADDRESSES */}
        <View style={styles.sectionHeadRow}>
          <Ionicons name="bookmark" size={14} color={TEAL} />
          <Text style={styles.sectionHeading}>SAVED ADDRESSES</Text>
        </View>
        {filteredSaved.length === 0 ? (
          <View style={styles.emptySaved}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={40} color={BORDER} />
            </View>
            <Text style={styles.emptySavedText}>
              {searchQuery.trim() ? "No addresses match your search." : "No saved addresses yet."}
            </Text>
            {!searchQuery.trim() && (
              <TouchableOpacity onPress={() => router.push("/profile/addresses")}>
                <Text style={styles.addAddressLink}>Add address</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredSaved.map((saved) => (
            <TouchableOpacity
              key={saved.id}
              style={[styles.addressCard, SHADOW]}
              onPress={() => handleSelectSaved(saved)}
              activeOpacity={0.85}
            >
              <View style={styles.addressCardLeft}>
                <View style={[styles.addressIconWrap, { backgroundColor: TEAL_LIGHT }]}>
                  <Ionicons
                    name={saved.label === "Home" ? "home" : "briefcase"}
                    size={22}
                    color={TEAL}
                  />
                </View>
                <View style={styles.addressCardContent}>
                  {saved.distance ? (
                    <View style={styles.distanceRow}>
                      <Ionicons name="navigate" size={12} color={TEAL} />
                      <Text style={styles.addressDistance}>{saved.distance}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.addressLabel}>{saved.label}</Text>
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {saved.fullAddress}
                  </Text>
                  {saved.phone ? (
                    <View style={styles.phoneRow}>
                      <Ionicons name="call-outline" size={12} color={TEXT_GRAY} />
                      <Text style={styles.addressPhone}>{saved.phone}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.chevronWrap}>
                <Ionicons name="chevron-forward" size={20} color={TEAL} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  headerRight: { width: 36 },
  searchBarWrap: { paddingHorizontal: 0 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0,
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: { flex: 1, marginLeft: 14 },
  optionTitle: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
  optionSub: { fontSize: 13, color: TEXT_GRAY, marginTop: 2 },
  chevronWrap: { padding: 4 },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 12,
    gap: 6,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: TEXT_GRAY,
    letterSpacing: 0.5,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0,
  },
  addressCardLeft: { flex: 1, flexDirection: "row" },
  addressIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  addressCardContent: { flex: 1, marginLeft: 14 },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  addressDistance: { fontSize: 12, color: TEAL, fontWeight: "600" },
  addressLabel: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
  addressLine: { fontSize: 13, color: TEXT_GRAY, marginTop: 2, lineHeight: 18 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  addressPhone: { fontSize: 12, color: TEXT_GRAY },
  searchLoadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  searchLoadingText: { fontSize: 14, color: TEXT_GRAY },
  searchResultsWrap: { marginBottom: 8 },
  emptySaved: { paddingVertical: 32, alignItems: "center" },
  emptyIconWrap: { marginBottom: 12 },
  emptySavedText: { fontSize: 14, color: TEXT_GRAY, textAlign: "center" },
  addAddressLink: { fontSize: 15, color: TEAL, fontWeight: "600", marginTop: 10 },
});
