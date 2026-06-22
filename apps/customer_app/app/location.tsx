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
import {
  searchPlacesEnriched,
  isPincodeSearchMode,
  resolveMapboxEnrichedPlace,
  geocodeAddressToCoord,
  type EnrichedPlaceResult,
  MAPBOX_SEARCH_DEBOUNCE_MS,
} from "@/services/location.service";
import { mapboxSearchSuggest } from "@/services/mapboxSearch.service";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import { reverseGeocode } from "@/services/location.service";
import { addressService, type Address, type LocalSuggestionResult } from "@/services/address.service";
import { profileService } from "@/services/profile.service";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";
import { AddressOptionsBottomSheet } from "@/components/address/AddressOptionsBottomSheet";
import { AddressConfirmBottomSheet } from "@/components/address/AddressConfirmBottomSheet";
import { NearbyLocationConfirmBottomSheet } from "@/components/address/NearbyLocationConfirmBottomSheet";
import { LocationWeatherBanner, WeatherDetailsSheet } from "@/components/weather";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { GatiMitraColors } from "@/constants/gatimitra";

const BG = "#FAFAFA";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const BORDER = "#EEEEEE";
const BORDER_SUBTLE = "rgba(0, 0, 0, 0.08)";
const DIVIDER = "#F3F4F6";
const BRAND = "#14B8A6";
const BRAND_LIGHT = GatiMitraColors.mintSoft;

const SEARCH_DEBOUNCE_MS = MAPBOX_SEARCH_DEBOUNCE_MS;
const NEAR_SAVED_RADIUS_METERS = 500;
const INITIAL_SAVED_VISIBLE = 3;
const NEARBY_PLACES_LIMIT = 6;
const NEARBY_MIN_DISTANCE_M = 30;
const NEARBY_MAX_DISTANCE_M = 25_000;

function savedAddressIcon(saved: Address): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const label = (saved.label ?? "").trim().toLowerCase();
  if (label === "current location") {
    return { name: "locate", color: BRAND };
  }
  if (label === "home") {
    return { name: "home-outline", color: "#374151" };
  }
  if (label === "work" || label === "office") {
    return { name: "briefcase-outline", color: "#374151" };
  }
  return { name: "location-outline", color: "#374151" };
}

