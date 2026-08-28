/**
 * Stores currently running deals / offer headlines.
 */

import { useCallback, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { ListRenderItem } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { AppText } from "@/components/AppText";
import { DiscoveryRestaurantCard } from "@/features/discovery-home/DiscoveryRestaurantCard";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { useLocationStore } from "@/store/locationStore";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import {
  fetchAndCacheMerchantsList,
  MERCHANTS_LIST_GC_MS,
  MERCHANTS_LIST_STALE_MS,
  merchantsQueryKey,
} from "@/lib/merchantsListCache";
import { safeRouterBack, FOOD_HOME_FALLBACK } from "@/lib/safeRouterBack";
import { filterPureVegMerchants } from "@/lib/pureVegFilter";
import { formatCardOfferLine } from "@/lib/merchantOfferBadge";
import type { MerchantSummary } from "@/services/merchant.service";

function hasDeal(m: MerchantSummary): boolean {
  return Boolean(formatCardOfferLine(m.offerText));
}

export default function CrazyDealsStoresScreen() {
  const insets = useAppSafeAreaInsets();
  const router = useRouter();
  const { address, coords, locationSource } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 250);
  const listingCoords = useMemo(() => {
    if (locationSource === "selected" && coords) return coords;
    return debouncedCoords ?? coords;
  }, [locationSource, coords, debouncedCoords]);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);

  const merchantsAnchorCoords = useMemo(
    () =>
      resolveMerchantListingCoords({
        locationSource,
        listingCoords,
        addresses,
        activeLocation,
      }),
    [locationSource, listingCoords, addresses, activeLocation]
  );

  const { data: weather } = useLocationWeather({
    lat: merchantsAnchorCoords?.latitude,
    lng: merchantsAnchorCoords?.longitude,
  });
  const weatherDelayMinutes = weather?.etaDelayMinutes ?? 0;

  const {
    data: merchantsData,
    isFetching,
    refetch,
  } = useQuery({
    queryKey:
      merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null
        ? merchantsQueryKey(
            merchantsAnchorCoords.latitude,
            merchantsAnchorCoords.longitude,
            vegOnly,
            "FOOD"
          )
        : (["merchants", "pending", vegOnly, "FOOD"] as const),
    queryFn: async () => {
      if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords?.longitude == null) {
        return [];
      }
      return fetchAndCacheMerchantsList(
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        vegOnly,
        "FOOD"
      );
    },
    enabled: merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    staleTime: MERCHANTS_LIST_STALE_MS,
    gcTime: MERCHANTS_LIST_GC_MS,
    placeholderData: (previousData, previousQuery) => {
      const prevVeg = previousQuery?.queryKey?.[2];
      if (prevVeg !== vegOnly) return undefined;
      return previousData;
    },
  });

  const stores = useMemo(
    () => filterPureVegMerchants(Array.isArray(merchantsData) ? merchantsData : [], vegOnly).filter(hasDeal),
    [merchantsData, vegOnly]
  );

  const renderItem = useCallback<ListRenderItem<MerchantSummary>>(
    ({ item }) => (
      <DiscoveryRestaurantCard merchant={item} weatherDelayMinutes={weatherDelayMinutes} />
    ),
    [weatherDelayMinutes]
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={DiscoveryColors.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => safeRouterBack(router, FOOD_HOME_FALLBACK)}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={DiscoveryColors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <AppText style={styles.title}>Crazy deals</AppText>
          <AppText style={styles.sub}>
            {stores.length} {stores.length === 1 ? "store" : "stores"} with live offers
          </AppText>
        </View>
      </View>
      <FlashList
        data={stores}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={weatherDelayMinutes}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => void refetch()}
            tintColor={DiscoveryColors.teal}
            colors={[DiscoveryColors.teal]}
            progressBackgroundColor={DiscoveryColors.card}
          />
        }
        ListEmptyComponent={
          <AppText style={styles.empty}>
            {isFetching ? "Finding deals…" : "No live deals nearby right now."}
          </AppText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: DiscoveryColors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: DiscoveryColors.text,
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
  empty: {
    textAlign: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    fontSize: 14,
    color: DiscoveryColors.textMuted,
  },
});
