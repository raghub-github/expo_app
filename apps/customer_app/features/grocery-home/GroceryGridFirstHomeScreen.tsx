/**
 * Grocery home — grid_first layout with grocery-specific CX App Home hero +
 * Super Admin GROCERY user-app categories (database-driven).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
  StatusBar as NativeStatusBar,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { FlashList, type FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
} from "react-native-reanimated";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import type { MerchantSummary } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import {
  fetchAndCacheMerchantsList,
  MERCHANTS_LIST_GC_MS,
  MERCHANTS_LIST_STALE_MS,
  merchantsQueryKey,
  readSyncMerchantsListEntry,
  seedMerchantsListQueryIfCached,
} from "@/lib/merchantsListCache";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import {
  filterAndSortMerchants,
  merchantListingStoreCountLabel,
  resolveMerchantLiveStatus,
  type MerchantListSort,
} from "@/lib/merchantListing";
import { useGroceryHomeLayout } from "@/hooks/useGroceryHomeLayout";
import { GMHeader } from "@/components/GMHeader";
import { GMRestaurantCardV2 } from "@/components/GMRestaurantCardV2";
import { GMEmptyState } from "@/components/GMEmptyState";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { BrandingFooter } from "@/components/BrandingFooter";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  HEADER_TOP_PADDING_NONE,
  STATUS_BAR_TO_HEADER_GAP,
  resolveTopSafeInset,
  FLOATING_CART_BAR_HEIGHT,
  FLOATING_CART_UI_LIFT,
} from "@/constants/layout";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { foodHomeRouterBack } from "@/lib/safeRouterBack";
import {
  FoodHomeHeroCarousel,
  GRID_FIRST_HEADER_OVERLAY_H,
  gridFirstSkyHeightForAspect,
} from "@/components/home/FoodHomeHeroCarousel";
import { FoodHomeGridFirstHeader, GROCERY_SEARCH_PLACEHOLDERS } from "@/components/home/FoodHomeGridFirstHeader";
import { FoodHomeGridFirstStickyChrome } from "@/components/home/FoodHomeGridFirstStickyChrome";
import { FoodHomeCategoryTabs, computeGridFirstCategoryTabMetrics } from "@/components/home/FoodHomeCategoryTabs";
import { FoodHomeFilterRow } from "@/components/home/FoodHomeFilterRow";
import {
  defaultGridFirstStickyMetrics,
  GRID_FIRST_FILTER_ROW_H,
  GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
  gridFirstCategoryStickScrollY,
  gridFirstDefaultHeaderBlockHeight,
  gridFirstFilterStickScrollY,
  gridFirstSearchStickScrollY,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { NON_SERVICEABLE_STATUS_BAR_BG, useScreenChromeStore } from "@/store/screenChromeStore";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import {
  fetchUserAppCategoriesWithCache,
  getUserAppCategoriesCachedAt,
  prefetchUserAppCategories,
  readSyncUserAppCategories,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import type { UserAppCategoryItem } from "@/services/userAppCategory.service";

const STORE_TYPE = "GROCERY" as const;
const PAGE_PAD = 16;
const SECTION_GAP_SM = 10;
const EMPTY_MERCHANTS: MerchantSummary[] = [];

function dedupeUserAppCategories(rows: UserAppCategoryItem[]): UserAppCategoryItem[] {
  const byId = new Map<number, UserAppCategoryItem>();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const byName = new Map<string, UserAppCategoryItem>();
  for (const r of byId.values()) {
    const key = r.name.trim().toLowerCase();
    const cur = byName.get(key);
    if (!cur || r.displayOrder < cur.displayOrder || (r.displayOrder === cur.displayOrder && r.id < cur.id)) {
      byName.set(key, r);
    }
  }
  return [...byName.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id
  );
}

export default function GroceryGridFirstHomeScreen() {
  const router = useRouter();
  const insets = useAppSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const address = useLocationStore((s) => s.address);
  const debouncedCoords = useDebouncedCoords(coords);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  const statusMap = useStoreStatusStore((s) => s.statusMap);
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const setImmersiveStatusBarChrome = useScreenChromeStore((s) => s.setImmersiveStatusBarChrome);
  const floatingDockVisible = useFloatingDockUiStore((s) => s.dockVisible);

  const [openNow, setOpenNow] = useState(false);
  const [sortBy, setSortBy] = useState<MerchantListSort>("default");
  const [refreshing, setRefreshing] = useState(false);
  const [gridFirstCategoryTabId, setGridFirstCategoryTabId] = useState("all");
  const merchantListRef = useRef<FlashListRef<MerchantSummary>>(null);

  const listingCoords = locationSource === "selected" ? coords : debouncedCoords;
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

  const { gridFirstHeroMedia } = useGroceryHomeLayout(address, merchantsAnchorCoords);

  const showGridFirstShell = true;

  const gridFirstLocationLabels = useMemo(() => {
    if (locationSource === "selected" && address) {
      const primary = address.primary?.trim() || "Home";
      const secondaryRaw =
        address.secondary?.trim() ||
        address.fullAddress?.trim() ||
        "Add delivery address";
      const secondary =
        secondaryRaw.length > 48 ? `${secondaryRaw.slice(0, 45)}…` : secondaryRaw;
      return { primary, secondary };
    }
    const resolved = resolveCheckoutDeliveryAddress(
      addresses,
      listingCoords,
      locationSource,
      activeLocation
    );
    const label = resolved?.label?.trim() || "Current location";
    const full = resolveDeliveryLocationLabel({
      locationSource,
      address,
      addresses,
      coords: listingCoords,
    });
    return { primary: label, secondary: full };
  }, [locationSource, address, addresses, activeLocation, listingCoords]);

  useEffect(() => {
    if (
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null
    ) {
      seedMerchantsListQueryIfCached(
        queryClient,
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        false,
        STORE_TYPE
      );
    }
  }, [
    queryClient,
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
  ]);

  useEffect(() => {
    if (gridFirstHeroMedia.length > 0) prefetchGridFirstHeroMedia(gridFirstHeroMedia);
  }, [gridFirstHeroMedia]);

  useEffect(() => {
    void prefetchUserAppCategories(queryClient, STORE_TYPE);
  }, [queryClient]);

  const cachedMerchantsInitial = useMemo(() => {
    if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords?.longitude == null) {
      return undefined;
    }
    const entry = readSyncMerchantsListEntry(
      merchantsAnchorCoords.latitude,
      merchantsAnchorCoords.longitude,
      false,
      STORE_TYPE
    );
    if (!entry || entry.items.length === 0) return undefined;
    return entry.items;
  }, [
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
  ]);

  const {
    data: merchantsData,
    isLoading,
    isFetching,
    isFetched,
    isError,
    refetch,
  } = useQuery({
    queryKey:
      merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null
        ? merchantsQueryKey(
            merchantsAnchorCoords.latitude,
            merchantsAnchorCoords.longitude,
            false,
            STORE_TYPE
          )
        : (["merchants", "pending", false, STORE_TYPE] as const),
    queryFn: async () => {
      if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords?.longitude == null) {
        return [];
      }
      return fetchAndCacheMerchantsList(
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        false,
        STORE_TYPE
      );
    },
    enabled:
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    initialData: cachedMerchantsInitial,
    initialDataUpdatedAt: cachedMerchantsInitial ? Date.now() - MERCHANTS_LIST_STALE_MS : undefined,
    staleTime: MERCHANTS_LIST_STALE_MS,
    gcTime: MERCHANTS_LIST_GC_MS,
  });

  useLayoutEffect(() => {
    const list = Array.isArray(merchantsData) ? merchantsData : [];
    for (const m of list) {
      const live = resolveMerchantLiveStatus(m, {});
      setStatusFromApi(m.id, live === "OPEN", live);
    }
    if (list.length > 0) {
      prefetchMerchantCardImages(list);
      prefetchMerchantBanners(list);
    }
  }, [merchantsData, setStatusFromApi]);

  const merchants = Array.isArray(merchantsData) ? merchantsData : [];

  const { data: groceryAppCategoriesResponse } = useQuery({
    queryKey: userAppCategoriesQueryKey(STORE_TYPE),
    queryFn: () => fetchUserAppCategoriesWithCache(STORE_TYPE),
    staleTime: 15_000,
    gcTime: USER_APP_CATEGORIES_QUERY_OPTIONS.gcTime,
    retry: 1,
    refetchOnMount: "always",
    initialData: () => readSyncUserAppCategories(STORE_TYPE),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(STORE_TYPE),
    placeholderData: (previousData) => previousData,
  });

  // Super Admin GROCERY user_app_category only — never merchant menu categories.
  const homeCategoryRailItems = useMemo(() => {
    const cms = dedupeUserAppCategories(groceryAppCategoriesResponse?.items ?? []);
    return cms.map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [groceryAppCategoriesResponse?.items]);

  const gridFirstCategoryTabLayout = useMemo(
    () =>
      computeGridFirstCategoryTabMetrics(
        windowWidth,
        Math.max(insets.left, insets.right)
      ),
    [windowWidth, insets.left, insets.right]
  );

  const filteredMerchants = useMemo(
    () =>
      filterAndSortMerchants(merchants, statusMap, {
        openNow,
        hideClosed: openNow,
        sortBy,
      }),
    [merchants, openNow, statusMap, sortBy]
  );

  const selectedGroceryCategoryLabel = useMemo(() => {
    if (gridFirstCategoryTabId === "all") return null;
    const row = homeCategoryRailItems.find((c) => c.id === gridFirstCategoryTabId);
    return row?.name?.trim() || null;
  }, [gridFirstCategoryTabId, homeCategoryRailItems]);

  const { data: categoryDishSearch } = useQuery({
    queryKey: [
      "grocery-home-category-stores",
      selectedGroceryCategoryLabel,
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      STORE_TYPE,
    ],
    queryFn: () =>
      merchantService.listStoresByDishCategory({
        q: selectedGroceryCategoryLabel!,
        limit: 50,
        maxDistanceKm: 15,
        storeType: STORE_TYPE,
        ...(merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null
          ? {
              lat: merchantsAnchorCoords.latitude,
              lng: merchantsAnchorCoords.longitude,
            }
          : {}),
      }),
    enabled:
      Boolean(selectedGroceryCategoryLabel) &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
  });

  const listMerchants = useMemo(() => {
    if (!selectedGroceryCategoryLabel) return filteredMerchants;

    const nearbyById = new Map(filteredMerchants.map((m) => [m.id, m]));
    const fromApi = categoryDishSearch?.stores ?? [];

    if (fromApi.length > 0) {
      return fromApi
        .filter((s) => {
          const st = (s.storeType ?? "").trim().toUpperCase();
          // Backend filters by store_type; keep a defensive client guard.
          return !st || st === "GROCERY";
        })
        .map((s) => {
          const existing = nearbyById.get(s.id);
          if (existing) {
            return {
              ...existing,
              distanceKm: existing.distanceKm ?? s.distanceKm ?? undefined,
              storeType: existing.storeType ?? s.storeType ?? "GROCERY",
            };
          }
          return {
            id: s.id,
            name: s.name || s.id,
            displayImage: s.bannerUrl ?? null,
            banner_url: s.bannerUrl ?? null,
            cuisines: s.cuisines ?? undefined,
            distanceKm: s.distanceKm ?? undefined,
            isOpen: true,
            storeType: s.storeType ?? "GROCERY",
          } as MerchantSummary;
        });
    }

    const needle = selectedGroceryCategoryLabel.toLowerCase();
    return filteredMerchants.filter((m) => {
      if (
        m.cuisines?.some(
          (c) => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase())
        )
      ) {
        return true;
      }
      return m.name.toLowerCase().includes(needle);
    });
  }, [filteredMerchants, selectedGroceryCategoryLabel, categoryDishSearch?.stores]);

  useLayoutEffect(() => {
    if (listMerchants.length > 0) {
      prefetchMerchantCardImages(listMerchants);
    }
  }, [listMerchants]);

  const hasDeliveryCoords =
    merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null;
  const merchantsDiscoverySettled = isFetched && !isFetching && !isError;
  const isNonServiceableScreen =
    hasDeliveryCoords && merchantsDiscoverySettled && merchants.length === 0;
  const showMerchantsSkeleton =
    hasDeliveryCoords &&
    merchants.length === 0 &&
    !isNonServiceableScreen &&
    (isLoading || isFetching || !isFetched);

  const openStoreCountLabel = useMemo(
    () => merchantListingStoreCountLabel(listMerchants, statusMap, openNow),
    [listMerchants, statusMap, openNow]
  );

  const storesSectionTitle = selectedGroceryCategoryLabel
    ? selectedGroceryCategoryLabel.toUpperCase()
    : "GROCERY STORES NEAR YOU";

  const handleBack = useCallback(() => foodHomeRouterBack(router), [router]);
  const handleSearch = useCallback(
    () => router.push({ pathname: "/search", params: { storeType: "GROCERY" } }),
    [router]
  );
  const handleLocationPress = useCallback(() => router.push("/location"), [router]);

  const handleGridFirstCategoryChange = useCallback((id: string) => {
    setGridFirstCategoryTabId(id);
    merchantListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleCategorySelect = useCallback(
    (id: string, _slug: string) => {
      handleGridFirstCategoryChange(id);
    },
    [handleGridFirstCategoryChange]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: userAppCategoriesQueryKey(STORE_TYPE) }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  const statusBarTopInset = resolveTopSafeInset(insets.top);
  const gridFirstSkyHeightDefault = useMemo(
    () =>
      gridFirstSkyHeightForAspect(statusBarTopInset, windowWidth, windowHeight),
    [statusBarTopInset, windowWidth, windowHeight]
  );
  const gridFirstCompactSkyHeight = statusBarTopInset + GRID_FIRST_HEADER_OVERLAY_H;
  const gridFirstHeroHasSlides = gridFirstHeroMedia.length > 0;
  const [gridFirstMeasuredSkyHeight, setGridFirstMeasuredSkyHeight] = useState(gridFirstCompactSkyHeight);
  const [gridFirstHeroReady, setGridFirstHeroReady] = useState(false);
  const gridFirstSkyMeasuredFromHeroRef = useRef(false);
  // Collapse hero band until first image/video is decoded — no empty white gap.
  const gridFirstSkyHeight =
    gridFirstHeroHasSlides && gridFirstHeroReady
      ? Math.max(
          gridFirstSkyHeightDefault,
          gridFirstMeasuredSkyHeight > gridFirstCompactSkyHeight + 1
            ? gridFirstMeasuredSkyHeight
            : gridFirstSkyHeightDefault
        )
      : gridFirstCompactSkyHeight;
  const gridFirstSkyAnimatedHeight = useSharedValue(gridFirstSkyHeight);
  const gridFirstSkyAnimatedStyle = useAnimatedStyle(() => ({
    height: gridFirstSkyAnimatedHeight.value,
  }));
  const prevSkyDefaultRef = useRef(gridFirstSkyHeightDefault);

  useEffect(() => {
    const prevDefault = prevSkyDefaultRef.current;
    prevSkyDefaultRef.current = gridFirstSkyHeightDefault;
    const delta = gridFirstSkyHeightDefault - prevDefault;
    if (Math.abs(delta) < 1) return;
    setGridFirstMeasuredSkyHeight((prev) => {
      if (!gridFirstSkyMeasuredFromHeroRef.current || !gridFirstHeroReady) {
        return gridFirstCompactSkyHeight;
      }
      return Math.max(gridFirstCompactSkyHeight, prev + delta);
    });
  }, [gridFirstSkyHeightDefault, gridFirstCompactSkyHeight, gridFirstHeroReady]);

  const onGridFirstHeroHeightChange = useCallback((h: number) => {
    if (!(h > 0)) return;
    gridFirstSkyMeasuredFromHeroRef.current = true;
    setGridFirstMeasuredSkyHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  const onGridFirstHeroReadyChange = useCallback((ready: boolean) => {
    setGridFirstHeroReady(ready);
  }, []);

  useEffect(() => {
    if (gridFirstHeroMedia.length === 0) {
      setGridFirstHeroReady(false);
      gridFirstSkyMeasuredFromHeroRef.current = false;
      setGridFirstMeasuredSkyHeight(gridFirstCompactSkyHeight);
      return;
    }
    if (!gridFirstHeroReady) {
      setGridFirstMeasuredSkyHeight(gridFirstCompactSkyHeight);
    }
  }, [
    gridFirstHeroMedia.length,
    gridFirstHeroMedia.map((m) => m.id).join("|"),
    gridFirstHeroReady,
    gridFirstCompactSkyHeight,
  ]);

  useEffect(() => {
    cancelAnimation(gridFirstSkyAnimatedHeight);
    gridFirstSkyAnimatedHeight.value = withTiming(gridFirstSkyHeight, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [gridFirstSkyHeight, gridFirstSkyAnimatedHeight]);

  const categoryCircle = gridFirstCategoryTabLayout.circle;
  const categoryRailFallbackH = Math.round(categoryCircle * 1.22) + 38;
  const [gridFirstCategoryLayout, setGridFirstCategoryLayout] = useState({
    y: 0,
    height: categoryRailFallbackH,
  });
  const [gridFirstFilterLayout, setGridFirstFilterLayout] = useState({
    y: 0,
    height: GRID_FIRST_FILTER_ROW_H,
  });
  const [gridFirstHeaderBlockH, setGridFirstHeaderBlockH] = useState(
    gridFirstDefaultHeaderBlockHeight
  );

  const gridFirstStickyMetrics = useMemo<GridFirstStickyMetrics>(() => {
    const base = defaultGridFirstStickyMetrics(statusBarTopInset, gridFirstSkyHeight, categoryCircle);
    return {
      ...base,
      goldStripHeight: 0,
      headerBlockHeight: gridFirstHeaderBlockH,
      categoryBlockY:
        gridFirstCategoryLayout.y > 0 ? gridFirstCategoryLayout.y : gridFirstSkyHeight,
      categoryBlockHeight: gridFirstCategoryLayout.height || categoryRailFallbackH,
      filterBlockY:
        gridFirstFilterLayout.y > 0
          ? gridFirstFilterLayout.y
          : (gridFirstCategoryLayout.y > 0 ? gridFirstCategoryLayout.y : gridFirstSkyHeight) +
            (gridFirstCategoryLayout.height || categoryRailFallbackH),
      filterBlockHeight: gridFirstFilterLayout.height || GRID_FIRST_FILTER_ROW_H,
    };
  }, [
    statusBarTopInset,
    gridFirstSkyHeight,
    gridFirstCategoryLayout,
    gridFirstFilterLayout,
    categoryCircle,
    categoryRailFallbackH,
    gridFirstHeaderBlockH,
  ]);

  const gridFirstSearchStickAt = useMemo(
    () => gridFirstSearchStickScrollY(gridFirstStickyMetrics),
    [gridFirstStickyMetrics]
  );
  const gridFirstCategoryStickAt = useMemo(
    () => gridFirstCategoryStickScrollY(gridFirstStickyMetrics),
    [gridFirstStickyMetrics]
  );
  const gridFirstFilterStickAt = useMemo(
    () => gridFirstFilterStickScrollY(gridFirstStickyMetrics),
    [gridFirstStickyMetrics]
  );

  const gridFirstScrollY = useSharedValue(0);
  const gridFirstSearchStickAtSv = useSharedValue(gridFirstSearchStickAt);
  const gridFirstCategoryStickAtSv = useSharedValue(gridFirstCategoryStickAt);
  const gridFirstFilterStickAtSv = useSharedValue(gridFirstFilterStickAt);

  useEffect(() => {
    gridFirstSearchStickAtSv.value = gridFirstSearchStickAt;
    gridFirstCategoryStickAtSv.value = gridFirstCategoryStickAt;
    gridFirstFilterStickAtSv.value = gridFirstFilterStickAt;
  }, [gridFirstSearchStickAt, gridFirstCategoryStickAt, gridFirstFilterStickAt]);

  // FlashList v2 calls onScroll with `.call()` — must be a plain JS function, not
  // useAnimatedScrollHandler / AnimatedFlashList (crashes with "_c.call is not a function").
  const onGridFirstScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      gridFirstScrollY.value = e.nativeEvent.contentOffset.y;
    },
    [gridFirstScrollY]
  );

  const showGridFirstShellRef = useRef(showGridFirstShell);
  showGridFirstShellRef.current = showGridFirstShell;

  const syncGridFirstStickyStatusBar = useCallback(
    (_searchSticky: boolean) => {
      if (!showGridFirstShellRef.current) return;
      setStatusBarBackground("transparent", "dark");
    },
    [setStatusBarBackground]
  );

  useAnimatedReaction(
    () => gridFirstScrollY.value >= gridFirstSearchStickAtSv.value - 10,
    (searchSticky, prev) => {
      if (searchSticky === prev) return;
      runOnJS(syncGridFirstStickyStatusBar)(searchSticky);
    },
    [syncGridFirstStickyStatusBar]
  );

  useLayoutEffect(() => {
    if (!showGridFirstShell || isNonServiceableScreen) return;
    setImmersiveStatusBarChrome(true);
    setStatusBarBackground("transparent", "dark");
  }, [showGridFirstShell, isNonServiceableScreen, setImmersiveStatusBarChrome, setStatusBarBackground]);

  useFocusEffect(
    useCallback(() => {
      if (!showGridFirstShell || isNonServiceableScreen) return;
      NativeStatusBar.setHidden(false, "none");
      setImmersiveStatusBarChrome(true);
      setStatusBarBackground("transparent", "dark");
      return () => {
        setImmersiveStatusBarChrome(false);
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [showGridFirstShell, isNonServiceableScreen, setImmersiveStatusBarChrome, setStatusBarBackground])
  );

  const handleGridFirstSortToggle = useCallback(() => {
    setSortBy((prev) => (prev === "distance" ? "default" : "distance"));
  }, []);

  const filterRowProps = useMemo(
    () => ({
      vertical: "grocery" as const,
      hasActiveFilters: openNow || sortBy !== "default",
      sortBy,
      openNow,
      noPackagingCharges: false,
      showMealsUnderPriceChip: false,
      mealsUnderPriceLabel: "",
      onOpenFilters: () => {},
      onToggleSort: handleGridFirstSortToggle,
      onToggleOpenNow: () => setOpenNow((v) => !v),
      onToggleNoPackagingCharges: () => {},
      onMealsUnderPricePress: () => {},
    }),
    [openNow, sortBy, handleGridFirstSortToggle]
  );

  const gridFirstFilterRowEl = useMemo(
    () => <FoodHomeFilterRow variant="grid_first" compact {...filterRowProps} />,
    [filterRowProps]
  );

  const gridFirstCategoryTabsEl = useMemo(() => {
    return (
      <FoodHomeCategoryTabs
        items={homeCategoryRailItems}
        onSelect={handleCategorySelect}
        activeId={gridFirstCategoryTabId}
        onActiveIdChange={handleGridFirstCategoryChange}
        allTabLabel={groceryAppCategoriesResponse?.allTab?.label ?? "All"}
        allTabImageUrl={groceryAppCategoriesResponse?.allTab?.imageUrl ?? null}
        showUnderPriceTab={false}
        underPriceLabel=""
        underPriceMaxPrice={0}
        underPriceImageUrl={null}
        onUnderPricePress={() => {}}
        layout={gridFirstCategoryTabLayout}
        imageShape="roundedRect"
      />
    );
  }, [
    homeCategoryRailItems,
    gridFirstCategoryTabLayout,
    gridFirstCategoryTabId,
    handleCategorySelect,
    handleGridFirstCategoryChange,
    groceryAppCategoriesResponse?.allTab?.label,
    groceryAppCategoriesResponse?.allTab?.imageUrl,
  ]);

  const gridFirstStickyCategoryTabsEl = useMemo(() => {
    return (
      <FoodHomeCategoryTabs
        items={homeCategoryRailItems}
        onSelect={handleCategorySelect}
        activeId={gridFirstCategoryTabId}
        onActiveIdChange={handleGridFirstCategoryChange}
        allTabLabel={groceryAppCategoriesResponse?.allTab?.label ?? "All"}
        allTabImageUrl={groceryAppCategoriesResponse?.allTab?.imageUrl ?? null}
        showUnderPriceTab={false}
        underPriceLabel=""
        underPriceMaxPrice={0}
        underPriceImageUrl={null}
        onUnderPricePress={() => {}}
        layout={gridFirstCategoryTabLayout}
        imageShape="roundedRect"
      />
    );
  }, [
    homeCategoryRailItems,
    gridFirstCategoryTabLayout,
    gridFirstCategoryTabId,
    handleCategorySelect,
    handleGridFirstCategoryChange,
    groceryAppCategoriesResponse?.allTab?.label,
    groceryAppCategoriesResponse?.allTab?.imageUrl,
  ]);

  const gridFirstCategoryFlowStyle = useAnimatedStyle(() => {
    const stickAt = gridFirstCategoryStickAtSv.value;
    if (stickAt <= 1) return { opacity: 1 };
    return {
      opacity: interpolate(
        gridFirstScrollY.value,
        [stickAt + 8, stickAt + 28],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const gridFirstFilterFlowStyle = useAnimatedStyle(() => {
    // Filter chips stay in the scroll flow — never pin or fade with sticky chrome.
    return { opacity: 1 };
  });

  const renderItem = useCallback<ListRenderItem<MerchantSummary>>(
    ({ item }) => <GMRestaurantCardV2 merchant={item} bottomSpacing={18} />,
    []
  );

  if (isNonServiceableScreen) {
    return (
      <View style={[styles.container, styles.nonServiceableContainer]}>
        <StatusBar style="dark" backgroundColor={NON_SERVICEABLE_STATUS_BAR_BG} />
        <GMEmptyState
          header={
            <GMHeader
              topInset={HEADER_TOP_PADDING_NONE}
              onBack={handleBack}
              showBack
              minimal
              blendBackground
              locationLabel={gridFirstLocationLabels.secondary}
              locationLabelLines={2}
            />
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" translucent backgroundColor="transparent" hidden={false} />

      <View style={styles.contentWrap}>
        <FlashList
          ref={merchantListRef}
          style={styles.scroll}
          data={showMerchantsSkeleton ? EMPTY_MERCHANTS : listMerchants}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          drawDistance={Math.max(2800, Math.round(windowHeight * 4))}
          removeClippedSubviews={false}
          overrideProps={{ initialDrawBatchSize: 24 }}
          contentInsetAdjustmentBehavior="never"
          overScrollMode="never"
          bounces={false}
          nestedScrollEnabled
          contentContainerStyle={{
            paddingBottom:
              Math.max(insets.bottom, 16) +
              8 +
              (floatingDockVisible ? FLOATING_CART_BAR_HEIGHT + FLOATING_CART_UI_LIFT : 0),
          }}
          showsVerticalScrollIndicator={false}
          delaysContentTouches={false}
          keyboardShouldPersistTaps="handled"
          onScroll={onGridFirstScroll}
          scrollEventThrottle={1}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={GatiMitraColors.primaryMint}
              colors={[GatiMitraColors.primaryMint]}
            />
          }
          ListHeaderComponent={
            <>
              <View style={styles.gridFirstSkyBlock}>
                <Animated.View
                  style={[
                    styles.gridFirstSkyInner,
                    gridFirstSkyAnimatedStyle,
                    { overflow: "hidden" },
                  ]}
                >
                  {gridFirstHeroHasSlides ? (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        height: gridFirstSkyHeightDefault,
                        opacity: gridFirstHeroReady ? 1 : 0,
                      },
                    ]}
                    pointerEvents={gridFirstHeroReady ? "auto" : "none"}
                  >
                    <FoodHomeHeroCarousel
                      heroMedia={gridFirstHeroMedia}
                      offers={[]}
                      embeddedInSky
                      immersive
                      topInset={statusBarTopInset}
                      placeholderColor={GatiMitraColors.softBackground}
                      onHeroHeightChange={onGridFirstHeroHeightChange}
                      onHeroReadyChange={onGridFirstHeroReadyChange}
                    />
                  </View>
                  ) : null}
                  <View
                    style={[
                      styles.gridFirstHeaderOverlay,
                      { paddingTop: statusBarTopInset + STATUS_BAR_TO_HEADER_GAP },
                    ]}
                    pointerEvents="box-none"
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (h > statusBarTopInset + STATUS_BAR_TO_HEADER_GAP) {
                        setGridFirstHeaderBlockH(
                          h - statusBarTopInset - STATUS_BAR_TO_HEADER_GAP
                        );
                      }
                    }}
                  >
                    <FoodHomeGridFirstHeader
                      topInset={0}
                      locationPrimary={gridFirstLocationLabels.primary}
                      locationSecondary={gridFirstLocationLabels.secondary}
                      onLocationPress={handleLocationPress}
                      onSearchPress={handleSearch}
                      vegOnly={false}
                      onVegChange={() => {}}
                      showVegToggle={false}
                      searchPlaceholders={GROCERY_SEARCH_PLACEHOLDERS}
                      stickyScrollY={gridFirstScrollY}
                      searchStickAt={gridFirstSearchStickAtSv}
                      fadeLocationOnSticky
                      heroReady={gridFirstHeroReady}
                    />
                  </View>
                </Animated.View>
              </View>

              <Animated.View
                style={[styles.categoryTabsSection, gridFirstCategoryFlowStyle]}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  if (height > 0) setGridFirstCategoryLayout({ y, height });
                }}
              >
                {gridFirstCategoryTabsEl}
              </Animated.View>

              <Animated.View
                style={[styles.section, styles.filterBar, gridFirstFilterFlowStyle]}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  if (height > 0) setGridFirstFilterLayout({ y, height });
                }}
              >
                {gridFirstFilterRowEl}
              </Animated.View>

              <View style={styles.section}>
                <AppText style={styles.sectionHeading}>{storesSectionTitle}</AppText>
                {!showMerchantsSkeleton ? (
                  <AppText style={styles.storeOpenCount}>{openStoreCountLabel}</AppText>
                ) : null}
              </View>
            </>
          }
          ListEmptyComponent={
            showMerchantsSkeleton ? (
              <RestaurantListSkeleton count={3} />
            ) : (
              <AppText style={styles.restaurantEmptyHint}>
                {selectedGroceryCategoryLabel
                  ? `No stores found for “${selectedGroceryCategoryLabel}”.`
                  : "No grocery stores match your filters."}
              </AppText>
            )
          }
          ListFooterComponent={<BrandingFooter compact />}
        />

        <FoodHomeGridFirstStickyChrome
          scrollY={gridFirstScrollY}
          metrics={gridFirstStickyMetrics}
          searchStickAt={gridFirstSearchStickAtSv}
          categoryStickAt={gridFirstCategoryStickAtSv}
          filterStickAt={gridFirstFilterStickAtSv}
          onSearchPress={handleSearch}
          onLocationPress={handleLocationPress}
          locationPrimary={gridFirstLocationLabels.primary}
          locationSecondary={gridFirstLocationLabels.secondary}
          vegOnly={false}
          onVegChange={() => {}}
          showVegToggle={false}
          searchPlaceholders={GROCERY_SEARCH_PLACEHOLDERS}
          categories={gridFirstStickyCategoryTabsEl}
          filters={undefined}
          enableCategorySticky
          enableFilterSticky={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  nonServiceableContainer: {
    backgroundColor: NON_SERVICEABLE_STATUS_BAR_BG,
  },
  contentWrap: {
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  scroll: {
    flex: 1,
  },
  gridFirstSkyBlock: {
    marginBottom: 0,
    overflow: "visible",
  },
  gridFirstSkyInner: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: GatiMitraColors.softBackground,
  },
  gridFirstSkyInnerCompact: {
    backgroundColor: GatiMitraColors.softBackground,
  },
  gridFirstHeaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "transparent",
  },
  categoryTabsSection: {
    paddingTop: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
    paddingBottom: 10,
    marginBottom: 0,
  },
  categoryRailLoading: {
    paddingHorizontal: PAGE_PAD,
    paddingVertical: 24,
    alignItems: "center",
  },
  categoryRailLoadingText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  section: {
    paddingHorizontal: PAGE_PAD,
    marginBottom: SECTION_GAP_SM,
  },
  filterBar: {
    marginBottom: SECTION_GAP_SM,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#374151",
    marginBottom: 4,
  },
  storeOpenCount: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    fontWeight: "500",
  },
  restaurantEmptyHint: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
    paddingHorizontal: PAGE_PAD,
  },
});