function formatDistanceAway(m: number): string {
  if (m < 50) return "0 m away";
  if (m < 1000) return `${Math.round(m)} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

function localSuggestionToEnriched(item: LocalSuggestionResult): EnrichedPlaceResult {
  return {
    primary: item.primary,
    secondary: item.secondary,
    fullAddress: item.fullAddress,
    latitude: item.latitude,
    longitude: item.longitude,
    confidenceScore: 0.75,
    source: "local",
    city: item.city,
    area: item.area,
  };
}

async function fetchNearbyPlacesForAnchor(
  latitude: number,
  longitude: number
): Promise<EnrichedPlaceResult[]> {
  const rg = await reverseGeocode(longitude, latitude);

  const cityCandidates = [
    rg.city,
    rg.primary,
    rg.secondary?.split(",")[0]?.trim(),
    ...rg.fullAddress.split(",").map((p) => p.trim()),
  ].filter(
    (q): q is string =>
      !!q &&
      q.trim().length >= 2 &&
      q.toLowerCase() !== "india" &&
      !/^\d{6}$/.test(q.trim())
  );

  const queryCandidates = [
    rg.primary,
    rg.secondary?.split(",")[0]?.trim(),
    rg.city,
    cityCandidates.find((c) => c.length >= 3),
    "market",
  ].filter((q): q is string => !!q && q.trim().length >= 2);

  const uniqueQueries = [...new Set(queryCandidates.map((q) => q.trim().slice(0, 28)))].slice(0, 4);
  const uniqueCities = [...new Set(cityCandidates.map((c) => c.trim().slice(0, 40)))].slice(0, 3);

  const [mapboxBatches, cityAreaBatches, searchBatches] = await Promise.all([
    Promise.all(
      uniqueQueries.map((q) =>
        mapboxSearchSuggest(q, {
          proximity: { longitude, latitude },
          limit: 8,
          sessionContext: "location-picker",
        }).catch(() => [] as EnrichedPlaceResult[])
      )
    ),
    Promise.all(
      uniqueCities.map((city) =>
        addressService.getCityAreaSuggestions(city, 10).catch(() => [] as LocalSuggestionResult[])
      )
    ),
    Promise.all(
      uniqueCities.slice(0, 2).map((city) =>
        addressService.getLocationSearchSuggestions(city, 8).catch(() => [] as LocalSuggestionResult[])
      )
    ),
  ]);

  const merged: EnrichedPlaceResult[] = [];
  const seen = new Set<string>();
  const push = (item: EnrichedPlaceResult) => {
    if (!isValidMapCoordinate(item.latitude, item.longitude)) return;
    const key = `${Math.round(item.latitude * 10000)}_${Math.round(item.longitude * 10000)}`;
    if (seen.has(key)) return;
    const distM = distanceMeters(latitude, longitude, item.latitude, item.longitude);
    if (distM < NEARBY_MIN_DISTANCE_M || distM > NEARBY_MAX_DISTANCE_M) return;
    seen.add(key);
    merged.push({
      ...item,
      distanceKm: distM / 1000,
    });
  };

  const rawMapbox = mapboxBatches.flat();
  let retrieveCount = 0;
  for (const place of rawMapbox) {
    if (retrieveCount >= 12) break;
    try {
      const candidate =
        place.pendingRetrieve && place.mapboxSuggestion
          ? await resolveMapboxEnrichedPlace(place, "location-picker")
          : place;
      if (place.pendingRetrieve) retrieveCount += 1;
      push(candidate);
    } catch {
      // skip failed retrieve
    }
  }

  for (const batch of cityAreaBatches) {
    for (const area of batch) push(localSuggestionToEnriched(area));
  }
  for (const batch of searchBatches) {
    for (const item of batch) push(localSuggestionToEnriched(item));
  }

  return merged
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, NEARBY_PLACES_LIMIT);
}

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

function formatDistanceMeters(m: number): string {
  if (m < 50) return "0 m";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatLocationPreviewUpper(preview: string): string {
  return preview.trim().toUpperCase();
}

function isPlaceholderLocationText(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location"
  );
}

function parseCityFromFullAddress(fullAddress?: string | null): string | null {
  if (!fullAddress?.trim()) return null;
  const parts = fullAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p.toLowerCase() !== "india" && !/^\d{6}$/.test(p));
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? null;
}

function extractWeatherAreaLabel(
  currentLocationPreview: string,
  saved: Address | null | undefined
): string | null {
  if (saved?.city && !isPlaceholderLocationText(saved.city)) return saved.city.trim();

  const fromAddress = parseCityFromFullAddress(saved?.fullAddress);
  if (fromAddress && !isPlaceholderLocationText(fromAddress)) return fromAddress;

  const label = (saved?.label ?? "").trim().toLowerCase();
  if (label && !isPlaceholderLocationText(label) && label !== "home" && label !== "work" && label !== "office") {
    return saved!.label!.trim();
  }

  if (!isPlaceholderLocationText(currentLocationPreview)) {
    const first = currentLocationPreview.split(",")[0]?.trim();
    if (first && !isPlaceholderLocationText(first)) return first;
  }

  return null;
}

function formatPhoneLine(mobile: string | null | undefined): string | null {
  if (!mobile?.trim()) return null;
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `Phone number: +91-${local}`;
}

function buildShareMessage(saved: Address): string {
  const parts: string[] = [];
  const label = saved.label ?? "Address";
  const name = saved.contactName ? ` – ${saved.contactName}` : "";
  parts.push(`${label}${name}`);
  parts.push(saved.fullAddress);
  const phone = formatPhoneLine(saved.contactMobile);
  if (phone) parts.push(phone);
  if (saved.latitude && saved.longitude) {
    parts.push(`Location: https://maps.google.com/?q=${saved.latitude},${saved.longitude}`);
  }
  parts.push("");
  parts.push("GatiMitra – order food, rides & parcels. Download the app to order now.");
  return parts.join("\n");
}

