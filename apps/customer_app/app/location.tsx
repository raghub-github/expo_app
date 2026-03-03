/**
 * Select a location – GatiMitra. Google-Maps-level search (Mapbox + fuzzy + scoring).
 * Instant autocomplete, area/city/state/distance, highlighted match, recent-location boost.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { searchPlacesEnriched, isPincodeSearchMode, type EnrichedPlaceResult } from "@/services/location.service";
import { addressService, type Address, type LocalSuggestionResult } from "@/services/address.service";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";

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

const SEARCH_DEBOUNCE_MS = 250;
const NEAR_SAVED_RADIUS_METERS = 500;

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

/** Splits text by query (case-insensitive) and returns segments for highlight. */
function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  if (!query.trim() || !text) return [{ text, match: false }];
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, idx), match: false },
    { text: text.slice(idx, idx + q.length), match: true },
    { text: text.slice(idx + q.length), match: false },
  ].filter((s) => s.text.length > 0);
}

function addressIcon(label: string | null): "home" | "briefcase" | "location" {
  if (!label) return "location";
  const l = label.toLowerCase();
  if (l === "home") return "home";
  if (l === "work") return "briefcase";
  return "location";
}

export default function SelectLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const insets = useSafeAreaInsets();
  const { address, coords, requestPermissionAndFetch, setAddress, setAddressAndCoords, loading } = useLocationStore();
  const { getRecentLocationKeys, addRecentLocation, hydrate: hydrateRecentLocations } = useRecentLocationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EnrichedPlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailsafe, setSearchFailsafe] = useState(false);
  const [savedAddressLoading, setSavedAddressLoading] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hydrateRecentLocations();
  }, [hydrateRecentLocations]);

  const { data: savedAddresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    retry: false,
  });

  // One entry per location (rounded to 4 decimals ~11m); Current location first, then default, then last used
  const dedupedAndSortedAddresses = useMemo(() => {
    const round4 = (n: number) => Math.round(n * 10000) / 10000;
    const seen = new Set<string>();
    const deduped = savedAddresses.filter((a) => {
      const key = `${round4(a.latitude)}_${round4(a.longitude)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.sort((a, b) => {
      const aCurrent = (a.label ?? "").toLowerCase() === "current location";
      const bCurrent = (b.label ?? "").toLowerCase() === "current location";
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      if (a.isLastUsed && !b.isLastUsed) return -1;
      if (!a.isLastUsed && b.isLastUsed) return 1;
      return a.id - b.id;
    });
  }, [savedAddresses]);

  const filteredSaved = useMemo(
    () =>
      !searchQuery.trim()
        ? dedupedAndSortedAddresses
        : dedupedAndSortedAddresses.filter(
            (a) =>
              (a.label ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.fullAddress.toLowerCase().includes(searchQuery.toLowerCase())
          ),
    [dedupedAndSortedAddresses, searchQuery]
  );

  const currentLocationName = address?.primary ?? "Current location";

  // Autocomplete 250ms debounce; pincode (6 digits) or normal search (2+ chars)
  useEffect(() => {
    const query = searchQuery.trim();
    const isPincode = isPincodeSearchMode(query);
    const minChars = isPincode ? 6 : 2;
    if (query.length < minChars) {
      setSearchResults([]);
      setSearchFailsafe(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      setSearchFailsafe(false);
      const proximity =
        coords?.latitude != null && coords?.longitude != null
          ? { latitude: coords.latitude, longitude: coords.longitude }
          : undefined;
      const getLocal = (q: string) => addressService.getLocationSearchSuggestions(q, 10);
      const getCityAreas = (city: string) => addressService.getCityAreaSuggestions(city, 10);
      searchPlacesEnriched(query, {
        signal: controller.signal,
        proximity,
        recentLocationKeys: getRecentLocationKeys(),
        getLocalSuggestions: getLocal,
        getCityAreas,
      })
        .then((results) => {
          if (controller.signal.aborted) return;
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSearchResults(results);
          // Rule 4: In pincode mode do NOT show random nearby locations when no exact match.
          if (results.length === 0 && !isPincodeSearchMode(query)) {
            setSearchFailsafe(true);
            getLocal(query).then((local) => {
              if (controller.signal.aborted) return;
              const enriched: EnrichedPlaceResult[] = local.map((l) => {
                const distanceKm =
                  coords?.latitude != null && coords?.longitude != null
                    ? (() => {
                        const R = 6371;
                        const dLat = ((l.latitude - coords.latitude) * Math.PI) / 180;
                        const dLon = ((l.longitude - coords.longitude) * Math.PI) / 180;
                        const a =
                          Math.sin(dLat / 2) ** 2 +
                          Math.cos((coords.latitude * Math.PI) / 180) *
                            Math.cos((l.latitude * Math.PI) / 180) *
                            Math.sin(dLon / 2) ** 2;
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        return R * c;
                      })()
                    : undefined;
                return {
                  primary: l.primary,
                  secondary: l.secondary,
                  fullAddress: l.fullAddress,
                  latitude: l.latitude,
                  longitude: l.longitude,
                  confidenceScore: 0.75,
                  source: "local",
                  usageCount: l.usageCount,
                  city: l.city,
                  area: l.area,
                  distanceKm,
                };
              });
              // Show nearest first (ascending by distance)
              if (coords?.latitude != null && coords?.longitude != null) {
                enriched.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
              }
              if (enriched.length > 0) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSearchResults(enriched);
              }
              setSearchFailsafe(false);
            });
          }
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
  }, [searchQuery, coords?.latitude, coords?.longitude]);

  const handleUseCurrentLocation = async () => {
    await requestPermissionAndFetch();
    const { coords: latestCoords, address: latestAddress } = useLocationStore.getState();
    if (!latestCoords) {
      Alert.alert("Location not found", "We couldn't detect your location. Try again or search manually.");
      return;
    }

    // If we have saved addresses, suggest a nearby one within 500m
    if (savedAddresses.length > 0) {
      let best = { addr: null as Address | null, distance: Number.POSITIVE_INFINITY };
      for (const addr of savedAddresses) {
        const d = distanceMeters(latestCoords.latitude, latestCoords.longitude, addr.latitude, addr.longitude);
        if (d < best.distance) best = { addr, distance: d };
      }
      if (best.addr && best.distance <= NEAR_SAVED_RADIUS_METERS) {
        Alert.alert(
          "Use saved address?",
          `You're near your saved address "${best.addr.label ?? "Address"}". Do you want to deliver here?`,
          [
            {
              text: "Use this address",
              onPress: async () => {
                try {
                  await addressService.setActiveLocation({
                    latitude: best.addr!.latitude,
                    longitude: best.addr!.longitude,
                    address: best.addr!.fullAddress,
                  });
                  router.back();
                } catch {
                  router.back();
                }
              },
            },
            {
              text: "Choose different",
              style: "cancel",
              onPress: () => {
                router.push({
                  pathname: "/location-map",
                  params: {
                    latitude: String(latestCoords.latitude),
                    longitude: String(latestCoords.longitude),
                    primary: latestAddress?.primary ?? "Current location",
                    fullAddress: latestAddress?.fullAddress ?? "",
                    ...(params.fromOnboarding === "1" ? { fromOnboarding: "1" } : {}),
                  },
                });
              },
            },
          ],
        );
        return;
      }
    }

    // New location: always go to map to confirm exact pin before full address
    router.push({
      pathname: "/location-map",
      params: {
        latitude: String(latestCoords.latitude),
        longitude: String(latestCoords.longitude),
        primary: latestAddress?.primary ?? "Current location",
        fullAddress: latestAddress?.fullAddress ?? "",
        ...(params.fromOnboarding === "1" ? { fromOnboarding: "1" } : {}),
      },
    });
  };

  const handleSelectSearchResult = (place: EnrichedPlaceResult) => {
    addRecentLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      primary: place.primary,
      fullAddress: place.fullAddress,
    });
    router.push({
      pathname: "/location-map",
      params: {
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        primary: place.primary,
        fullAddress: place.fullAddress,
        ...(params.fromOnboarding === "1" ? { fromOnboarding: "1" } : {}),
      },
    });
  };

  const handleSelectSaved = async (addr: Address) => {
    setSavedAddressLoading(addr.id);
    try {
      const primary = addr.label ?? "Address";
      setAddressAndCoords(
        { primary, secondary: addr.fullAddress.slice(0, 80), fullAddress: addr.fullAddress },
        { latitude: addr.latitude, longitude: addr.longitude }
      );
      router.push({
        pathname: "/location-map",
        params: {
          latitude: String(addr.latitude),
          longitude: String(addr.longitude),
          primary,
          fullAddress: addr.fullAddress,
        },
      });
    } finally {
      setSavedAddressLoading(null);
    }
  };

  const showSearchSection = searchQuery.trim().length >= 2;

  return (
    <>
      <AndroidBackHandler />
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
          <View style={[styles.searchLoadingWrap, styles.sectionBox]}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.searchLoadingText}>Searching for places...</Text>
          </View>
        )}
        {showSearchSection && !searchLoading && searchResults.length > 0 && (
          <View style={[styles.searchResultsWrap, styles.sectionBox]}>
            {searchResults.map((place, index) => (
              <TouchableOpacity
                key={`${place.latitude}-${place.longitude}-${place.primary}-${index}`}
                style={[styles.addressCard, styles.addressCardBorder, SHADOW]}
                onPress={() => handleSelectSearchResult(place)}
                activeOpacity={0.85}
              >
                <View style={styles.addressCardLeft}>
                  <View style={[styles.addressIconWrap, { backgroundColor: TEAL_LIGHT }]}>
                    <Ionicons name="location" size={22} color={TEAL} />
                  </View>
                  <View style={styles.addressCardContent}>
                    {/* Rule 3: Pincode format — Area, City / Pincode: XXXXX / State */}
                    {place.isPincodeResult ? (
                      <>
                        <Text style={styles.addressLabel} numberOfLines={1}>
                          {place.primary}
                        </Text>
                        <Text style={styles.addressMeta} numberOfLines={1}>
                          {place.secondary}
                        </Text>
                        {place.state ? (
                          <Text style={styles.addressLine} numberOfLines={1}>
                            {place.state}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Text style={styles.addressLabel} numberOfLines={1}>
                          {highlightSegments(place.primary, searchQuery.trim()).map((seg, i) =>
                            seg.match ? (
                              <Text key={i} style={[styles.addressLabel, styles.addressLabelMatch]}>
                                {seg.text}
                              </Text>
                            ) : (
                              seg.text
                            )
                          )}
                        </Text>
                        <View style={styles.addressMetaRow}>
                          {(place.area ?? place.city ?? place.state) && (
                            <Text style={styles.addressMeta} numberOfLines={1}>
                              {[place.area, place.city, place.state].filter(Boolean).join(" · ")}
                            </Text>
                          )}
                          {place.distanceKm != null && place.distanceKm < 500 && (
                            <Text style={styles.distanceBadge}>
                              {place.distanceKm < 1
                                ? `${Math.round(place.distanceKm * 1000)} m`
                                : `${place.distanceKm.toFixed(1)} km`}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.addressLine} numberOfLines={2}>
                          {place.fullAddress}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={TEAL} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {showSearchSection && searchResults.length === 0 && (
          <View style={styles.emptySaved}>
            {searchFailsafe || searchLoading ? (
              <>
                <ActivityIndicator size="small" color={TEAL} />
                <Text style={[styles.emptySavedText, { marginTop: 12 }]}>
                  Searching nearby known places…
                </Text>
              </>
            ) : isPincodeSearchMode(searchQuery.trim()) ? (
              <>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="location-outline" size={40} color={BORDER} />
                </View>
                <Text style={styles.emptySavedText}>
                  We're not delivering here yet — but we're expanding fast. Try another nearby location.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="search-outline" size={40} color={BORDER} />
                </View>
                <Text style={styles.emptySavedText}>
                  No places found. Try another spelling or a nearby landmark.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Use current location */}
        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardBorder, SHADOW]}
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
          style={[styles.optionCard, styles.optionCardBorder, SHADOW]}
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
        <View style={[styles.sectionHeadRow, styles.sectionHeadRowBorder]}>
          <Ionicons name="bookmark" size={14} color={TEAL} />
          <Text style={styles.sectionHeading}>SAVED ADDRESSES</Text>
        </View>
        {addressesLoading ? (
          <View style={styles.emptySaved}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={[styles.emptySavedText, { marginTop: 12 }]}>Loading saved addresses...</Text>
          </View>
        ) : filteredSaved.length === 0 ? (
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
              style={[styles.addressCard, styles.addressCardBorder, SHADOW]}
              onPress={() => handleSelectSaved(saved)}
              disabled={savedAddressLoading !== null}
              activeOpacity={0.85}
            >
              <View style={styles.addressCardLeft}>
                <View style={[styles.addressIconWrap, { backgroundColor: TEAL_LIGHT }]}>
                  <Ionicons name={addressIcon(saved.label)} size={22} color={TEAL} />
                </View>
                <View style={styles.addressCardContent}>
                  <Text style={styles.addressLabel}>{saved.label ?? "Address"}</Text>
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {saved.fullAddress}
                  </Text>
                </View>
              </View>
              <View style={styles.chevronWrap}>
                {savedAddressLoading === saved.id ? (
                  <ActivityIndicator size="small" color={TEAL} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={TEAL} />
                )}
              </View>
            </TouchableOpacity>
          ))
        )}

        <BrandingFooter />
      </ScrollView>
      </View>
    </>
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
  sectionBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionHeadRowBorder: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 16,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0,
  },
  optionCardBorder: {
    borderWidth: 1,
    borderColor: BORDER,
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
  addressCardBorder: {
    borderWidth: 1,
    borderColor: BORDER,
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
  addressMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  addressMeta: { fontSize: 12, color: TEXT_GRAY },
  distanceBadge: { fontSize: 12, color: TEAL, fontWeight: "600" },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  addressDistance: { fontSize: 12, color: TEAL, fontWeight: "600" },
  addressLabel: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
  addressLabelMatch: { color: TEAL, textDecorationLine: "underline" },
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
