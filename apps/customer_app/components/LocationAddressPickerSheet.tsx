/**
 * Full address picker inside location permission flow — saved addresses + manual search.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  searchPlacesEnriched,
  resolveMapboxEnrichedPlace,
  geocodeAddressToCoord,
  MAPBOX_SEARCH_DEBOUNCE_MS,
  type EnrichedPlaceResult,
} from "@/services/location.service";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import { useLocationStore } from "@/store/locationStore";
import { useAddresses, ADDRESSES_QUERY_KEY, ACTIVE_LOCATION_QUERY_KEY } from "@/hooks/useAddresses";
import { addressService, type Address } from "@/services/address.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const BORDER = "#F3F4F6";

type Props = {
  onBack: () => void;
  onComplete: () => void;
  autoFocusSearch?: boolean;
};

function savedAddressIcon(saved: Address): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const label = (saved.label ?? "").trim().toLowerCase();
  if (label === "current location") return { name: "locate", color: BRAND };
  if (label === "home") return { name: "home-outline", color: "#374151" };
  if (label === "work" || label === "office") return { name: "briefcase-outline", color: "#374151" };
  return { name: "location-outline", color: "#374151" };
}

export function LocationAddressPickerSheet({ onBack, onComplete, autoFocusSearch = false }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setAddressAndCoords = useLocationStore((s) => s.setAddressAndCoords);
  const { data: addresses = [], isPending: addressesPending } = useAddresses();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EnrichedPlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoFocusSearch) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [autoFocusSearch]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchPlacesEnriched(q);
          setSearchResults(results.slice(0, 8));
        } catch {
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      })();
    }, MAPBOX_SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const applySelection = useCallback(
    async (
      primary: string,
      fullAddress: string,
      latitude: number,
      longitude: number
    ) => {
      await addressService.setActiveLocation({
        latitude,
        longitude,
        address: fullAddress,
        addressId: null,
      });
      setAddressAndCoords(
        { primary, secondary: fullAddress.slice(0, 80), fullAddress },
        { latitude, longitude },
        { source: "selected" }
      );
      await queryClient.invalidateQueries({ queryKey: ADDRESSES_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ACTIVE_LOCATION_QUERY_KEY });
      onComplete();
    },
    [onComplete, queryClient, setAddressAndCoords]
  );

  const handleSelectAddress = useCallback(
    async (addr: Address) => {
      setSelectingId(addr.id);
      try {
        const { applySelectedDeliveryAddress } = await import(
          "@/lib/applySelectedDeliveryAddress"
        );
        await applySelectedDeliveryAddress(addr, queryClient);
        onComplete();
      } catch {
        Alert.alert("Could not select address", "Please try again.");
      } finally {
        setSelectingId(null);
      }
    },
    [onComplete, queryClient]
  );

  const handleSelectSearchResult = useCallback(
    async (place: EnrichedPlaceResult) => {
      if (resolvingPlace) return;
      setResolvingPlace(true);
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
          Alert.alert("Location unavailable", "Try another search result.");
          return;
        }
        const fullAddress = resolved.fullAddress || resolved.primary;
        await applySelection(resolved.primary, fullAddress, resolved.latitude, resolved.longitude);
      } finally {
        setResolvingPlace(false);
      }
    },
    [applySelection, resolvingPlace]
  );

  const showSearchResults = searchQuery.trim().length >= 2;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.floatingClose} onPress={onBack} hitSlop={10} activeOpacity={0.9}>
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <AppText style={styles.title}>Select a location</AppText>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={TEXT_GRAY} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search location manually"
            placeholderTextColor={TEXT_MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchLoading ? <ActivityIndicator size="small" color={BRAND} /> : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showSearchResults ? (
            <>
              <AppText style={styles.sectionLabel}>SEARCH RESULTS</AppText>
              {searchResults.length === 0 && !searchLoading ? (
                <AppText style={styles.emptyText}>No places found. Try another spelling.</AppText>
              ) : (
                searchResults.map((place, index) => (
                  <TouchableOpacity
                    key={`${place.primary}-${place.fullAddress}-${index}`}
                    style={[styles.addressRow, index < searchResults.length - 1 && styles.addressRowBorder]}
                    onPress={() => void handleSelectSearchResult(place)}
                    disabled={resolvingPlace}
                    activeOpacity={0.85}
                  >
                    <View style={styles.addressIconWrap}>
                      <Ionicons name="location-outline" size={22} color={BRAND} />
                    </View>
                    <View style={styles.addressTextWrap}>
                      <AppText style={styles.addressLabel} numberOfLines={1}>
                        {place.primary}
                      </AppText>
                      <AppText style={styles.addressLine} numberOfLines={2}>
                        {place.fullAddress}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.addRow}
                onPress={() => {
                  onComplete();
                  router.push("/location");
                }}
                activeOpacity={0.85}
              >
                <View style={styles.addIconWrap}>
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.addressTextWrap}>
                  <AppText style={styles.addressLabel}>Add Address</AppText>
                  <AppText style={styles.addressLine} numberOfLines={1}>
                    Search area or drop a pin on the map
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>

              <View style={styles.sectionRule} />
              <AppText style={styles.sectionLabel}>SAVED ADDRESSES</AppText>

              {addressesPending && addresses.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator size="small" color={BRAND} />
                  <AppText style={styles.emptyText}>Loading saved addresses…</AppText>
                </View>
              ) : addresses.length === 0 ? (
                <AppText style={styles.emptyText}>No saved addresses yet.</AppText>
              ) : (
                addresses.map((addr, index) => {
                  const icon = savedAddressIcon(addr);
                  const loading = selectingId === addr.id;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.addressRow, index < addresses.length - 1 && styles.addressRowBorder]}
                      onPress={() => void handleSelectAddress(addr)}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      <View style={styles.addressIconWrap}>
                        <Ionicons name={icon.name} size={22} color={icon.color} />
                      </View>
                      <View style={styles.addressTextWrap}>
                        <AppText style={styles.addressLabel} numberOfLines={1}>
                          {addr.label ?? "Address"}
                        </AppText>
                        <AppText style={styles.addressLine} numberOfLines={3}>
                          {addr.fullAddress}
                        </AppText>
                      </View>
                      {loading ? (
                        <ActivityIndicator size="small" color={BRAND} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 22,
    paddingHorizontal: 16,
    minHeight: "58%",
    maxHeight: "92%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FAFAFA",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  scroll: {
    flex: 1,
    maxHeight: 480,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  addIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    gap: 12,
  },
  addressRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  addressIconWrap: {
    width: 28,
    paddingTop: 2,
    alignItems: "center",
  },
  addressTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  addressLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 13,
    color: TEXT_GRAY,
    lineHeight: 18,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_GRAY,
    textAlign: "center",
    paddingVertical: 12,
  },
});