export default function SelectLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string; afterSaveReturn?: string; focusSearch?: string }>();
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
  const [resolvingSearchPlace, setResolvingSearchPlace] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailsafe, setSearchFailsafe] = useState(false);
  const [savedAddressLoading, setSavedAddressLoading] = useState<number | null>(null);
  const [confirmAddress, setConfirmAddress] = useState<Address | null>(null);
  const [pendingNearbyPlace, setPendingNearbyPlace] = useState<EnrichedPlaceResult | null>(null);
  const [optionsAddress, setOptionsAddress] = useState<Address | null>(null);
  const [weatherSheetVisible, setWeatherSheetVisible] = useState(false);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [currentLocationPreview, setCurrentLocationPreview] = useState("Current location");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const lastSearchKeyRef = useRef<string>("");
  const queryClient = useQueryClient();
  const safeBack = () => {
    if (params.fromOnboarding === "1") {
      router.replace("/(onboarding)/permissions");
      return;
    }
    if (params.afterSaveReturn === "checkout") {
      router.replace("/checkout");
      return;
    }
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/");
  };

  const forwardParams = {
    ...(params.fromOnboarding === "1" ? { fromOnboarding: "1" as const } : {}),
    ...(params.afterSaveReturn === "checkout" ? { afterSaveReturn: "checkout" as const } : {}),
  };

  useEffect(() => {
    hydrateRecentLocations();
  }, [hydrateRecentLocations]);

  useEffect(() => {
    if (params.focusSearch !== "1") return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 320);
    return () => clearTimeout(timer);
  }, [params.focusSearch]);

  const {
    data: savedAddressesData,
    isPending: addressesPending,
    isError: addressesError,
    refetch: refetchAddresses,
  } = useAddresses();
  const savedAddresses = savedAddressesData ?? [];

  const { data: activeLocation, refetch: refetchActiveLocation } = useActiveLocation();

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

  const visibleSavedAddresses = useMemo(
    () => (savedExpanded ? filteredSaved : filteredSaved.slice(0, INITIAL_SAVED_VISIBLE)),
    [filteredSaved, savedExpanded]
  );
  const hasMoreSaved = filteredSaved.length > INITIAL_SAVED_VISIBLE;

  /** Reference point for distances + nearby POIs — follows selected/active location. */
  const referenceCoords = useMemo(() => {
    if (locationSource === "selected" && coords?.latitude != null && coords?.longitude != null) {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    if (
      activeLocation?.latitude != null &&
      activeLocation?.longitude != null &&
      Number.isFinite(activeLocation.latitude) &&
      Number.isFinite(activeLocation.longitude)
    ) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    if (coords?.latitude != null && coords?.longitude != null) {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    return null;
  }, [locationSource, coords, activeLocation]);

  const selectedSavedForWeather = useMemo(() => {
    if (matchedSavedIdForPill == null) return null;
    return dedupedAndSortedAddresses.find((a) => a.id === matchedSavedIdForPill) ?? null;
  }, [matchedSavedIdForPill, dedupedAndSortedAddresses]);

  const weatherAreaLabel = useMemo(
    () => extractWeatherAreaLabel(currentLocationPreview, selectedSavedForWeather),
    [currentLocationPreview, selectedSavedForWeather]
  );

  const { data: weather } = useLocationWeather({
    lat: referenceCoords?.latitude ?? coords?.latitude,
    lng: referenceCoords?.longitude ?? coords?.longitude,
    city: weatherAreaLabel,
    area: weatherAreaLabel,
  });

  const { data: nearbyPlaces = [], isLoading: nearbyLoading } = useQuery({
    queryKey: ["nearby-places", referenceCoords?.latitude, referenceCoords?.longitude],
    queryFn: () =>
      fetchNearbyPlacesForAnchor(referenceCoords!.latitude, referenceCoords!.longitude),
    enabled: !!referenceCoords && !searchQuery.trim(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

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
        sessionContext: "food-delivery",
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
        ...forwardParams,
      },
    });
  };

  const handleSelectSearchResult = async (place: EnrichedPlaceResult) => {
    if (resolvingSearchPlace) return;
    setResolvingSearchPlace(true);
    try {
      let resolved = await resolveMapboxEnrichedPlace(place, "food-delivery");
      if (!isValidMapCoordinate(resolved.latitude, resolved.longitude)) {
        const geocoded = await geocodeAddressToCoord(resolved.fullAddress || resolved.primary);
        if (geocoded && isValidMapCoordinate(geocoded.latitude, geocoded.longitude)) {
          resolved = {
            ...resolved,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            pendingRetrieve: false,
          };
        }
      }
      if (!isValidMapCoordinate(resolved.latitude, resolved.longitude)) {
        Alert.alert(
          "Location unavailable",
          "Could not load map coordinates for this place. Try another search result."
        );
        return;
      }
      addRecentLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
      });
      router.push({
        pathname: "/location-map",
        params: {
          latitude: String(resolved.latitude),
          longitude: String(resolved.longitude),
          primary: resolved.primary,
          fullAddress: resolved.fullAddress,
          ...forwardParams,
        },
      });
    } finally {
      setResolvingSearchPlace(false);
    }
  };

  /** Nearby list: show confirm sheet, then apply location — no map / address edit form. */
  const applyNearbyPlace = async (place: EnrichedPlaceResult) => {
    if (resolvingSearchPlace) return;
    setResolvingSearchPlace(true);
    try {
      let resolved = place;
      if (place.pendingRetrieve || !isValidMapCoordinate(place.latitude, place.longitude)) {
        resolved = await resolveMapboxEnrichedPlace(place, "food-delivery");
        if (!isValidMapCoordinate(resolved.latitude, resolved.longitude)) {
          const geocoded = await geocodeAddressToCoord(resolved.fullAddress || resolved.primary);
          if (geocoded && isValidMapCoordinate(geocoded.latitude, geocoded.longitude)) {
            resolved = {
              ...resolved,
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              pendingRetrieve: false,
            };
          }
        }
      }
      if (!isValidMapCoordinate(resolved.latitude, resolved.longitude)) {
        Alert.alert(
          "Location unavailable",
          "Could not load coordinates for this place. Try another nearby location."
        );
        return;
      }

      const fullAddress = resolved.fullAddress || resolved.primary;
      addRecentLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress,
      });
      await addressService.setActiveLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        address: fullAddress,
      });
      setAddressAndCoords(
        {
          primary: resolved.primary,
          secondary: fullAddress.slice(0, 80),
          fullAddress,
        },
        { latitude: resolved.latitude, longitude: resolved.longitude },
        { source: "selected" }
      );
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      queryClient.invalidateQueries({ queryKey: ["active-location"] });
      setPendingNearbyPlace(null);
      safeBack();
    } finally {
      setResolvingSearchPlace(false);
    }
  };

  const handleSelectNearbyPlace = (place: EnrichedPlaceResult) => {
    if (resolvingSearchPlace) return;
    setPendingNearbyPlace(place);
  };

  const applySavedAddress = async (addr: Address) => {
    setSavedAddressLoading(addr.id);
    try {
      // Three things must happen atomically (from the user's POV) when they
      // pick a saved address from the home picker:
      //  1. The active GPS-style pin updates so the home header shows it.
      //  2. The customer's `is_default` flag flips on the server so checkout,
      //     re-opens, and other screens see the same choice.
      //  3. The local addresses cache is invalidated so the next read returns
      //     the new `isDefault` value (otherwise checkout still picks the old
      //     default and the user has to re-pick).
      await Promise.all([
        addressService.setActiveLocation({
          latitude: addr.latitude,
          longitude: addr.longitude,
          address: addr.fullAddress,
        }),
        // setAddressDefault is idempotent and cheap; safe to fire on every pick.
        addressService.setAddressDefault(addr.id).catch(() => {
          // Non-fatal: the local store still updates so the home header is
          // correct. Checkout will fall back to the old default but the user
          // can re-pick in the address sheet.
        }),
      ]);
      const primary = addr.label ?? "Address";
      setAddressAndCoords(
        { primary, secondary: addr.fullAddress.slice(0, 80), fullAddress: addr.fullAddress },
        { latitude: addr.latitude, longitude: addr.longitude },
        { source: "selected" }
      );
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      queryClient.invalidateQueries({ queryKey: ["active-location"] });
      safeBack();
    } catch {
      safeBack();
    } finally {
      setSavedAddressLoading(null);
    }
  };

  const handleSelectSaved = (addr: Address) => {
    // Options menu uses AddressOptionsBottomSheet — no separate menuForId state.
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
        { latitude: place.latitude, longitude: place.longitude },
        { source: "selected" }
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
      <View style={[styles.header, { paddingTop: STATUS_BAR_TO_HEADER_GAP }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={safeBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={TITLE_DARK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select a location</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.searchBarWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={BRAND} />
            <TextInput
              ref={searchInputRef}
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
            tintColor={BRAND}
            colors={[BRAND]}
          />
        }
      >
        {/* Search results from API */}
        {showSearchSection && (
          <View style={[styles.sectionHeadRow, { marginTop: 0 }]}>
            <Ionicons name="search" size={14} color={BRAND} />
            <Text style={styles.sectionHeading}>SEARCH RESULTS</Text>
          </View>
        )}
        {showSearchSection && searchLoading && (
          <View style={[styles.searchLoadingWrap, styles.sectionBox]}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={styles.searchLoadingText}>Searching for places...</Text>
          </View>
        )}
        {showSearchSection && !searchLoading && searchResults.length > 0 && (
          <View style={[styles.searchResultsWrap, styles.sectionBox]}>
            {resolvingSearchPlace ? (
              <View style={styles.searchLoadingWrap}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={styles.searchLoadingText}>Loading map location…</Text>
              </View>
            ) : null}
            {searchResults.map((place, index) => (
              <TouchableOpacity
                key={`${place.mapboxSuggestion?.mapbox_id ?? place.primary}-${index}`}
                style={[styles.addressCard, styles.addressCardBorder]}
                onPress={() => void handleSelectSearchResult(place)}
                disabled={resolvingSearchPlace}
                activeOpacity={0.85}
              >
                <View style={styles.addressCardLeft}>
                  <View style={[styles.addressIconWrap, { backgroundColor: BRAND_LIGHT }]}>
                    <Ionicons name="location" size={22} color={BRAND} />
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
                  <Ionicons name="chevron-forward" size={20} color={BRAND} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {showSearchSection && searchResults.length === 0 && (
          <View style={styles.emptySaved}>
            {searchFailsafe || searchLoading ? (
              <>
                <ActivityIndicator size="small" color={BRAND} />
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
              <Ionicons name="locate" size={22} color={BRAND} />
              <View style={styles.optionTextWrap}>
                <Text style={styles.actionTitle}>Use current location</Text>
                <Text style={styles.optionSub} numberOfLines={1}>
                  {loading ? "Getting location..." : formatLocationPreviewUpper(currentLocationPreview)}
                </Text>
              </View>
            </View>
            <View style={styles.actionRowRight}>
              {loading ? (
                <ActivityIndicator size="small" color={BRAND} />
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
              <Ionicons name="add" size={22} color={BRAND} />
              <Text style={styles.actionTitle}>Add Address</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
          </TouchableOpacity>
        </View>

        <LocationWeatherBanner
          weather={weather}
          onPress={() => setWeatherSheetVisible(true)}
        />

        {/* SAVED ADDRESSES */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeading}>SAVED ADDRESSES</Text>
        </View>
        {addressesPending && savedAddressesData === undefined ? (
          <View style={styles.emptySaved}>
            <ActivityIndicator size="small" color={BRAND} />
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
          <>
            {visibleSavedAddresses.map((saved) => {
              const distM =
                referenceCoords != null
                  ? distanceMeters(
                      referenceCoords.latitude,
                      referenceCoords.longitude,
                      saved.latitude,
                      saved.longitude
                    )
                  : null;
              const phoneLine = formatPhoneLine(saved.contactMobile);
              const icon = savedAddressIcon(saved);
              const isSelected = saved.id === matchedSavedIdForPill;
              const openEdit = () => {
                router.push({
                  pathname: "/location-address",
                  params: {
                    latitude: String(saved.latitude),
                    longitude: String(saved.longitude),
                    addressId: String(saved.id),
                    primary: saved.label ?? saved.fullAddress.slice(0, 40),
                    ...forwardParams,
                  },
                });
              };
              return (
                <View key={saved.id} style={styles.savedCard}>
                  <View style={styles.savedCardTop}>
                    <View style={styles.savedCardLeftCol}>
                      <Ionicons name={icon.name} size={24} color={icon.color} />
                      {distM != null ? (
                        <Text style={styles.savedDistance}>{formatDistanceMeters(distM)}</Text>
                      ) : null}
                    </View>
                    <View style={styles.savedCardBody}>
                      <TouchableOpacity
                        onPress={() => handleSelectSaved(saved)}
                        disabled={savedAddressLoading !== null}
                        activeOpacity={0.85}
                      >
                        <View style={styles.addressLabelRow}>
                          <Text style={styles.savedAddressTitle}>{saved.label ?? "Address"}</Text>
                          {isSelected ? (
                            <View style={styles.selectedPillRight}>
                              <Text style={styles.selectedPillRightText}>SELECTED</Text>
                            </View>
                          ) : (
                            <View style={styles.unselectedRadio} />
                          )}
                        </View>
                        <Text style={styles.savedAddressLine} numberOfLines={3}>
                          {saved.fullAddress}
                        </Text>
                        {phoneLine ? (
                          <Text style={styles.savedPhoneLine} numberOfLines={1}>
                            {phoneLine}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                      <View style={styles.savedActionsRow}>
                        {savedAddressLoading === saved.id ? (
                          <ActivityIndicator size="small" color={BRAND} style={{ marginRight: 4 }} />
                        ) : null}
                        <TouchableOpacity
                          style={styles.savedActionBtn}
                          onPress={() => setOptionsAddress(saved)}
                          hitSlop={8}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="ellipsis-horizontal" size={13} color={BRAND} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.savedActionBtn}
                          onPress={async () => {
                            try {
                              await Share.share({ message: buildShareMessage(saved) });
                            } catch {
                              // ignore
                            }
                          }}
                          hitSlop={8}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="arrow-redo-outline" size={13} color={BRAND} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.savedActionBtn}
                          onPress={openEdit}
                          hitSlop={8}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="camera-outline" size={13} color={BRAND} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
            {hasMoreSaved ? (
              <TouchableOpacity
                style={styles.seeMoreBtn}
                onPress={() => setSavedExpanded((v) => !v)}
                activeOpacity={0.85}
              >
                <Text style={styles.seeMoreText}>{savedExpanded ? "see less" : "see more"}</Text>
                <Ionicons
                  name={savedExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={TEXT_GRAY}
                />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {!searchQuery.trim() && referenceCoords && !nearbyLoading && nearbyPlaces.length > 0 ? (
          <>
            <View style={styles.sectionDividerRow}>
              <Text style={styles.sectionHeading}>NEARBY LOCATIONS</Text>
              <View style={styles.sectionDividerLine} />
            </View>
            <View style={styles.nearbyList}>
              {nearbyPlaces.map((place, index) => {
                const distM =
                  place.latitude != null && place.longitude != null
                    ? distanceMeters(
                        referenceCoords.latitude,
                        referenceCoords.longitude,
                        place.latitude,
                        place.longitude
                      )
                    : null;
                return (
                  <TouchableOpacity
                    key={`${place.primary}-${place.latitude}-${index}`}
                    style={[
                      styles.nearbyRow,
                      index === nearbyPlaces.length - 1 && styles.nearbyRowLast,
                    ]}
                    onPress={() => handleSelectNearbyPlace(place)}
                    disabled={resolvingSearchPlace}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="location" size={22} color={BRAND} style={styles.nearbyPin} />
                    <View style={styles.nearbyTextWrap}>
                      <Text style={styles.nearbySubtitle} numberOfLines={2}>
                        {place.fullAddress || place.primary}
                      </Text>
                      {distM != null ? (
                        <Text style={styles.nearbyAwaySubtext}>{formatDistanceAway(distM)}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {showRecentSearches && (
          <>
            <View style={[styles.sectionHeadRow, { justifyContent: "space-between" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="time-outline" size={14} color={BRAND} />
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
      <WeatherDetailsSheet
        visible={weatherSheetVisible}
        weather={weather}
        onClose={() => setWeatherSheetVisible(false)}
      />
      <AddressOptionsBottomSheet
        visible={optionsAddress != null}
        onClose={() => setOptionsAddress(null)}
        onEdit={() => {
          if (!optionsAddress) return;
          const saved = optionsAddress;
          setOptionsAddress(null);
          router.push({
            pathname: "/location-address",
            params: {
              latitude: String(saved.latitude),
              longitude: String(saved.longitude),
              addressId: String(saved.id),
              primary: saved.label ?? saved.fullAddress.slice(0, 40),
              ...forwardParams,
            },
          });
        }}
        onDelete={() => {
          const saved = optionsAddress;
          if (!saved) return;
          setOptionsAddress(null);
          Alert.alert("Delete address?", "Remove this saved address?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await addressService.deleteAddress(saved.id);
                  await queryClient.invalidateQueries({ queryKey: ["addresses"] });
                  await queryClient.invalidateQueries({ queryKey: ["active-location"] });
                } catch {
                  Alert.alert("Could not delete", "Please try again.");
                }
              },
            },
          ]);
        }}
      />
      <AddressConfirmBottomSheet
        visible={!!confirmAddress}
        address={confirmAddress}
        onConfirm={async () => {
          const addr = confirmAddress;
          if (!addr) return;
          setConfirmAddress(null);
          await applySavedAddress(addr);
        }}
        onCancel={() => setConfirmAddress(null)}
      />
      <NearbyLocationConfirmBottomSheet
        visible={!!pendingNearbyPlace}
        place={pendingNearbyPlace}
        loading={resolvingSearchPlace}
        onConfirm={() => {
          const place = pendingNearbyPlace;
          if (!place) return;
          void applyNearbyPlace(place);
        }}
        onCancel={() => setPendingNearbyPlace(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    minHeight: 28,
  },
  backBtn: { width: 32, height: 32, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TITLE_DARK,
    letterSpacing: -0.2,
  },
  headerRight: { width: 32 },
  searchBarWrap: { paddingHorizontal: 0 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
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
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, marginRight: 10 },
  selectedPillAction: {
    backgroundColor: BRAND,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionTitle: { fontSize: 15, fontWeight: "700", color: TITLE_DARK, lineHeight: 20 },
  optionTextWrap: { flex: 1, marginLeft: 0 },
  optionSub: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 3,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    lineHeight: 14,
  },
  chevronWrap: { padding: 4 },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 0.9,
  },
  sectionDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 10,
    gap: 12,
  },
  sectionDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  savedCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  savedCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  savedCardLeftCol: {
    width: 44,
    alignItems: "center",
    marginRight: 12,
    paddingTop: 2,
  },
  savedDistance: {
    fontSize: 10,
    fontWeight: "600",
    color: TEXT_GRAY,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 13,
  },
  savedCardBody: {
    flex: 1,
    minWidth: 0,
  },
  savedAddressTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    flex: 1,
    lineHeight: 20,
  },
  savedAddressLine: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginTop: 4,
    lineHeight: 18,
  },
  savedPhoneLine: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 8,
    lineHeight: 16,
  },
  savedActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    marginTop: 12,
  },
  savedActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_BG,
  },
  unselectedRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: CARD_BG,
  },
  seeMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: CARD_BG,
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: "500",
    color: TEXT_GRAY,
    textTransform: "lowercase",
  },
  nearbyLoadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  nearbyLoadingText: { fontSize: 13, color: TEXT_GRAY },
  nearbyEmptyText: {
    fontSize: 13,
    color: TEXT_GRAY,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  nearbyList: {
    marginBottom: 12,
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  nearbyRowLast: { borderBottomWidth: 0 },
  nearbyPin: {
    marginRight: 12,
  },
  nearbyTextWrap: { flex: 1, minWidth: 0, marginRight: 8 },
  nearbyAwaySubtext: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 2,
  },
  nearbySubtitle: {
    fontSize: 14,
    color: TITLE_DARK,
    lineHeight: 20,
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
  distanceBadge: { fontSize: 12, color: BRAND, fontWeight: "600" },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  addressDistance: { fontSize: 12, color: BRAND, fontWeight: "600" },
  addressLabel: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
  addressLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardRight: { alignItems: "flex-end", justifyContent: "flex-start", marginLeft: 8, minWidth: 34 },
  moreBtn: { padding: 2 },
  selectedPillRight: {
    backgroundColor: BRAND,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedPillRightText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  addressLabelMatch: { color: BRAND, textDecorationLine: "underline" },
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
  addAddressLink: { fontSize: 15, color: BRAND, fontWeight: "600", marginTop: 10 },
  clearAllText: { fontSize: 12, fontWeight: "700", color: BRAND },
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
});
