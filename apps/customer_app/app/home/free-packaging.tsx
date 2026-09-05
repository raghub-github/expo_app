/**
 * Discovery Free Packaging — magic9-style inner page for stores with no bag fee.
 */

import { useCallback, useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  StatusBar as RNStatusBar,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { ListRenderItem } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { AppText } from "@/components/AppText";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { DiscoveryPackagingGridCard } from "@/features/discovery-home/DiscoveryPackagingGridCard";
import {
  DiscoveryPackagingFilterRow,
  type PackagingSortMode,
} from "@/features/discovery-home/DiscoveryPackagingFilterRow";
import { DiscoveryWaveDivider } from "@/features/discovery-home/DiscoveryWaveDivider";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { filterPureVegMerchants, filterVegSafeCategories } from "@/lib/pureVegFilter";
import { useLocationStore } from "@/store/locationStore";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import {
  fetchAndCacheMerchantsList,
  MERCHANTS_LIST_GC_MS,
  MERCHANTS_LIST_STALE_MS,
  merchantsQueryKey,
} from "@/lib/merchantsListCache";
import {
  fetchUserAppCategoriesWithCache,
  readSyncUserAppCategories,
  getUserAppCategoriesCachedAt,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import { safeRouterBack, FOOD_HOME_FALLBACK } from "@/lib/safeRouterBack";
import { resolveMerchantLiveStatus } from "@/lib/merchantListing";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import type { MerchantSummary } from "@/services/merchant.service";
import type { UserAppCategoryItem } from "@/services/userAppCategory.service";

const STORE_TYPE = "FOOD";
const HEADER_BG = "#1A2422";
const PAGE_PAD = 16;
const GRID_GAP = 12;

function hasNoPackagingCharge(m: MerchantSummary): boolean {
  const amount = m.packagingChargeAmount ?? 0;
  return !Number.isFinite(amount) || amount <= 0;
}

function merchantMatchesCategory(m: MerchantSummary, catName: string): boolean {
  const needle = catName.trim().toLowerCase();
  if (!needle) return true;
  return (m.cuisines ?? []).some((c) => {
    const v = c.trim().toLowerCase();
    return v.includes(needle) || needle.includes(v);
  });
}

function costForTwoOf(m: MerchantSummary): number {
  const n = Number((m as MerchantSummary & { costForTwo?: number }).costForTwo);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

export default function FreePackagingStoresScreen() {
  const insets = useAppSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const debouncedCoords = useDebouncedCoords(coords, 250);
  const listingCoords = useMemo(() => {
    if (locationSource === "selected" && coords) return coords;
    return debouncedCoords ?? coords;
  }, [locationSource, coords, debouncedCoords]);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const setVegOnly = useDietaryPreferenceStore((s) => s.setVegOnly);
  const statusMap = useStoreStatusStore((s) => s.statusMap);
  const [topDeals, setTopDeals] = useState(false);
  const [lowPrice, setLowPrice] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [nearFast, setNearFast] = useState(false);
  const [sortBy, setSortBy] = useState<PackagingSortMode>("relevance");
  const [categoryId, setCategoryId] = useState<number | null>(null);

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

  const locationLabel = useMemo(
    () =>
      resolveDeliveryLocationLabel({
        locationSource,
        address,
        addresses,
        coords: merchantsAnchorCoords,
      }) || "Select location",
    [locationSource, address, addresses, merchantsAnchorCoords]
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

  const { data: categoriesResponse } = useQuery({
    queryKey: userAppCategoriesQueryKey(STORE_TYPE),
    queryFn: () => fetchUserAppCategoriesWithCache(STORE_TYPE),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    initialData: () => readSyncUserAppCategories(STORE_TYPE),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(STORE_TYPE),
    placeholderData: (previousData) => previousData,
  });

  const categories = filterVegSafeCategories(categoriesResponse?.items ?? [], vegOnly);
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;

  const stores = useMemo(() => {
    let rows = filterPureVegMerchants(
      Array.isArray(merchantsData) ? merchantsData : [],
      vegOnly
    ).filter(hasNoPackagingCharge);
    if (selectedCategory) {
      rows = rows.filter((m) => merchantMatchesCategory(m, selectedCategory.name));
    }
    if (openNow) {
      rows = rows.filter((m) => resolveMerchantLiveStatus(m, statusMap) === "OPEN");
    }
    if (topDeals) {
      rows = rows.filter((m) => !!m.offerText?.trim());
    }
    const sortMode: PackagingSortMode = nearFast ? "distance" : sortBy;
    if (lowPrice || sortMode !== "relevance") {
      rows = [...rows].sort((a, b) => {
        if (lowPrice) {
          const cost = costForTwoOf(a) - costForTwoOf(b);
          if (cost !== 0) return cost;
        }
        if (sortMode === "rating") {
          const ra = Number(a.avgRating) || 0;
          const rb = Number(b.avgRating) || 0;
          if (rb !== ra) return rb - ra;
        }
        if (sortMode === "distance" || nearFast) {
          return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        }
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      });
    }
    return rows;
  }, [merchantsData, selectedCategory, topDeals, lowPrice, openNow, nearFast, sortBy, statusMap]);

  const applyDarkStatusBar = useCallback(() => {
    useScreenChromeStore.getState().setStatusBarBackground(HEADER_BG, "light");
    if (Platform.OS === "android") {
      RNStatusBar.setBarStyle("light-content", true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      applyDarkStatusBar();
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [applyDarkStatusBar])
  );

  const renderItem = useCallback<ListRenderItem<MerchantSummary>>(
    ({ item, index }) => (
      <View style={{ flex: 1, paddingRight: index % 2 === 0 ? GRID_GAP : 0 }}>
        <DiscoveryPackagingGridCard
          merchant={item}
          weatherDelayMinutes={weatherDelayMinutes}
        />
      </View>
    ),
    [weatherDelayMinutes]
  );

  const cycleSort = useCallback(() => {
    setSortBy((prev) =>
      prev === "relevance" ? "rating" : prev === "rating" ? "distance" : "relevance"
    );
  }, []);

  const pillRow = (
    <DiscoveryPackagingFilterRow
      sortBy={sortBy}
      openNow={openNow}
      topDeals={topDeals}
      lowPrice={lowPrice}
      vegOnly={vegOnly}
      nearFast={nearFast}
      onCycleSort={cycleSort}
      onToggleOpenNow={() => setOpenNow((v) => !v)}
      onToggleTopDeals={() => setTopDeals((v) => !v)}
      onToggleLowPrice={() => setLowPrice((v) => !v)}
      onToggleVeg={() => setVegOnly(!vegOnly)}
      onToggleNearFast={() => setNearFast((v) => !v)}
    />
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={HEADER_BG} />
      <View style={styles.header}>
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => safeRouterBack(router, FOOD_HOME_FALLBACK)}
            style={styles.iconBtn}
            hitSlop={10}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={DiscoveryColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.titleBlock}
            onPress={() => router.push("/location")}
            activeOpacity={0.8}
          >
            <AppText style={styles.title}>Free packaging</AppText>
            <View style={styles.locRow}>
              <AppText style={styles.loc} numberOfLines={1}>
                {locationLabel}
              </AppText>
              <Ionicons name="chevron-down" size={12} color={DiscoveryColors.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.iconBtn} />
        </View>
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.92}
          onPress={() => router.push({ pathname: "/search", params: { storeType: "FOOD" } })}
          accessibilityRole="search"
          accessibilityLabel="Search restaurants"
        >
          <Ionicons name="search" size={18} color={DiscoveryColors.textDim} />
          <AppText style={styles.searchPlaceholder} numberOfLines={1}>
            Search restaurants...
          </AppText>
        </TouchableOpacity>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {categories.map((cat: UserAppCategoryItem) => {
            const active = cat.id === categoryId;
            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.catCell}
                activeOpacity={0.85}
                onPress={() => setCategoryId((prev) => (prev === cat.id ? null : cat.id))}
              >
                <UserAppCategoryImage
                  imageUrl={cat.imageUrl}
                  cacheKey={`packaging-cat-${cat.id}`}
                  contentFit="cover"
                  fallbackColor="transparent"
                  style={styles.catImage}
                />
                <AppText style={[styles.catLabel, active && styles.catLabelOn]} numberOfLines={1}>
                  {cat.name}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <DiscoveryWaveDivider width={width} color={HEADER_BG} />
      <FlashList
        data={stores}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        extraData={`${weatherDelayMinutes}-${topDeals}-${lowPrice}-${categoryId}-${vegOnly}-${openNow}-${nearFast}-${sortBy}`}
        contentContainerStyle={{
          paddingHorizontal: PAGE_PAD,
          paddingBottom: insets.bottom + 24,
        }}
        ListHeaderComponent={pillRow}
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
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="bag-handle-outline" size={36} color={DiscoveryColors.accent} />
            </View>
            <AppText style={styles.emptyTitle}>
              {isFetching ? "Finding nearby stores" : "No free-packaging stores nearby"}
            </AppText>
            <AppText style={styles.empty}>
              {isFetching
                ? "We’re looking for outlets that don’t add packaging charges."
                : "Try another area, or check back later for stores with zero packaging fee."}
            </AppText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    backgroundColor: HEADER_BG,
    paddingBottom: 4,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.2,
  },
  locRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  loc: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
  searchBar: {
    marginHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: DiscoveryColors.search,
  },
  searchPlaceholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: "#8E8E8E",
  },
  catRow: {
    paddingHorizontal: 12,
    gap: 12,
    paddingBottom: 8,
  },
  catCell: {
    width: 64,
    alignItems: "center",
  },
  catImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  catLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: DiscoveryColors.textMuted,
    textAlign: "center",
    width: 64,
  },
  catLabelOn: {
    color: DiscoveryColors.teal,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: DiscoveryColors.card,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DiscoveryColors.text,
    textAlign: "center",
  },
  empty: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: DiscoveryColors.textMuted,
  },
});
