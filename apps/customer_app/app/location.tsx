/**
 * Select a location – GatiMitra. Google-Maps-level search (Mapbox + fuzzy + scoring).
 * Instant autocomplete, area/city/state/distance, highlighted match, recent-location boost.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Share,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { searchPlacesEnriched, isPincodeSearchMode, type EnrichedPlaceResult } from "@/services/location.service";
import { reverseGeocode } from "@/services/location.service";
import { addressService, type Address, type LocalSuggestionResult } from "@/services/address.service";
import { profileService } from "@/services/profile.service";
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

const SEARCH_DEBOUNCE_MS = 350;
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
  const {
    address,
    coords,
    locationSource,
    requestPermissionAndFetch,
    setAddress,
    setAddressAndCoords,
    loading,
  } = useLocationStore();
  const {
    items: recentSearches,
    getRecentLocationKeys,
    addRecentLocation,
    clearRecentLocations,
    hydrate: hydrateRecentLocations,
  } = useRecentLocationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EnrichedPlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailsafe, setSearchFailsafe] = useState(false);
  const [savedAddressLoading, setSavedAddressLoading] = useState<number | null>(null);
  const [confirmAddress, setConfirmAddress] = useState<Address | null>(null);
  const [menuForId, setMenuForId] = useState<number | null>(null);
  const [currentLocationPreview, setCurrentLocationPreview] = useState("Current location");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const lastSearchKeyRef = useRef<string>("");
  const queryClient = useQueryClient();
  const safeBack = () => {
    if (params.fromOnboarding === "1") {
      router.replace("/(onboarding)/permissions");
      return;
    }
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/");
  };

  useEffect(() => {
    hydrateRecentLocations();
  }, [hydrateRecentLocations]);

  const {
    data: savedAddresses = [],
    isLoading: addressesLoading,
    isError: addressesError,
    refetch: refetchAddresses,
  } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    retry: false,
  });

  const { data: activeLocation, refetch: refetchActiveLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
    retry: false,
  });

  const [listRefreshing, setListRefreshing] = useState(false);

  const activeAddressId = useMemo(() => {
    if (
      !activeLocation ||
      activeLocation.latitude == null ||
      activeLocation.longitude == null ||
      savedAddresses.length === 0
    ) {
      return null;
    }
    const { latitude, longitude } = activeLocation;
    let best: { id: number; distance: number } | null = null;
    for (const addr of savedAddresses) {
      const d = distanceMeters(latitude!, longitude!, addr.latitude, addr.longitude);
      if (!best || d < best.distance) {
        best = { id: addr.id, distance: d };
      }
    }
    // Only treat as \"selected\" if within 50m of active_location
    if (best && best.distance <= 50) return best.id;
    return null;
  }, [activeLocation, savedAddresses]);

  /** SELECTED pill on a saved row: only when user intent is a saved/map pin, and coords match that row (or legacy API match). */
  const matchedSavedIdForPill = useMemo(() => {
    if (locationSource === "current") return null;

    if (locationSource === "selected") {
      if (!coords || savedAddresses.length === 0) return null;
      let best: { id: number; distance: number } | null = null;
      for (const addr of savedAddresses) {
        const d = distanceMeters(coords.latitude, coords.longitude, addr.latitude, addr.longitude);
        if (!best || d < best.distance) best = { id: addr.id, distance: d };
      }
      if (best && best.distance <= 50) return best.id;
      return null;
    }

    // locationSource null (e.g. first paint): keep API-based match
    return activeAddressId;
  }, [locationSource, coords, savedAddresses, activeAddressId]);

  const showSelectedOnCurrentLocationRow = locationSource === "current";

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

  const formatLocationLine = (fullAddress?: string | null, secondary?: string | null, primary?: string | null, state?: string | null) => {
    const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
    const fullParts = (fullAddress ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const secondaryParts = (secondary ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const stateCandidate =
      state ??
      [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
    const normalizedState = stateCandidate?.toLowerCase() ?? "";
    const areaLocalityCandidates = [...secondaryParts, ...fullParts, primary ?? ""]
      .map((p) => p.trim())
      .filter(
        (p) =>
          !!p &&
          !isPincode(p) &&
          p.toLowerCase() !== "india" &&
          p.toLowerCase() !== normalizedState
      );
    const dedupedAreaLocality = Array.from(new Set(areaLocalityCandidates));
    const area = dedupedAreaLocality.slice(0, 2).join(", ") || "Current location";
    return stateCandidate ? `${area} (${stateCandidate})` : area;
  };

  const refreshCurrentLocationPreview = useCallback(async () => {
    const gpsMs = 14_000;
    const geoMs = 10_000;
    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          (e) => {
            clearTimeout(t);
            reject(e);
          }
        );
      });
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        gpsMs
      );
      const rg = await withTimeout(
        reverseGeocode(pos.coords.longitude, pos.coords.latitude),
        geoMs
      );
      setCurrentLocationPreview(
        formatLocationLine(rg.fullAddress, rg.secondary, rg.primary, rg.state ?? null)
      );
    } catch {
      // Keep previous preview on transient errors.
    }
  }, []);

  useEffect(() => {
    void refreshCurrentLocationPreview();
  }, [refreshCurrentLocationPreview]);

  const onPullRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      await hydrateRecentLocations();
      await Promise.all([
        refetchAddresses(),
        refetchActiveLocation(),
        refreshCurrentLocationPreview(),
      ]);
    } finally {
      setListRefreshing(false);
    }
  }, [
    hydrateRecentLocations,
    refetchAddresses,
    refetchActiveLocation,
    refreshCurrentLocationPreview,
  ]);

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
      const reqKey = `${query.toLowerCase()}|${proximity?.longitude ?? ""},${proximity?.latitude ?? ""}`;
      if (lastSearchKeyRef.current === reqKey) {
        setSearchLoading(false);
        return;
      }
      lastSearchKeyRef.current = reqKey;
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
    await requestPermissionAndFetch({ forceDevice: true });
    const osPermission = await Location.getForegroundPermissionsAsync();
    const { permissionStatus, coords: latestCoords, address: latestAddress } = useLocationStore.getState();
    const hasLocationAccess = permissionStatus === "granted" && osPermission.status === "granted";

    if (!hasLocationAccess || !latestCoords) {
      try {
        await profileService.updateProfile({ location_permission: false });
      } catch {
        // Non-blocking; user flow should continue.
      }
      Alert.alert("Location not found", "We couldn't detect your location. Try again or search manually.");
      return;
    }
    try {
      await profileService.updateProfile({
        location_permission: true,
        latitude: latestCoords.latitude,
        longitude: latestCoords.longitude,
      });
    } catch {
      // Non-blocking; selecting location should still work.
    }

    // If we have a nearby saved address, use it directly (no confirmation step).
    if (savedAddresses.length > 0) {
      let best = { addr: null as Address | null, distance: Number.POSITIVE_INFINITY };
      for (const addr of savedAddresses) {
        const d = distanceMeters(latestCoords.latitude, latestCoords.longitude, addr.latitude, addr.longitude);
        if (d < best.distance) best = { addr, distance: d };
      }
      if (best.addr && best.distance <= NEAR_SAVED_RADIUS_METERS) {
        try {
          await addressService.setActiveLocation({
            latitude: best.addr.latitude,
            longitude: best.addr.longitude,
            address: best.addr.fullAddress,
          });
          const primary = best.addr.label ?? "Address";
          useLocationStore.getState().setAddressAndCoords(
            {
              primary,
              secondary: best.addr.fullAddress.slice(0, 80),
              fullAddress: best.addr.fullAddress,
            },
            { latitude: best.addr.latitude, longitude: best.addr.longitude },
            { source: "selected" }
          );
        } finally {
          safeBack();
        }
        return;
      }
    }

    // For "Use current location", apply immediately without map confirmation/form.
    try {
      await addressService.setActiveLocation({
        latitude: latestCoords.latitude,
        longitude: latestCoords.longitude,
        address: latestAddress?.fullAddress ?? latestAddress?.primary ?? "Current location",
      });
    } finally {
      safeBack();
    }
  };

  const handleAddAddressDirect = async () => {
    await requestPermissionAndFetch({ forceDevice: true });
    const { permissionStatus, coords: latestCoords, address: latestAddress } = useLocationStore.getState();
    if (permissionStatus !== "granted" || !latestCoords) {
      Alert.alert(
        "Location required",
        "Please enable location to add your delivery address directly."
      );
      return;
    }
    router.push({
      pathname: "/location-address",
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

  const applySavedAddress = async (addr: Address) => {
    setSavedAddressLoading(addr.id);
    try {
      await addressService.setActiveLocation({
        latitude: addr.latitude,
        longitude: addr.longitude,
        address: addr.fullAddress,
      });
      const primary = addr.label ?? "Address";
      setAddressAndCoords(
        { primary, secondary: addr.fullAddress.slice(0, 80), fullAddress: addr.fullAddress },
        { latitude: addr.latitude, longitude: addr.longitude }
      );
      safeBack();
    } catch {
      safeBack();
    } finally {
      setSavedAddressLoading(null);
    }
  };

  const handleSelectSaved = (addr: Address) => {
    // Tapping the three-dot menu should not trigger selection
    if (menuForId === addr.id) return;
    if (activeAddressId != null && activeAddressId !== addr.id) {
      setConfirmAddress(addr);
      return;
    }
    void applySavedAddress(addr);
  };

  const showSearchSection = searchQuery.trim().length >= 2;
  const showRecentSearches = !showSearchSection && recentSearches.length > 0;
  const recentSearchList = useMemo(() => recentSearches.slice(0, 7), [recentSearches]);

  const handleSelectRecentSearch = async (place: {
    primary: string;
    fullAddress?: string;
    latitude: number;
    longitude: number;
  }) => {
    try {
      await addressService.setActiveLocation({
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.fullAddress ?? place.primary,
      });
      setAddressAndCoords(
        {
          primary: place.primary,
          secondary: (place.fullAddress ?? "").slice(0, 80),
          fullAddress: place.fullAddress ?? place.primary,
        },
        { latitude: place.latitude, longitude: place.longitude }
      );
    } finally {
      safeBack();
    }
  };

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.container}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
      {/* Header with integrated search – minimal gap below status bar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={safeBack} style={styles.backBtn} hitSlop={12}>
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
              autoCapitalize="none"
              autoCorrect={false}
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
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={onPullRefresh}
            tintColor={TEAL}
            colors={[TEAL]}
          />
        }
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

        <View style={styles.actionPanel}>
          {/* Use current location */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleUseCurrentLocation}
            activeOpacity={0.85}
            disabled={loading}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="locate" size={20} color={TEAL} />
              <View style={styles.optionTextWrap}>
                <Text style={styles.actionTitle}>Use current location</Text>
                <Text style={styles.optionSub} numberOfLines={1}>
                  {loading ? "Getting location..." : currentLocationPreview}
                </Text>
              </View>
            </View>
            <View style={styles.actionRowRight}>
              {showSelectedOnCurrentLocationRow ? (
                <View style={styles.selectedPillAction}>
                  <Text style={styles.selectedPillRightText}>SELECTED</Text>
                </View>
              ) : null}
              {loading ? (
                <ActivityIndicator size="small" color={TEAL} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
              )}
            </View>
          </TouchableOpacity>

          {/* Add Address */}
          <TouchableOpacity
            style={[styles.actionRow, styles.actionRowLast]}
            onPress={handleAddAddressDirect}
            activeOpacity={0.85}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="add" size={22} color={TEAL} />
              <Text style={styles.actionTitle}>Add Address</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
          </TouchableOpacity>
        </View>

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
        ) : addressesError ? (
          <View style={styles.emptySaved}>
            <Text style={styles.emptySavedText}>
              Could not load saved addresses. Check your connection and try again.
            </Text>
            <TouchableOpacity onPress={() => refetchAddresses()} activeOpacity={0.85}>
              <Text style={[styles.addAddressLink, { marginTop: 12 }]}>Retry</Text>
            </TouchableOpacity>
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
              <TouchableOpacity onPress={handleAddAddressDirect}>
                <Text style={styles.addAddressLink}>Add address</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredSaved.map((saved) => (
            <View key={saved.id} style={[styles.addressCard, styles.addressCardBorder]}>
              <TouchableOpacity
                style={styles.addressCardLeft}
                onPress={() => handleSelectSaved(saved)}
                disabled={savedAddressLoading !== null}
                activeOpacity={0.85}
              >
                <View style={[styles.addressIconWrap, { backgroundColor: "#F8FAFC" }]}>
                  <Ionicons name={addressIcon(saved.label)} size={22} color="#667085" />
                </View>
                <View style={styles.addressCardContent}>
                  <View style={styles.addressLabelRow}>
                    <Text style={styles.addressLabel}>{saved.label ?? "Address"}</Text>
                  </View>
                  {saved.contactName ? (
                    <Text style={styles.addressLine} numberOfLines={1}>
                      {saved.contactName}
                      {saved.contactMobile ? ` • ${saved.contactMobile}` : ""}
                    </Text>
                  ) : null}
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {saved.fullAddress}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.cardRight}>
                {saved.id === matchedSavedIdForPill && (
                  <View style={styles.selectedPillRight}>
                    <Text style={styles.selectedPillRightText}>SELECTED</Text>
                  </View>
                )}
                <TouchableOpacity
                  hitSlop={12}
                  style={styles.moreBtn}
                  onPress={() => setMenuForId((id) => (id === saved.id ? null : saved.id))}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={TEXT_GRAY} />
                </TouchableOpacity>
                {savedAddressLoading === saved.id && (
                  <ActivityIndicator size="small" color={TEAL} />
                )}
                {menuForId === saved.id && (
                  <View style={styles.moreMenu}>
                    <TouchableOpacity
                      style={styles.moreMenuItem}
                      onPress={() => {
                        setMenuForId(null);
                        router.push("/profile/addresses");
                      }}
                    >
                      <Ionicons name="create-outline" size={16} color="#F9FAFB" />
                      <Text style={styles.moreMenuText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.moreMenuItem}
                      onPress={async () => {
                        setMenuForId(null);
                        // Share same as profile screen
                        const parts: string[] = [];
                        const label = saved.label ?? "Address";
                        const name = saved.contactName ? ` – ${saved.contactName}` : "";
                        parts.push(`${label}${name}`);
                        parts.push(saved.fullAddress);
                        if (saved.contactMobile) {
                          parts.push(`Mobile: ${saved.contactMobile}`);
                        }
                        if (saved.latitude && saved.longitude) {
                          parts.push(
                            `Location: https://maps.google.com/?q=${saved.latitude},${saved.longitude}`
                          );
                        }
                        parts.push("");
                        parts.push(
                          "GatiMitra – order food, rides & parcels. Download the app to order now."
                        );
                        const message = parts.join("\n");
                        try {
                          await Share.share({ message });
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      <Ionicons name="share-social-outline" size={16} color="#F9FAFB" />
                      <Text style={styles.moreMenuText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.moreMenuItem, styles.moreMenuItemDestructive]}
                      onPress={() => {
                        setMenuForId(null);
                        Alert.alert(
                          "Delete address?",
                          "Remove this saved address?",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await addressService.deleteAddress(saved.id);
                                  queryClient.invalidateQueries({ queryKey: ["addresses"] });
                                } catch {
                                  // ignore
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FCA5A5" />
                      <Text style={[styles.moreMenuText, styles.moreMenuTextDestructive]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))
        )}

        {showRecentSearches && (
          <>
            <View style={[styles.sectionHeadRow, { justifyContent: "space-between" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="time-outline" size={14} color={TEAL} />
                <Text style={styles.sectionHeading}>RECENT SEARCHES</Text>
              </View>
              <TouchableOpacity onPress={clearRecentLocations} hitSlop={8}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recentSearchList}>
              {recentSearchList.map((item, index) => (
                <TouchableOpacity
                  key={`${item.latitude}-${item.longitude}-${item.primary}-${index}`}
                  style={[
                    styles.recentSearchRow,
                    index === recentSearchList.length - 1 && styles.recentSearchRowLast,
                  ]}
                  onPress={() => handleSelectRecentSearch(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.recentSearchLeft}>
                    <Ionicons name="time-outline" size={18} color="#667085" />
                    <View style={styles.recentSearchTextWrap}>
                      <Text style={styles.recentSearchTitle} numberOfLines={1}>
                        {item.primary}
                      </Text>
                      <Text style={styles.recentSearchSubtitle} numberOfLines={2}>
                        {item.fullAddress ?? item.primary}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <BrandingFooter />
      </ScrollView>
      </View>
      {confirmAddress && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Are you sure about this address?</Text>
            <Text style={styles.confirmSubtitle}>
              You’re switching to \"{confirmAddress.label ?? "Address"}\". Use this as your delivery
              location?
            </Text>
            <View style={styles.confirmAddressBox}>
              <Text style={styles.confirmAddressLabel}>{confirmAddress.label ?? "Address"}</Text>
              <Text style={styles.confirmAddressText} numberOfLines={2}>
                {confirmAddress.fullAddress}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.confirmPrimaryBtn}
              onPress={async () => {
                const addr = confirmAddress;
                setConfirmAddress(null);
                await applySavedAddress(addr);
              }}
            >
              <Text style={styles.confirmPrimaryText}>Yes, continue with this address</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmSecondaryBtn}
              onPress={() => setConfirmAddress(null)}
            >
              <Text style={styles.confirmSecondaryText}>No, change address</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  actionPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, marginRight: 10 },
  selectedPillAction: {
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionTitle: { fontSize: 18, fontWeight: "600", color: TEAL },
  optionTextWrap: { flex: 1, marginLeft: 0 },
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
    borderWidth: 1,
    borderColor: BORDER,
  },
  addressCardBorder: {
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
  addressMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  addressMeta: { fontSize: 12, color: TEXT_GRAY },
  distanceBadge: { fontSize: 12, color: TEAL, fontWeight: "600" },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  addressDistance: { fontSize: 12, color: TEAL, fontWeight: "600" },
  addressLabel: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
  addressLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardRight: { alignItems: "flex-end", justifyContent: "flex-start", marginLeft: 8, minWidth: 34 },
  moreBtn: { padding: 2 },
  selectedPillRight: {
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  selectedPillRightText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
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
  clearAllText: { fontSize: 12, fontWeight: "700", color: TEAL },
  recentSearchList: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  recentSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  recentSearchRowLast: { borderBottomWidth: 0 },
  recentSearchLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 },
  recentSearchTextWrap: { marginLeft: 10, flex: 1 },
  recentSearchTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  recentSearchSubtitle: { fontSize: 12, color: "#334155", marginTop: 2 },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  confirmCard: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 26,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 6,
  },
  confirmSubtitle: { fontSize: 14, color: TEXT_GRAY, marginBottom: 16 },
  confirmAddressBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    backgroundColor: "#F9FAFB",
    marginBottom: 16,
  },
  confirmAddressLabel: { fontSize: 14, fontWeight: "600", color: TITLE_DARK, marginBottom: 4 },
  confirmAddressText: { fontSize: 13, color: TEXT_GRAY },
  confirmPrimaryBtn: {
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  confirmSecondaryBtn: { borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  confirmSecondaryText: { color: TITLE_DARK, fontSize: 15, fontWeight: "500" },
});
