/**
 * Parcel pickup / drop location search — same Mapbox + ranking path as ride-pickup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type TextInput as TextInputType,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { LocationSearchResultRow } from "@/components/location/LocationSearchResultRow";
import { LocationSearchSkeleton } from "@/components/location/LocationSearchSkeleton";
import { LocationSearchEmptyState } from "@/components/location/LocationSearchEmptyState";
import { useAddresses } from "@/hooks/useAddresses";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import { useRideMapPickerStore } from "@/store/rideMapPickerStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { useParcelBookingStore, type ParcelStop } from "./parcelBookingStore";
import {
  searchPlacesEnriched,
  resolveMapboxEnrichedPlace,
  resolvePlaceDisplayName,
  isPincodeSearchMode,
  type EnrichedPlaceResult,
} from "@/services/location.service";
import { addressService, type Address } from "@/services/address.service";
import { finalizeRapidoSuggestions } from "@/lib/location-search-ranking";
import {
  extractPickupCityHint,
  localSuggestionsToEnriched,
  mergeRideSearchResults,
  recentItemsToEnrichedResults,
  RIDE_SEARCH_DEBOUNCE_MS,
  RIDE_SEARCH_MIN_CHARS,
} from "@/features/ride/ride-location-search";
import { GatiMitraColors } from "@/constants/gatimitra";
import { haversineKm } from "@/lib/billSummary";

const HERO_MINT = GatiMitraColors.mintSoft;

export function ParcelLocationSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ field?: string }>();
  const field = params.field === "pickup" ? "pickup" : "drop";
  const isPickup = field === "pickup";

  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const { data: addresses = [] } = useAddresses();
  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);
  const hydrateRecents = useRecentLocationStore((s) => s.hydrate);
  const recentItems = useRecentLocationStore((s) => s.items);
  const getRecentLocationKeys = useRecentLocationStore((s) => s.getRecentLocationKeys);
  const favoriteItems = useFavoriteLocationsStore((s) => s.items);
  const hydrateFavorites = useFavoriteLocationsStore((s) => s.hydrate);
  const isFavorite = useFavoriteLocationsStore((s) => s.isFavorite);
  const toggleFavorite = useFavoriteLocationsStore((s) => s.toggleFavorite);
  const setPickup = useParcelBookingStore((s) => s.setPickup);
  const setDrop = useParcelBookingStore((s) => s.setDrop);
  const pickupStop = useParcelBookingStore((s) => s.pickup);
  const consumePendingResult = useRideMapPickerStore((s) => s.consumePendingResult);
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);

  const inputRef = useRef<TextInputType>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<EnrichedPlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    void hydrateRecents();
    void hydrateFavorites();
  }, [hydrateRecents, hydrateFavorites]);

  // Keep mint status bar while this screen (and courier booking) is open.
  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HERO_MINT, "dark");
    }, [setStatusBarBackground])
  );

  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingResult();
      if (pending && (pending.field === "pickup" || pending.field === "drop")) {
        const stop: ParcelStop = {
          primary: pending.primary,
          fullAddress: pending.fullAddress,
          latitude: pending.latitude,
          longitude: pending.longitude,
        };
        if (pending.field === "pickup") setPickup(stop);
        else setDrop(stop);
        addRecentLocation({
          latitude: stop.latitude,
          longitude: stop.longitude,
          primary: stop.primary,
          fullAddress: stop.fullAddress,
          kind: pending.field,
        });
        const state = useParcelBookingStore.getState();
        if (state.pickup && state.drop) {
          state.markVisitedInnerPage();
          router.replace("/home/service/parcel-book" as never);
          return;
        }
        router.back();
        return;
      }
      // Soft focus after layout — avoid keyboard jumping over header.
      // Don't auto-focus when returning from map with a pending result.
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, [consumePendingResult, setPickup, setDrop, addRecentLocation, router])
  );

  const proximity = useCallback(() => {
    if (isPickup) {
      if (coords) return { latitude: coords.latitude, longitude: coords.longitude };
      return null;
    }
    if (pickupStop) {
      return { latitude: pickupStop.latitude, longitude: pickupStop.longitude };
    }
    if (coords) return { latitude: coords.latitude, longitude: coords.longitude };
    return null;
  }, [isPickup, coords, pickupStop]);

  const runSearch = useCallback(
    async (raw: string, signal: AbortSignal): Promise<EnrichedPlaceResult[]> => {
      const trimmed = raw.trim();
      const isPincode = isPincodeSearchMode(trimmed);
      const minChars = isPincode ? 6 : RIDE_SEARCH_MIN_CHARS;
      const prox = proximity();
      const proximityOpt = prox ?? undefined;
      const recentKeys = getRecentLocationKeys();
      const getLocal = (q: string) => addressService.getLocationSearchSuggestions(q, 12);
      const sessionContext = isPickup ? "parcel-pickup" : "parcel-drop";

      if (trimmed.length > 0 && trimmed.length < minChars) {
        return [];
      }

      if (trimmed.length === 0) {
        const recent = recentItemsToEnrichedResults(recentItems, proximityOpt ?? undefined);
        const saved = addresses.slice(0, 8).map((addr) => ({
          primary: addr.label?.trim() || addr.fullAddress.split(",")[0]?.trim() || "Saved",
          secondary: addr.fullAddress.slice(0, 120),
          fullAddress: addr.fullAddress,
          latitude: addr.latitude,
          longitude: addr.longitude,
          city: addr.city ?? undefined,
          state: addr.state ?? undefined,
          pincode: addr.pincode ?? undefined,
          confidenceScore: 0.95,
          source: "local" as const,
          savedLabel: addr.label ?? undefined,
          resultSection: "saved" as const,
          pendingRetrieve: false,
        }));
        const browseHint = extractPickupCityHint(
          pickupStop?.fullAddress ||
            address?.fullAddress ||
            address?.primary ||
            ""
        );
        if (!proximityOpt || browseHint.length < 2) {
          return mergeRideSearchResults(saved, recent);
        }
        const browseResults = await searchPlacesEnriched(browseHint, {
          signal,
          proximity: proximityOpt,
          sessionContext,
          recentLocationKeys: recentKeys,
          getLocalSuggestions: getLocal,
        });
        return finalizeRapidoSuggestions(
          mergeRideSearchResults(saved, recent, browseResults),
          browseHint
        );
      }

      let results = await searchPlacesEnriched(trimmed, {
        signal,
        proximity: proximityOpt,
        sessionContext,
        recentLocationKeys: recentKeys,
        getLocalSuggestions: getLocal,
      });

      if (results.length === 0 && !isPincode) {
        try {
          const local = await getLocal(trimmed);
          if (signal.aborted) return [];
          if (local.length > 0) {
            results = localSuggestionsToEnriched(local, proximityOpt ?? undefined);
          }
        } catch {
          /* keep empty */
        }
      }

      return finalizeRapidoSuggestions(results, trimmed);
    },
    [
      proximity,
      getRecentLocationKeys,
      recentItems,
      addresses,
      pickupStop?.fullAddress,
      address?.fullAddress,
      address?.primary,
      isPickup,
    ]
  );

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setLoading(true);
      void runSearch(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) setSuggestions(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, RIDE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, [query, runSearch]);

  const title = isPickup ? "Pickup from" : "Drop to";
  const pinColor = isPickup ? GatiMitraColors.primaryMint : "#EF4444";
  const pinBg = isPickup ? GatiMitraColors.mintSoft : "#FEE2E2";

  const applyStop = useCallback(
    (stop: ParcelStop) => {
      if (isPickup) setPickup(stop);
      else setDrop(stop);
      addRecentLocation({
        latitude: stop.latitude,
        longitude: stop.longitude,
        primary: stop.primary,
        fullAddress: stop.fullAddress,
        kind: field,
      });
      const state = useParcelBookingStore.getState();
      const nextPickup = isPickup ? stop : state.pickup;
      const nextDrop = isPickup ? state.drop : stop;
      if (nextPickup && nextDrop) {
        state.markVisitedInnerPage();
        router.replace("/home/service/parcel-book" as never);
        return;
      }
      router.back();
    },
    [isPickup, setPickup, setDrop, addRecentLocation, field, router]
  );

  const onSelectPlace = useCallback(
    async (place: EnrichedPlaceResult) => {
      if (selecting) return;
      setSelecting(true);
      try {
        const resolved = await resolveMapboxEnrichedPlace(
          place,
          isPickup ? "parcel-pickup" : "parcel-drop"
        );
        applyStop({
          primary: resolvePlaceDisplayName(resolved),
          fullAddress: resolved.fullAddress || resolvePlaceDisplayName(resolved),
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          label: resolved.savedLabel ?? null,
        });
      } catch {
        applyStop({
          primary: resolvePlaceDisplayName(place),
          fullAddress: place.fullAddress || resolvePlaceDisplayName(place),
          latitude: place.latitude,
          longitude: place.longitude,
          label: place.savedLabel ?? null,
        });
      } finally {
        setSelecting(false);
      }
    },
    [applyStop, selecting, isPickup]
  );

  const onSelectSaved = useCallback(
    (addr: Address) => {
      applyStop({
        primary: addr.label?.trim() || addr.fullAddress.split(",")[0]?.trim() || "Saved place",
        fullAddress: addr.fullAddress,
        latitude: addr.latitude,
        longitude: addr.longitude,
        contactName: addr.contactName,
        contactMobile: addr.contactMobile,
        label: addr.label,
      });
    },
    [applyStop]
  );

  const openMap = useCallback(() => {
    const prox = proximity();
    const lat = prox?.latitude ?? 28.6139;
    const lng = prox?.longitude ?? 77.209;
    router.push({
      pathname: "/home/service/ride-map",
      params: {
        field,
        latitude: String(lat),
        longitude: String(lng),
      },
    } as never);
  }, [router, field, proximity]);

  const heartPlace = useCallback(
    (place: { latitude: number; longitude: number; primary: string; fullAddress?: string }) => {
      toggleFavorite({
        latitude: place.latitude,
        longitude: place.longitude,
        primary: place.primary,
        fullAddress: place.fullAddress,
      });
    },
    [toggleFavorite]
  );

  const formatDistance = (loc: EnrichedPlaceResult) => {
    const anchor = proximity();
    let km: number | null = null;
    if (loc.distanceKm != null && Number.isFinite(loc.distanceKm)) {
      km = loc.distanceKm;
    } else if (anchor && loc.latitude && loc.longitude) {
      const straight = haversineKm(anchor.latitude, anchor.longitude, loc.latitude, loc.longitude);
      km = Number.isFinite(straight) ? straight : null;
    }
    if (km == null) return null;
    return km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km * 10) / 10} km`;
  };

  const trimmed = query.trim();
  const minChars = isPincodeSearchMode(trimmed) ? 6 : RIDE_SEARCH_MIN_CHARS;
  const showEmpty = !loading && trimmed.length >= minChars && suggestions.length === 0;
  const showBrowseSaved = !trimmed && addresses.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="dark" backgroundColor={HERO_MINT} />
      {/* Root spacer already paints mint status bar — no extra top inset here. */}
      <View style={styles.header}>
        <AppText style={styles.headerTitle}>{title}</AppText>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.pin, { backgroundColor: pinBg }]}>
          <Ionicons
            name={isPickup ? "location" : "radio-button-on"}
            size={18}
            color={pinColor}
          />
        </View>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder={isPickup ? "Search pickup address" : "Search drop address"}
            placeholderTextColor="#94A3B8"
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <TouchableOpacity style={styles.mapBtn} onPress={openMap} activeOpacity={0.85}>
        <Ionicons name="location-outline" size={18} color="#334155" />
        <AppText style={styles.mapBtnText}>Select on map</AppText>
      </TouchableOpacity>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {loading && trimmed.length >= minChars ? <LocationSearchSkeleton /> : null}

        {showBrowseSaved
          ? addresses.slice(0, 8).map((addr) => {
              const primary =
                addr.label?.trim() || addr.fullAddress.split(",")[0]?.trim() || "Saved";
              const fav = isFavorite(addr.latitude, addr.longitude, primary);
              return (
                <View key={addr.id} style={styles.savedRow}>
                  <TouchableOpacity
                    style={styles.savedMain}
                    onPress={() => onSelectSaved(addr)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={
                        addr.label?.toLowerCase() === "home"
                          ? "home-outline"
                          : addr.label?.toLowerCase() === "work"
                            ? "briefcase-outline"
                            : "time-outline"
                      }
                      size={20}
                      color="#64748B"
                    />
                    <View style={styles.savedBody}>
                      <AppText style={styles.savedTitle} numberOfLines={1}>
                        {primary}
                      </AppText>
                      <AppText style={styles.savedSub} numberOfLines={2}>
                        {addr.fullAddress}
                      </AppText>
                      {addr.contactName ? (
                        <AppText style={styles.savedContact} numberOfLines={1}>
                          {addr.contactName}
                          {addr.contactMobile
                            ? ` (${String(addr.contactMobile).replace(/\D/g, "").slice(-10)})`
                            : ""}
                        </AppText>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    hitSlop={8}
                    onPress={() =>
                      heartPlace({
                        latitude: addr.latitude,
                        longitude: addr.longitude,
                        primary,
                        fullAddress: addr.fullAddress,
                      })
                    }
                  >
                    <Ionicons
                      name={fav ? "heart" : "heart-outline"}
                      size={18}
                      color={fav ? "#EF4444" : "#94A3B8"}
                    />
                  </TouchableOpacity>
                </View>
              );
            })
          : null}

        {!loading &&
          !trimmed &&
          favoriteItems
            .filter(
              (f) =>
                !addresses.some(
                  (a) =>
                    Math.abs(a.latitude - f.latitude) < 0.0005 &&
                    Math.abs(a.longitude - f.longitude) < 0.0005
                )
            )
            .slice(0, 6)
            .map((f, idx) => (
              <LocationSearchResultRow
                key={`fav-${f.latitude}-${f.longitude}-${idx}`}
                item={{
                  primary: f.primary,
                  secondary: (f.fullAddress ?? "").slice(0, 120),
                  fullAddress: f.fullAddress ?? f.primary,
                  latitude: f.latitude,
                  longitude: f.longitude,
                  confidenceScore: 0.9,
                  source: "local",
                  resultSection: "recent",
                  pendingRetrieve: false,
                }}
                onPress={() =>
                  applyStop({
                    primary: f.primary,
                    fullAddress: f.fullAddress ?? f.primary,
                    latitude: f.latitude,
                    longitude: f.longitude,
                  })
                }
                favorited
                onToggleFavorite={() =>
                  heartPlace({
                    latitude: f.latitude,
                    longitude: f.longitude,
                    primary: f.primary,
                    fullAddress: f.fullAddress,
                  })
                }
              />
            ))}

        {!loading &&
          suggestions
            .filter((s) => !(showBrowseSaved && s.resultSection === "saved"))
            .map((item, idx) => {
              const primary = resolvePlaceDisplayName(item);
              return (
                <LocationSearchResultRow
                  key={`${item.latitude}-${item.longitude}-${item.primary}-${idx}`}
                  item={item}
                  query={query}
                  distanceLabel={formatDistance(item)}
                  onPress={() => void onSelectPlace(item)}
                  favorited={isFavorite(item.latitude, item.longitude, primary)}
                  onToggleFavorite={() =>
                    heartPlace({
                      latitude: item.latitude,
                      longitude: item.longitude,
                      primary,
                      fullAddress: item.fullAddress,
                    })
                  }
                />
              );
            })}

        {showEmpty ? <LocationSearchEmptyState /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
    minHeight: 36,
    backgroundColor: HERO_MINT,
  },
  headerTitle: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: "#fff",
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: GatiMitraColors.mintHighlight,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
    padding: 0,
  },
  mapBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: GatiMitraColors.mintHighlight,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
  },
  mapBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  list: {
    flex: 1,
    backgroundColor: "#fff",
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    gap: 2,
  },
  savedMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  savedBody: {
    flex: 1,
    minWidth: 0,
  },
  savedTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  savedSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  savedContact: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
