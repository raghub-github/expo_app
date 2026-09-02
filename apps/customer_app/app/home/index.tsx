/**
 * Food Delivery – 2025 GatiMitra UI.
 * Full rebuild: GMHeader, GMSearchBar, GMCategoryRail, GMRestaurantCardV2, GMEmptyState.
 * Real data only. Spacing: 16px page, 18px cards, 24px section gap.
 */

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Modal,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  StatusBar as NativeStatusBar,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ListRenderItem } from "@shopify/flash-list";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { foodHomeRouterBack } from "@/lib/safeRouterBack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { MerchantSummary } from "@/services/merchant.service";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import {
  fetchAndCacheMerchantsList,
  MERCHANTS_LIST_GC_MS,
  MERCHANTS_LIST_STALE_MS,
  merchantsQueryKey,
  readSyncMerchantsListEntry,
  seedMerchantsListQueryIfCached,
} from "@/lib/merchantsListCache";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { navigateToMealsUnderPrice } from "@/lib/navigateToMealsUnderPrice";
import {
  markFoodHomeListScrollActive,
  markFoodHomeListScrollEnded,
  resetFoodHomeListScrollGuard,
} from "@/lib/foodHomeScrollGuard";
import { prefetchGridFirstHeroMedia, prefetchFeaturedOfferHeroImages } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import { debouncedInvalidateFoodHomeListingQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import {
  type UserAppCategoryItem,
} from "@/services/userAppCategory.service";
import { useLocationStore } from "@/store/locationStore";
import { useActiveLocationReconcileReady } from "@/hooks/useActiveLocationReconcileReady";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { useRecentlyViewedStores } from "@/hooks/useRecentlyViewedStores";
import { usePreventServicesAtPin } from "@/hooks/usePreventServicesAtPin";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { BrandingFooter } from "@/components/BrandingFooter";
import {
  CategoryRailSkeleton,
  GMSkeleton,
  LovedMerchantsGridSkeleton,
  RestaurantListSkeleton,
} from "@/components/ShimmerSkeleton";
import { FoodOffersRibbonCarousel } from "@/components/home/FoodOffersRibbonCarousel";
import {
  FoodHomeHeroCarousel,
  GRID_FIRST_HEADER_OVERLAY_H,
  gridFirstSkySectionHeight,
  hasGridFirstHeroSlides,
} from "@/components/home/FoodHomeHeroCarousel";
import { FoodHomeGoldStrip } from "@/components/home/FoodHomeGoldStrip";
import { FoodHomeGridFirstHeader } from "@/components/home/FoodHomeGridFirstHeader";
import { FoodHomeGridFirstStickyChrome } from "@/components/home/FoodHomeGridFirstStickyChrome";
import { FoodHomeFilterRow } from "@/components/home/FoodHomeFilterRow";
import {
  defaultGridFirstStickyMetrics,
  GRID_FIRST_FILTER_ROW_H,
  GRID_FIRST_GOLD_STRIP_H,
  GRID_FIRST_STICK_HANDOFF_PX,
  GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
  gridFirstCategoryBlockHeight,
  gridFirstCategoryStickScrollY,
  gridFirstDefaultHeaderBlockHeight,
  gridFirstFilterStickScrollY,
  gridFirstSearchStickScrollY,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";
import { FoodHomeCategoryTabs, computeGridFirstCategoryTabMetrics } from "@/components/home/FoodHomeCategoryTabs";
import { pickLovedByCustomersMerchants } from "@/lib/lovedByCustomers";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import {
  fetchUserAppCategoriesWithCache,
  getUserAppCategoriesCachedAt,
  prefetchUserAppCategoryImagesAwait,
  readSyncUserAppCategories,
  seedUserAppCategoriesQueryIfCached,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import { GMHeader } from "@/components/GMHeader";
import { HEADER_TOP_PADDING_NONE, STATUS_BAR_TO_HEADER_GAP, resolveTopSafeInset, FLOATING_CART_BAR_HEIGHT, FLOATING_CART_UI_LIFT } from "@/constants/layout";
import { GMSearchBar } from "@/components/GMSearchBar";
import { GMRestaurantCardV2, RESTAURANT_CARD_ESTIMATED_SIZE } from "@/components/GMRestaurantCardV2";
import { GMEmptyState } from "@/components/GMEmptyState";
import { NON_SERVICEABLE_STATUS_BAR_BG } from "@/store/screenChromeStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  filterAndSortMerchants,
  isMerchantCurrentlyOpen,
  isTopBrandMerchant,
  openRestaurantsDeliveringLabel,
  resolveMerchantLiveStatus,
} from "@/lib/merchantListing";
import { useFeaturedOffersHome } from "@/hooks/useFeaturedOffersHome";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useFoodHomeLayout } from "@/hooks/useFoodHomeLayout";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_UNDER_250,
  resolveDiscoveryDealsAtMaxPrice,
} from "@/lib/foodHomeLayout";
import { fetchFoodItemsUnderPriceGrouped } from "@/services/foodHomeItemsUnderPrice.service";
import { Image } from "expo-image";
import { filterPureVegMerchants, filterVegSafeCategories } from "@/lib/pureVegFilter";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { LovedMerchantsHorizontal } from "@/components/home/LovedMerchantsHorizontal";
import { AppText } from "@/components/AppText";
import {
  DiscoveryHomeHeader,
  DiscoveryPromoRail,
  DiscoveryCategoryGrid,
  DiscoveryExploreSection,
  DiscoveryRestaurantCard,
  DiscoveryBackForMoreSection,
  DiscoveryFloatingBar,
  DiscoveryColors,
  DISCOVERY_FLOAT_BAR_H,
} from "@/features/discovery-home";

const PAGE_PAD = 16;
const SECTION_GAP = 24;
const SECTION_GAP_SM = 10;
/** Vertical gap between the two tiles in each column. */
const RAIL_ROW_GAP = 10;
/** Target 5 category columns on screen (2 rows of pairs → 10 items visible before scroll). */
const CATEGORY_RAIL_TARGET_COLUMNS = 5;

const OFFERS_SECTION_PAD = 10;
const OFFER_CARD_HEIGHT = 72;
const OFFER_GAP = 12;

/** Match list body — status bar uses the same surface as the main scroll area. */
const GRID_FIRST_PAGE_BG = GatiMitraColors.softBackground;
type SortOption = "default" | "rating" | "distance";

type DeliveryFilter = "any" | "30" | "45" | "60";
const DELIVERY_OPTIONS: { id: DeliveryFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "30", label: "Under 30 min" },
  { id: "45", label: "Under 45 min" },
  { id: "60", label: "Under 60 min" },
];

const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Fast Food", "Bakery", "Desserts"];

const HOME_CATEGORY_STORE_TYPE = "FOOD";
const HOME_MERCHANTS_STORE_TYPE = "FOOD" as const;
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

function chunkIntoPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

type CategoryRailLayout = {
  itemW: number;
  columnGap: number;
  circle: number;
  imgSize: number;
};

/** Sizes the rail so N columns fit in the first viewport without clipping. */
function computeCategoryRailMetrics(windowWidth: number, horizontalSafeInset = 0): CategoryRailLayout {
  const pagePad = PAGE_PAD + Math.max(0, horizontalSafeInset);
  const n = CATEGORY_RAIL_TARGET_COLUMNS;
  const usable = Math.max(0, windowWidth - pagePad * 2);
  let columnGap = 37;
  let itemW = (usable - (n - 1) * columnGap) / n;
  if (itemW < 52) {
    columnGap = 7;
    itemW = (usable - (n - 1) * columnGap) / n;
  }
  if (itemW < 50) {
    columnGap = 5;
    itemW = (usable - (n - 1) * columnGap) / n;
  }
  itemW = Math.floor(Math.max(48, itemW));
  const circle = Math.min(52, Math.max(44, Math.round(itemW - 6)));
  const imgSize = circle;
  return { itemW, columnGap, circle, imgSize };
}

export default function FoodMerchantsScreen() {
  const insets = useAppSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { foodLocked } = usePreventServicesAtPin();
  const openMerchantPageGuarded = useCallback(
    (id: string, merchant?: MerchantSummary) => {
      if (foodLocked) return;
      navigateToMerchant(router, queryClient, id, merchant);
    },
    [foodLocked, queryClient, router]
  );

  const {
    address,
    coords,
    permissionStatus,
    locationSource,
    locationHydrated,
    refetchLocation,
    requestPermissionAndFetch,
  } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 250);
  /** User-picked pin updates instantly; GPS drift stays movement-gated. */
  const listingCoords = useMemo(() => {
    if (locationSource === "selected" && coords) return coords;
    // Prefer live GPS immediately on first fix; debounce only after we already have a pin.
    if (locationSource !== "selected" && coords && !debouncedCoords) return coords;
    return debouncedCoords ?? coords;
  }, [locationSource, coords, debouncedCoords]);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  /**
   * Canonical delivery drop for listing km: same saved address as checkout
   * when one is resolved; live GPS only when it is the active pin.
   */
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
  const { bookmarkSet, refetch: refetchBookmarks } = useStoreBookmarks();
  const { stores: recentlyViewedStores } = useRecentlyViewedStores();
  const {
    layoutKey: foodHomeLayoutKeyRaw,
    cachedLayoutKey,
    layoutReady,
    canQuery: layoutCanQuery,
    refetch: refetchFoodHomeLayout,
    gridFirstHeroMedia,
    gridFirstSubscriptionRowEnabled,
    gridFirstSubscriptionRowText,
    gridFirstSubscriptionRowBgColor,
    gridFirstUnder250Enabled,
    gridFirstUnder250FilterLabel,
    gridFirstUnder250TabImageUrl,
    gridFirstUnder250HeroImageUrl,
    gridFirstUnder250MaxPrice,
    discoveryDealsAtMaxPrice,
    discoveryDealsAtImageUrl,
    discoveryDealsAtHeroImageUrl,
    discoveryCrazyDealsImageUrl,
    discoveryFreePackagingImageUrl,
    discoveryCtaTiles,
  } = useFoodHomeLayout(address, merchantsAnchorCoords);

  const resolvedFoodHomeLayoutKey =
    foodHomeLayoutKeyRaw ?? cachedLayoutKey ?? DEFAULT_FOOD_HOME_LAYOUT;
  const isGridFirstLayout = resolvedFoodHomeLayoutKey === "grid_first";
  const isDiscoveryLayout = resolvedFoodHomeLayoutKey === "discovery";

  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const setVegOnly = useDietaryPreferenceStore((s) => s.setVegOnly);
  const hydrateDietaryPreferences = useDietaryPreferenceStore((s) => s.hydrate);
  const floatingDockVisible = useFloatingDockUiStore((s) => s.dockVisible);
  // Until the persisted veg-only preference has hydrated, `vegOnly` is the
  // provisional default (false). Fetching/seeding the merchant list against that
  // provisional value paints non-veg stores that a veg-only user will then see
  // yanked one tick later (the "store shows for 1s then vanishes" report). Gate
  // every store read on this so the first fetch already uses the real preference.
  const dietaryHydrated = useDietaryPreferenceStore((s) => s.hydrated);

  useLayoutEffect(() => {
    seedUserAppCategoriesQueryIfCached(queryClient, HOME_CATEGORY_STORE_TYPE);
    const cachedCategories = readSyncUserAppCategories(HOME_CATEGORY_STORE_TYPE);
    if (cachedCategories) {
      prefetchUserAppCategoryImagesAwait(cachedCategories.items ?? [], cachedCategories.allTab?.imageUrl);
    }
    if (
      dietaryHydrated &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null
    ) {
      seedMerchantsListQueryIfCached(
        queryClient,
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        vegOnly,
        HOME_MERCHANTS_STORE_TYPE
      );
    }
  }, [
    queryClient,
    dietaryHydrated,
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
    vegOnly,
  ]);

  const [openNow, setOpenNow] = useState(true);
  const [topBrands, setTopBrands] = useState(false);
  const [nearFast, setNearFast] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [gridFirstCategoryTabId, setGridFirstCategoryTabId] = useState("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("any");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [filterHasOffers, setFilterHasOffers] = useState(false);
  const [noPackagingCharges, setNoPackagingCharges] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cachedMerchantsInitial = useMemo(() => {
    // Don't seed initial data from the provisional (pre-hydration) veg preference —
    // that is exactly what paints a store the veg-only refetch then removes.
    if (!dietaryHydrated) return undefined;
    if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords?.longitude == null) {
      return undefined;
    }
    const entry = readSyncMerchantsListEntry(
      merchantsAnchorCoords.latitude,
      merchantsAnchorCoords.longitude,
      vegOnly,
      HOME_MERCHANTS_STORE_TYPE
    );
    // Only hydrate non-empty cache — empty buckets must wait for a live network confirm.
    return entry?.items?.length ? entry.items : undefined;
  }, [dietaryHydrated, merchantsAnchorCoords?.latitude, merchantsAnchorCoords?.longitude, vegOnly]);

  const {
    data: merchantsData,
    isLoading,
    isFetching,
    isFetched,
    isError,
    refetch,
    dataUpdatedAt: merchantsDataUpdatedAt,
  } = useQuery({
    queryKey:
      merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null
        ? merchantsQueryKey(
            merchantsAnchorCoords.latitude,
            merchantsAnchorCoords.longitude,
            vegOnly,
            HOME_MERCHANTS_STORE_TYPE
          )
        : (["merchants", "pending", vegOnly, HOME_MERCHANTS_STORE_TYPE] as const),
    queryFn: async () => {
      if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords?.longitude == null) {
        return [];
      }
      return fetchAndCacheMerchantsList(
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        vegOnly,
        HOME_MERCHANTS_STORE_TYPE
      );
    },
    // Industry-standard: only fetch restaurants once we have an active location (GPS or user-selected)
    // AND the persisted veg-only preference has hydrated, so the first fetch already uses the real
    // filter and never paints a non-veg store that a veg-only refetch would immediately remove.
    enabled:
      dietaryHydrated &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    initialData: cachedMerchantsInitial,
    initialDataUpdatedAt: cachedMerchantsInitial ? Date.now() - MERCHANTS_LIST_STALE_MS : undefined,
    staleTime: MERCHANTS_LIST_STALE_MS,
    gcTime: MERCHANTS_LIST_GC_MS,
    placeholderData: (previousData, previousQuery) => {
      const prevVeg = previousQuery?.queryKey?.[2];
      if (prevVeg !== vegOnly) return undefined;
      return previousData;
    },
    refetchOnWindowFocus: false,
    retry: 2,
  });

  useEffect(() => {
    if (merchantsData?.length) {
      prefetchMerchantCardImages(merchantsData);
    }
  }, [merchantsData]);
  const offerLocationParams = useMemo(() => {
    const pincode = address?.pincode?.trim() || undefined;
    const state = address?.state?.trim() || undefined;
    const city = address?.city?.trim() || undefined;
    return {
      pincode,
      state,
      city,
      lat: merchantsAnchorCoords?.latitude,
      lng: merchantsAnchorCoords?.longitude,
    };
  }, [
    address?.pincode,
    address?.state,
    address?.city,
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
  ]);

  const {
    data: featuredOffersData,
    refetch: refetchFeaturedOffers,
    dataUpdatedAt: featuredOffersDataUpdatedAt,
  } = useFeaturedOffersHome(
    offerLocationParams,
    Boolean(
      offerLocationParams.pincode ||
        offerLocationParams.state ||
        (merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null)
    )
  );

  const homeFeaturedOffers = featuredOffersData?.offers ?? [];

  useLayoutEffect(() => {
    if (gridFirstHeroMedia.length > 0) prefetchGridFirstHeroMedia(gridFirstHeroMedia);
    if (homeFeaturedOffers.length > 0) prefetchFeaturedOfferHeroImages(homeFeaturedOffers);
    prefetchMealsUnder250HeroMedia({
      gridFirstUnder250TabImageUrl,
      gridFirstUnder250HeroImageUrl,
      discoveryDealsAtHeroImageUrl,
      discoveryDealsAtImageUrl,
      discoveryCrazyDealsImageUrl,
      discoveryFreePackagingImageUrl,
      discoveryCtaTiles,
    });
  }, [
    gridFirstHeroMedia,
    homeFeaturedOffers,
    gridFirstUnder250TabImageUrl,
    gridFirstUnder250HeroImageUrl,
    discoveryDealsAtHeroImageUrl,
    discoveryDealsAtImageUrl,
    discoveryCrazyDealsImageUrl,
    discoveryFreePackagingImageUrl,
    discoveryCtaTiles,
  ]);

  useEffect(() => {
    void hydrateDietaryPreferences();
  }, [hydrateDietaryPreferences]);

  const {
    data: homeCategoriesResponse,
    isPending: homeCategoriesPending,
    refetch: refetchHomeCategories,
  } = useQuery({
    queryKey: userAppCategoriesQueryKey(HOME_CATEGORY_STORE_TYPE),
    queryFn: () => fetchUserAppCategoriesWithCache(HOME_CATEGORY_STORE_TYPE),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    initialData: () => readSyncUserAppCategories(HOME_CATEGORY_STORE_TYPE),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(HOME_CATEGORY_STORE_TYPE),
    placeholderData: (previousData) => previousData,
  });

  const apiHomeCategories = homeCategoriesResponse?.items ?? [];
  const categoryAllTab = homeCategoriesResponse?.allTab ?? { label: "All", imageUrl: null };

  useLayoutEffect(() => {
    if (apiHomeCategories.length > 0 || categoryAllTab.imageUrl) {
      void prefetchUserAppCategoryImagesAwait(apiHomeCategories, categoryAllTab.imageUrl);
    }
  }, [apiHomeCategories, categoryAllTab.imageUrl]);

  const homeCategoryRailItems = useMemo(() => {
    const deduped = filterVegSafeCategories(dedupeUserAppCategories(apiHomeCategories ?? []), vegOnly);
    return deduped.map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [apiHomeCategories, vegOnly]);

  /** Reserve category rail height while first fetch runs — never flash empty → rail. */
  const categoryRailBootstrapping =
    homeCategoriesPending && homeCategoryRailItems.length === 0;

  const homeCategoryRailColumns = useMemo(
    () => chunkIntoPairs(homeCategoryRailItems),
    [homeCategoryRailItems]
  );

  const categoryRailLayout = useMemo(
    () => computeCategoryRailMetrics(windowWidth, Math.max(insets.left, insets.right)),
    [windowWidth, insets.left, insets.right]
  );

  const gridFirstCategoryTabLayout = useMemo(
    () =>
      computeGridFirstCategoryTabMetrics(
        windowWidth,
        Math.max(insets.left, insets.right)
      ),
    [windowWidth, insets.left, insets.right]
  );

  /** Offer carousel — same UI as home tab; merchant banner image or default art. */
  const offerCardWidth = windowWidth - PAGE_PAD * 2;
  const restaurantCardWidth = offerCardWidth;

  const merchants = filterPureVegMerchants(
    Array.isArray(merchantsData) ? merchantsData : [],
    vegOnly
  );
  const hasDeliveryCoords =
    merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null;
  /** True when at least one ACTIVE store exists in the area (open or closed). Not tied to Open Now filter. */
  const hasStoresInArea = merchants.length > 0;
  /**
   * Only show "not serving" after a successful empty network response.
   * Never while fetching, on error, or from a stale empty disk cache.
   */
  const merchantsDiscoverySettled = isFetched && !isFetching && !isError;
  const isNonServiceableScreen =
    hasDeliveryCoords && merchantsDiscoverySettled && !hasStoresInArea && !vegOnly;
  /** Keep skeleton up until stores arrive or empty is confirmed — no false empty flash. */
  const showMerchantsSkeleton =
    hasDeliveryCoords && merchants.length === 0 && !isNonServiceableScreen && (isLoading || isFetching || !isFetched);
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const statusMap = useStoreStatusStore((s) => s.statusMap);

  // Wait for cold-start reconcile before any GPS fill — otherwise a later
  // requestPermissionAndFetch can overwrite a restored Saved Address.
  const reconcileReady = useActiveLocationReconcileReady();
  useEffect(() => {
    if (!locationHydrated) return;
    if (!reconcileReady) return;
    if (locationSource === "selected") return;
    if (locationSource === "current" && coords) return;
    if (permissionStatus === "granted") {
      if (coords) void refetchLocation();
      else void requestPermissionAndFetch();
    } else if (permissionStatus === "undetermined") {
      void requestPermissionAndFetch();
    }
  }, [
    locationHydrated,
    reconcileReady,
    locationSource,
    coords,
    permissionStatus,
    refetchLocation,
    requestPermissionAndFetch,
  ]);

  useEffect(() => {
    if (!__DEV__ || !coords) return;
    const location = {
      address: address?.fullAddress,
      lat: coords.latitude,
      lng: coords.longitude,
      source: locationSource ?? "unset",
    };
    console.log("Using location:", location.source);
  }, [address?.fullAddress, coords, locationSource]);

  useLayoutEffect(() => {
    merchants.forEach((m) => {
      const liveStatus = resolveMerchantLiveStatus(m, {});
      setStatusFromApi(m.id, liveStatus === "OPEN", liveStatus);
    });
  }, [merchants, setStatusFromApi]);

  useEffect(() => {
    if (merchants.length > 0) prefetchMerchantBanners(merchants);
  }, [merchants]);

  const filteredAndSortedMerchants = useMemo(
    () =>
      filterAndSortMerchants(merchants, statusMap, {
        openNow,
        sortBy,
        filterHasOffers,
        deliveryFilter,
        selectedCuisines,
        noPackagingCharges,
        nearFast,
        hideClosed: false,
      }),
    [
      merchants,
      statusMap,
      openNow,
      sortBy,
      deliveryFilter,
      selectedCuisines,
      filterHasOffers,
      noPackagingCharges,
      nearFast,
    ]
  );

  const topBrandMerchants = useMemo(() => {
    if (!topBrands) return filteredAndSortedMerchants;
    return filteredAndSortedMerchants.filter(isTopBrandMerchant);
  }, [filteredAndSortedMerchants, topBrands]);

  const listMerchants = isDiscoveryLayout ? topBrandMerchants : filteredAndSortedMerchants;

  const lovedByCustomers = useMemo(
    () =>
      // A CLOSED store must never occupy a "Recommended with Deals" / "Loved by
      // Customers" recommendation slot. Gate with the realtime-aware live status
      // (statusMap from the store-status subscription, API status as fallback) so a
      // store that closes mid-session drops out instantly — no refetch, no stale slot.
      // Closed stores still appear in "Restaurants Near You" (the full list) with their
      // "Closed · Opens…" label.
      pickLovedByCustomersMerchants(filteredAndSortedMerchants).filter((m) =>
        isMerchantCurrentlyOpen(m, statusMap)
      ),
    [filteredAndSortedMerchants, statusMap]
  );

  const openRestaurantCountLabel = useMemo(
    () => openRestaurantsDeliveringLabel(merchants, statusMap),
    [merchants, statusMap]
  );

  const navigation = useNavigation();
  const handleBack = () => foodHomeRouterBack(router);
  const handleSearch = () => router.push("/search");
  const handleLocationPress = () => router.push("/location");
  const handleCategorySelect = useCallback((id: string, slug: string) => {
    setActiveCategoryId(id);
    setGridFirstCategoryTabId(id);
    router.push({ pathname: "/home/category/[slug]", params: { slug, storeType: "FOOD" } });
  }, [router]);
  const handleMealsUnderPricePress = useCallback(
    (tile?: { id?: string; maxPrice?: number | null; heroImageUrl?: string | null; label?: string | null }) => {
      navigateToMealsUnderPrice(router, queryClient, {
        tileId: tile?.id,
        maxPrice: tile?.maxPrice,
        heroImageUrl: tile?.heroImageUrl,
        title: tile?.label,
      });
    },
    [router, queryClient]
  );
  const handleCrazyDealsPress = useCallback(() => {
    router.push("/home/crazy-deals");
  }, [router]);
  const handleFreePackagingPress = useCallback(() => {
    router.push("/home/free-packaging");
  }, [router]);
  const discoveryDealsAtPrice = resolveDiscoveryDealsAtMaxPrice(
    discoveryDealsAtMaxPrice,
    gridFirstUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice
  );
  const showMealsUnderPriceChip =
    layoutReady &&
    (foodHomeLayoutKeyRaw ?? "classic") === "grid_first" &&
    gridFirstUnder250Enabled &&
    gridFirstUnder250FilterLabel.trim().length > 0;

  useEffect(() => {
    if (!showMealsUnderPriceChip) return;
    if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords.longitude == null) return;
    const maxPrice = gridFirstUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
    void queryClient.prefetchQuery({
      queryKey: [
        "meals-under-price-grouped",
        merchantsAnchorCoords.latitude,
        merchantsAnchorCoords.longitude,
        maxPrice,
        vegOnly,
      ],
      queryFn: () =>
        fetchFoodItemsUnderPriceGrouped({
          lat: merchantsAnchorCoords.latitude,
          lng: merchantsAnchorCoords.longitude,
          maxPrice,
          vegOnly,
          maxStores: 15,
          itemsPerStore: 8,
        }),
      staleTime: 60_000,
    });
    for (const raw of [
      gridFirstUnder250TabImageUrl,
      gridFirstUnder250HeroImageUrl,
      discoveryDealsAtHeroImageUrl,
    ]) {
      if (!raw?.trim()) continue;
      const uri = toAbsoluteImageUrl(raw) ?? raw;
      void Image.prefetch(uri, { cachePolicy: "memory-disk" });
    }
  }, [
    showMealsUnderPriceChip,
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
    gridFirstUnder250MaxPrice,
    gridFirstUnder250TabImageUrl,
    gridFirstUnder250HeroImageUrl,
    discoveryDealsAtHeroImageUrl,
    vegOnly,
    queryClient,
  ]);

  const gridFirstCategoryTabsEl = useMemo(() => {
    if (categoryRailBootstrapping) {
      return (
        <CategoryRailSkeleton
          columnCount={4}
          itemW={categoryRailLayout.itemW}
          columnGap={categoryRailLayout.columnGap}
          circle={categoryRailLayout.circle}
          rowGap={RAIL_ROW_GAP}
        />
      );
    }
    if (homeCategoryRailItems.length === 0) {
      return (
        <View style={styles.categoryRailLoading}>
          <AppText style={styles.categoryRailLoadingText}>No categories yet.</AppText>
        </View>
      );
    }
    return (
      <FoodHomeCategoryTabs
        items={homeCategoryRailItems}
        onSelect={handleCategorySelect}
        activeId={gridFirstCategoryTabId}
        onActiveIdChange={setGridFirstCategoryTabId}
        allTabLabel={categoryAllTab.label}
        allTabImageUrl={categoryAllTab.imageUrl}
        showUnderPriceTab={showMealsUnderPriceChip}
        underPriceLabel={gridFirstUnder250FilterLabel}
        underPriceMaxPrice={gridFirstUnder250MaxPrice}
        underPriceImageUrl={gridFirstUnder250TabImageUrl}
        onUnderPricePress={handleMealsUnderPricePress}
        layout={gridFirstCategoryTabLayout}
      />
    );
  }, [
    categoryRailBootstrapping,
    homeCategoryRailItems,
    gridFirstCategoryTabLayout,
    gridFirstCategoryTabId,
    handleCategorySelect,
    handleMealsUnderPricePress,
    showMealsUnderPriceChip,
    gridFirstUnder250FilterLabel,
    gridFirstUnder250TabImageUrl,
    gridFirstUnder250MaxPrice,
    categoryAllTab.label,
    categoryAllTab.imageUrl,
  ]);

  const classicCategoryRailEl = useMemo(() => {
    if (categoryRailBootstrapping) {
      return (
        <CategoryRailSkeleton
          columnCount={CATEGORY_RAIL_TARGET_COLUMNS}
          itemW={categoryRailLayout.itemW}
          columnGap={categoryRailLayout.columnGap}
          circle={categoryRailLayout.circle}
          rowGap={RAIL_ROW_GAP}
        />
      );
    }
    if (homeCategoryRailItems.length === 0) {
      return (
        <View style={styles.categoryRailLoading}>
          <AppText style={styles.categoryRailLoadingText}>No categories yet.</AppText>
        </View>
      );
    }
    return (
      <ScrollView
        horizontal
        nestedScrollEnabled
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.categoryRailScrollContent,
          {
            gap: categoryRailLayout.columnGap,
            paddingHorizontal: PAGE_PAD + Math.max(insets.left, insets.right),
          },
        ]}
      >
        {homeCategoryRailColumns.map((pair) => (
          <View
            key={`${pair[0]?.id ?? "x"}-${pair[1]?.id ?? ""}`}
            style={styles.categoryRailColumn}
          >
            {pair.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryRailItem, { width: categoryRailLayout.itemW }]}
                onPress={() => handleCategorySelect(cat.id, cat.slug)}
                activeOpacity={0.96}
              >
                <View
                  style={[
                    styles.categoryRailCircle,
                    {
                      width: categoryRailLayout.circle,
                      height: categoryRailLayout.circle,
                      borderRadius: categoryRailLayout.circle / 2,
                    },
                  ]}
                >
                  <UserAppCategoryImage
                    imageUrl={cat.imageUrl}
                    cacheKey={`category-${cat.id}`}
                    style={{ width: categoryRailLayout.imgSize, height: categoryRailLayout.imgSize }}
                  />
                </View>
                <AppText
                  style={[styles.categoryRailLabel, { width: categoryRailLayout.itemW }]}
                  numberOfLines={2}
                >
                  {cat.name}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <View style={styles.categoryRailScrollTrail} />
      </ScrollView>
    );
  }, [
    categoryRailBootstrapping,
    homeCategoryRailItems.length,
    homeCategoryRailColumns,
    categoryRailLayout,
    insets.right,
    handleCategorySelect,
  ]);
  const toggleCuisine = (c: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };
  const clearFilters = useCallback(() => {
    setDeliveryFilter("any");
    setSelectedCuisines([]);
    setFilterHasOffers(false);
    setNoPackagingCharges(false);
  }, []);
  const applyFilters = useCallback(() => setFilterSheetVisible(false), []);
  const hasActiveFilters =
    deliveryFilter !== "any" ||
    selectedCuisines.length > 0 ||
    filterHasOffers ||
    noPackagingCharges;
  const isVegEmptyState = vegOnly && !showMerchantsSkeleton && listMerchants.length === 0;
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (deliveryFilter !== "any") n += 1;
    n += selectedCuisines.length;
    if (filterHasOffers) n += 1;
    if (noPackagingCharges) n += 1;
    return n;
  }, [deliveryFilter, selectedCuisines, filterHasOffers, noPackagingCharges]);

  const handleGridFirstSortToggle = useCallback(() => {
    setSortBy((s) => (s === "distance" ? "default" : "distance"));
  }, []);

  const handleGridFirstHighlyRatedToggle = useCallback(() => {
    setSortBy((s) => {
      const next = s === "rating" ? "default" : "rating";
      if (next === "rating") setNearFast(false);
      return next;
    });
  }, []);

  const handleClassicSortToggle = useCallback(() => {
    setSortBy((s) => {
      const next = s === "default" ? "rating" : s === "rating" ? "distance" : "default";
      if (next !== "distance") setNearFast(false);
      return next;
    });
  }, []);
  const handleNearFastToggle = useCallback(() => {
    setNearFast((v) => {
      const next = !v;
      setSortBy(next ? "distance" : "default");
      return next;
    });
  }, []);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchFoodHomeLayout(),
        refetchBookmarks(),
        refetchHomeCategories(),
        refetchFeaturedOffers(),
        permissionStatus === "granted" && locationSource !== "selected" ? refetchLocation() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const selectedLocationLabel = useMemo(
    () =>
      resolveDeliveryLocationLabel({
        locationSource,
        address,
        addresses,
        coords: listingCoords,
      }),
    [
      locationSource,
      listingCoords?.latitude,
      listingCoords?.longitude,
      addresses,
      address?.fullAddress,
      address?.secondary,
      address?.primary,
      address?.city,
      address?.state,
      address?.pincode,
    ]
  );

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
      listingCoords ?? null,
      locationSource,
      locationSource === "selected" ? activeLocation : null
    );
    const primary = resolved?.label?.trim() || address?.primary?.trim() || "Home";
    const secondaryRaw =
      resolved?.fullAddress?.trim() ||
      address?.secondary?.trim() ||
      address?.fullAddress?.trim() ||
      "Add delivery address";
    const secondary =
      secondaryRaw.length > 48 ? `${secondaryRaw.slice(0, 45)}…` : secondaryRaw;
    return { primary, secondary };
  }, [addresses, listingCoords, locationSource, activeLocation, address]);

  const locationSyncKeyRef = useRef("");
  const locationSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (listingCoords?.latitude == null || listingCoords.longitude == null) return;
    const syncKey = [
      locationSource ?? "unset",
      listingCoords.latitude.toFixed(4),
      listingCoords.longitude.toFixed(4),
      address?.pincode ?? "",
      address?.state ?? "",
    ].join("|");
    if (locationSyncKeyRef.current === syncKey) return;
    locationSyncKeyRef.current = syncKey;
    if (locationSyncDebounceRef.current) clearTimeout(locationSyncDebounceRef.current);
    locationSyncDebounceRef.current = setTimeout(() => {
      locationSyncDebounceRef.current = null;
      debouncedInvalidateFoodHomeListingQueries(queryClient);
    }, 800);
    return () => {
      if (locationSyncDebounceRef.current) {
        clearTimeout(locationSyncDebounceRef.current);
        locationSyncDebounceRef.current = null;
      }
    };
  }, [
    listingCoords?.latitude,
    listingCoords?.longitude,
    locationSource,
    address?.pincode,
    address?.state,
    queryClient,
  ]);

  const foodHomeLayoutKey = resolvedFoodHomeLayoutKey;
  const showGridFirstSubscriptionRow =
    gridFirstSubscriptionRowEnabled && gridFirstSubscriptionRowText.trim().length > 0;
  const useGridFirstCategoryTabs = isGridFirstLayout;

  const filterRowProps = useMemo(
    () => ({
      hasActiveFilters,
      sortBy,
      openNow,
      nearFast,
      filterHasOffers,
      topBrands,
      noPackagingCharges,
      showMealsUnderPriceChip: showMealsUnderPriceChip,
      mealsUnderPriceLabel: gridFirstUnder250FilterLabel,
      onOpenFilters: () => setFilterSheetVisible(true),
      onToggleSort: isGridFirstLayout ? handleGridFirstSortToggle : handleClassicSortToggle,
      onToggleOpenNow: () => setOpenNow((v) => !v),
      onToggleNearFast: handleNearFastToggle,
      onToggleOffers: () => setFilterHasOffers((v) => !v),
      onToggleTopBrands: () => setTopBrands((v) => !v),
      onToggleHighlyRated: isGridFirstLayout ? handleGridFirstHighlyRatedToggle : undefined,
      onToggleNoPackagingCharges: () => setNoPackagingCharges((v) => !v),
      onMealsUnderPricePress: handleMealsUnderPricePress,
    }),
    [
      hasActiveFilters,
      sortBy,
      openNow,
      nearFast,
      filterHasOffers,
      topBrands,
      noPackagingCharges,
      showMealsUnderPriceChip,
      gridFirstUnder250FilterLabel,
      handleMealsUnderPricePress,
      isGridFirstLayout,
      handleGridFirstSortToggle,
      handleClassicSortToggle,
      handleNearFastToggle,
      handleGridFirstHighlyRatedToggle,
    ]
  );

  const gridFirstFilterRowEl = useMemo(
    () => <FoodHomeFilterRow variant="grid_first" compact {...filterRowProps} />,
    [filterRowProps]
  );

  const gridFirstStickyFilterRowEl = useMemo(
    () => <FoodHomeFilterRow variant="grid_first" compact {...filterRowProps} />,
    [filterRowProps]
  );

  const classicFilterRowEl = useMemo(
    () => <FoodHomeFilterRow variant="classic" {...filterRowProps} />,
    [filterRowProps]
  );
  const classicCategoryRailMinHeight =
    categoryRailLayout.circle * 2 + RAIL_ROW_GAP + 38;
  const setImmersiveStatusBarChrome = useScreenChromeStore((s) => s.setImmersiveStatusBarChrome);
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const isGridFirstLayoutRef = useRef(isGridFirstLayout);
  isGridFirstLayoutRef.current = isGridFirstLayout;

  const gridFirstHeroReadyRef = useRef(false);
  const gridFirstHeroHasSlidesRef = useRef(false);

  const applyGridFirstStatusBarChrome = useCallback(
    (searchSticky: boolean) => {
      if (!isGridFirstLayoutRef.current) return;
      const heroImmersive =
        gridFirstHeroHasSlidesRef.current &&
        gridFirstHeroReadyRef.current &&
        !searchSticky;
      if (heroImmersive) {
        setStatusBarBackground("transparent", "dark");
        if (Platform.OS === "android") {
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor("transparent", true);
          NativeStatusBar.setBarStyle("dark-content", true);
        }
      } else {
        setStatusBarBackground(GRID_FIRST_PAGE_BG, "dark");
        if (Platform.OS === "android") {
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor(GRID_FIRST_PAGE_BG, true);
          NativeStatusBar.setBarStyle("dark-content", true);
        }
      }
    },
    [setStatusBarBackground]
  );

  const syncGridFirstStickyStatusBar = useCallback(
    (searchSticky: boolean) => {
      applyGridFirstStatusBarChrome(searchSticky);
    },
    [applyGridFirstStatusBarChrome]
  );
  const statusBarTopInset = resolveTopSafeInset(insets.top);
  const isScreenFocused = useIsFocused();
  const [listScrolling, setListScrolling] = useState(false);
  const gridFirstSkyHeightRef = useRef(0);

  useLayoutEffect(() => {
    if (!isGridFirstLayout || isNonServiceableScreen) return;
    setImmersiveStatusBarChrome(true);
    applyGridFirstStatusBarChrome(false);
  }, [
    isGridFirstLayout,
    isNonServiceableScreen,
    setImmersiveStatusBarChrome,
    applyGridFirstStatusBarChrome,
  ]);

  useLayoutEffect(() => {
    if (!isDiscoveryLayout || isNonServiceableScreen) return;
    // Pad the discovery header ourselves. Never toggle the root spacer on this
    // screen — that race is what slides CTA/categories under the search bar.
    useScreenChromeStore.setState({
      statusBarBackground: DiscoveryColors.bg,
      statusBarStyle: "light",
      hideStatusBarSpacer: true,
    });
  }, [isDiscoveryLayout, isNonServiceableScreen]);

  const lastActiveLocationInvalidateRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      // Gate on each query's own staleTime instead of force-refetching on every
      // focus — React Query doesn't auto-refetch-on-focus in RN (tabs stay
      // mounted, they don't unmount/remount), so this focus effect is the
      // right place for that, but re-fetching unconditionally meant rapid
      // tab-switching (Home → Orders → Home) fired a full merchants-list +
      // offers + location refetch every single time, even when data was
      // seconds old.
      if (Date.now() - lastActiveLocationInvalidateRef.current > 60_000) {
        lastActiveLocationInvalidateRef.current = Date.now();
        void queryClient.invalidateQueries({ queryKey: ["active-location"] });
      }
      if (merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords.longitude != null) {
        if (Date.now() - merchantsDataUpdatedAt > MERCHANTS_LIST_STALE_MS) {
          void refetch();
        }
        if (Date.now() - featuredOffersDataUpdatedAt > 5 * 60 * 1000) {
          void refetchFeaturedOffers();
        }
      }
    }, [
      queryClient,
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      merchantsDataUpdatedAt,
      featuredOffersDataUpdatedAt,
      refetch,
      refetchFeaturedOffers,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isGridFirstLayout) return;
      NativeStatusBar.setHidden(false, "none");
      if (isNonServiceableScreen) {
        setImmersiveStatusBarChrome(false);
        setStatusBarBackground(NON_SERVICEABLE_STATUS_BAR_BG, "dark");
        return;
      }
      setImmersiveStatusBarChrome(true);
      applyGridFirstStatusBarChrome(false);
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [
      isGridFirstLayout,
      isNonServiceableScreen,
      setImmersiveStatusBarChrome,
      setStatusBarBackground,
      applyGridFirstStatusBarChrome,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isDiscoveryLayout) return;
      NativeStatusBar.setHidden(false, "none");
      NativeStatusBar.setBarStyle("light-content", true);
      useScreenChromeStore.setState({
        statusBarBackground: DiscoveryColors.bg,
        statusBarStyle: "light",
        hideStatusBarSpacer: true,
      });
      navigation.setOptions({
        statusBarStyle: "light",
        statusBarBackgroundColor: DiscoveryColors.bg,
      });
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor(DiscoveryColors.bg, true);
      }
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
        navigation.setOptions({ statusBarStyle: "dark" });
      };
    }, [isDiscoveryLayout, navigation])
  );

  // Do NOT re-apply immersive in a layout effect — it races merchant focus and
  // collapses the store header gap / shifts the Continue bar after ~1 min.

  useLayoutEffect(() => {
    if (!isNonServiceableScreen) return;
    const store = useScreenChromeStore.getState();
    store.setImmersiveStatusBarChrome(false);
    store.setStatusBarBackground(NON_SERVICEABLE_STATUS_BAR_BG, "dark");
  }, [isNonServiceableScreen]);

  const gridFirstSkyHeightDefault = useMemo(
    () => gridFirstSkySectionHeight(statusBarTopInset),
    [statusBarTopInset]
  );
  const gridFirstHeroHasSlides = useMemo(
    () => hasGridFirstHeroSlides(gridFirstHeroMedia, homeFeaturedOffers),
    [gridFirstHeroMedia, homeFeaturedOffers]
  );
  const gridFirstCompactSkyHeight =
    statusBarTopInset + GRID_FIRST_HEADER_OVERLAY_H;
  const gridFirstReservedSkyHeight = gridFirstHeroHasSlides
    ? gridFirstSkyHeightDefault
    : gridFirstCompactSkyHeight;
  const [gridFirstMeasuredSkyHeight, setGridFirstMeasuredSkyHeight] = useState(
    () => gridFirstReservedSkyHeight
  );
  const [gridFirstHeroReady, setGridFirstHeroReady] = useState(false);
  /** Once the carousel reports an aspect-based height, don't clobber it with the default. */
  const gridFirstSkyMeasuredFromHeroRef = useRef(false);
  const gridFirstSkyHeight =
    !gridFirstHeroHasSlides || !gridFirstHeroReady
      ? gridFirstCompactSkyHeight
      : Math.max(gridFirstReservedSkyHeight, gridFirstMeasuredSkyHeight);
  gridFirstSkyHeightRef.current = gridFirstSkyHeight;
  gridFirstHeroReadyRef.current = gridFirstHeroReady;
  gridFirstHeroHasSlidesRef.current = gridFirstHeroHasSlides;

  useLayoutEffect(() => {
    if (!isGridFirstLayout || isNonServiceableScreen) return;
    applyGridFirstStatusBarChrome(false);
  }, [
    isGridFirstLayout,
    isNonServiceableScreen,
    gridFirstHeroReady,
    gridFirstHeroHasSlides,
    applyGridFirstStatusBarChrome,
  ]);
  const prevSkyDefaultRef = useRef(gridFirstSkyHeightDefault);

  // Only adjust for status-bar inset changes — never reset a hero-measured height
  // back to the tall default (that left a cream gap under the banner).
  useEffect(() => {
    const prevDefault = prevSkyDefaultRef.current;
    prevSkyDefaultRef.current = gridFirstSkyHeightDefault;
    const delta = gridFirstSkyHeightDefault - prevDefault;
    if (Math.abs(delta) < 1) return;
    setGridFirstMeasuredSkyHeight((prev) => {
      if (!gridFirstSkyMeasuredFromHeroRef.current) {
        return gridFirstSkyHeightDefault;
      }
      return Math.max(gridFirstCompactSkyHeight, prev + delta);
    });
  }, [gridFirstSkyHeightDefault, gridFirstCompactSkyHeight]);

  const onGridFirstHeroHeightChange = useCallback((h: number) => {
    if (!(h > 0)) return;
    gridFirstSkyMeasuredFromHeroRef.current = true;
    setGridFirstMeasuredSkyHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  const onGridFirstHeroReadyChange = useCallback((ready: boolean) => {
    setGridFirstHeroReady(ready);
  }, []);

  useEffect(() => {
    if (!gridFirstHeroHasSlides) {
      setGridFirstHeroReady(false);
      gridFirstSkyMeasuredFromHeroRef.current = false;
      setGridFirstMeasuredSkyHeight(gridFirstCompactSkyHeight);
      return;
    }
    if (!gridFirstSkyMeasuredFromHeroRef.current) {
      setGridFirstMeasuredSkyHeight(gridFirstSkyHeightDefault);
    }
  }, [
    gridFirstHeroHasSlides,
    gridFirstCompactSkyHeight,
    gridFirstSkyHeightDefault,
  ]);

  useEffect(() => {
    if (!gridFirstHeroHasSlides) return;
    setGridFirstHeroReady(false);
    gridFirstSkyMeasuredFromHeroRef.current = false;
    setGridFirstMeasuredSkyHeight(gridFirstSkyHeightDefault);
  }, [gridFirstHeroHasSlides, gridFirstHeroMedia.map((m) => m.id).join("|"), gridFirstSkyHeightDefault]);

  const [gridFirstGoldStripH, setGridFirstGoldStripH] = useState(() =>
    showGridFirstSubscriptionRow ? GRID_FIRST_GOLD_STRIP_H : 0
  );
  const [gridFirstCategoryLayout, setGridFirstCategoryLayout] = useState({
    y: 0,
    height: gridFirstCategoryBlockHeight(categoryRailLayout.circle),
  });
  const [gridFirstFilterLayout, setGridFirstFilterLayout] = useState({
    y: 0,
    height: GRID_FIRST_FILTER_ROW_H,
  });
  const [gridFirstHeaderBlockH, setGridFirstHeaderBlockH] = useState(
    gridFirstDefaultHeaderBlockHeight
  );

  useEffect(() => {
    if (!showGridFirstSubscriptionRow) {
      setGridFirstGoldStripH(0);
      return;
    }
    setGridFirstGoldStripH((prev) => (prev > 0 ? prev : GRID_FIRST_GOLD_STRIP_H));
  }, [showGridFirstSubscriptionRow]);

  const gridFirstStickyMetrics = useMemo<GridFirstStickyMetrics>(() => {
    const base = defaultGridFirstStickyMetrics(
      statusBarTopInset,
      gridFirstSkyHeight,
      categoryRailLayout.circle
    );
    const goldStripHeight = showGridFirstSubscriptionRow
      ? gridFirstGoldStripH > 0
        ? gridFirstGoldStripH
        : base.goldStripHeight
      : 0;
    const fallbackCategoryHeight = useGridFirstCategoryTabs
      ? gridFirstCategoryBlockHeight(categoryRailLayout.circle)
      : classicCategoryRailMinHeight;
    return {
      ...base,
      goldStripHeight,
      headerBlockHeight: gridFirstHeaderBlockH,
      categoryBlockY:
        gridFirstCategoryLayout.y > 0
          ? gridFirstCategoryLayout.y
          : gridFirstSkyHeight + goldStripHeight,
      categoryBlockHeight: gridFirstCategoryLayout.height || fallbackCategoryHeight,
      filterBlockY:
        gridFirstFilterLayout.y > 0
          ? gridFirstFilterLayout.y
          : (gridFirstCategoryLayout.y > 0
              ? gridFirstCategoryLayout.y
              : gridFirstSkyHeight + goldStripHeight) +
            (gridFirstCategoryLayout.height || fallbackCategoryHeight),
      filterBlockHeight: gridFirstFilterLayout.height || GRID_FIRST_FILTER_ROW_H,
    };
  }, [
    statusBarTopInset,
    gridFirstSkyHeight,
    gridFirstGoldStripH,
    gridFirstCategoryLayout,
    gridFirstFilterLayout,
    categoryRailLayout.circle,
    showGridFirstSubscriptionRow,
    useGridFirstCategoryTabs,
    classicCategoryRailMinHeight,
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
  }, [
    gridFirstSearchStickAt,
    gridFirstCategoryStickAt,
    gridFirstFilterStickAt,
  ]);

  const gridFirstScrollRafRef = useRef<number | null>(null);

  const onGridFirstScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (gridFirstScrollRafRef.current != null) return;
      gridFirstScrollRafRef.current = requestAnimationFrame(() => {
        gridFirstScrollRafRef.current = null;
        gridFirstScrollY.value = y;
      });
    },
    [gridFirstScrollY]
  );

  useEffect(
    () => () => {
      if (gridFirstScrollRafRef.current != null) {
        cancelAnimationFrame(gridFirstScrollRafRef.current);
      }
    },
    []
  );

  const onFoodHomeListScrollBegin = useCallback(() => {
    markFoodHomeListScrollActive();
    setListScrolling(true);
  }, []);

  const onFoodHomeListScrollEnd = useCallback(() => {
    markFoodHomeListScrollEnded();
    setListScrolling(false);
  }, []);

  // Never leave the global scroll flag stuck after unmount / mid-fling leave.
  useEffect(() => () => resetFoodHomeListScrollGuard(), []);

  const restaurantKeyExtractor = useCallback((item: MerchantSummary) => item.id, []);

  const renderRestaurantItem = useCallback<ListRenderItem<MerchantSummary>>(
    ({ item }) =>
      isDiscoveryLayout ? (
        <DiscoveryRestaurantCard merchant={item} weatherDelayMinutes={weatherDelayMinutes} />
      ) : (
        <GMRestaurantCardV2
          merchant={item}
          initialSaved={bookmarkSet.has(item.id)}
          weatherDelayMinutes={weatherDelayMinutes}
          bottomSpacing={18}
        />
      ),
    [bookmarkSet, weatherDelayMinutes, isDiscoveryLayout]
  );

  const restaurantListExtraData = useMemo(
    () =>
      `${weatherDelayMinutes}:${foodLocked ? "1" : "0"}:${isDiscoveryLayout ? "d" : "c"}:${openNow ? "1" : "0"}:${topBrands ? "1" : "0"}:${nearFast ? "1" : "0"}:${sortBy}:${filterHasOffers ? "1" : "0"}:${noPackagingCharges ? "1" : "0"}:${deliveryFilter}:${selectedCuisines.join(",")}:${[...bookmarkSet].join(",")}`,
    [
      weatherDelayMinutes,
      foodLocked,
      bookmarkSet,
      isDiscoveryLayout,
      openNow,
      topBrands,
      nearFast,
      sortBy,
      filterHasOffers,
      noPackagingCharges,
      deliveryFilter,
      selectedCuisines,
    ]
  );

  const gridFirstCategoryFlowStyle = useAnimatedStyle(() => {
    const stickAt = gridFirstCategoryStickAtSv.value;
    if (stickAt <= GRID_FIRST_STICK_HANDOFF_PX * 2) {
      return { opacity: 1 };
    }
    return {
      opacity: interpolate(
        gridFirstScrollY.value,
        [stickAt - GRID_FIRST_STICK_HANDOFF_PX, stickAt + GRID_FIRST_STICK_HANDOFF_PX],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const gridFirstFilterFlowStyle = useAnimatedStyle(() => {
    const y = gridFirstScrollY.value;
    const stickyAt = gridFirstCategoryStickAtSv.value - GRID_FIRST_STICK_HANDOFF_PX;
    const handoffAt = gridFirstFilterStickAtSv.value + GRID_FIRST_STICK_HANDOFF_PX;

    // Sticky overlay owns the filter while the header is pinned — collapse in-flow copy.
    if (
      gridFirstCategoryStickAtSv.value > 1 &&
      y >= stickyAt &&
      y < handoffAt - GRID_FIRST_STICK_HANDOFF_PX
    ) {
      return {
        opacity: 0,
        maxHeight: 0,
        marginBottom: 0,
        marginTop: 0,
        paddingTop: 0,
        paddingBottom: 0,
        overflow: "hidden" as const,
        transform: [{ translateY: 0 }],
      };
    }

    // Always visible in document flow (above Recommended) when not sticky-owned.
    return {
      opacity: 1,
      maxHeight: GRID_FIRST_FILTER_ROW_H + 24,
      marginBottom: SECTION_GAP_SM,
      overflow: "visible" as const,
      transform: [{ translateY: 0 }],
    };
  });

  useAnimatedReaction(
    () => gridFirstScrollY.value >= gridFirstSearchStickAtSv.value - 10,
    (searchSticky, prev) => {
      if (searchSticky === prev) return;
      runOnJS(syncGridFirstStickyStatusBar)(searchSticky);
    },
    [syncGridFirstStickyStatusBar]
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
              showBack={false}
              minimal
              blendBackground
              locationLabel={selectedLocationLabel}
              locationLabelLines={2}
            />
          }
        />
      </View>
    );
  }

  const promoCardHeight = OFFER_CARD_HEIGHT;
  const showLovedGrid =
    foodHomeLayoutKey === "classic" || foodHomeLayoutKey === "grid_first";
  const showLovedHorizontal = false;
  const lovedSectionTitle =
    foodHomeLayoutKey === "grid_first" ? "RECOMMENDED WITH DEALS" : "LOVED BY CUSTOMERS";

  // Single scroll: header in flow, then content (categories → filters → list). Sticky rail inside content area only.
  return (
    <View
      collapsable={false}
      style={[styles.container, isDiscoveryLayout && styles.discoveryContainer]}
    >
      {isGridFirstLayout ? (
        <StatusBar style="dark" translucent backgroundColor="transparent" hidden={false} />
      ) : isDiscoveryLayout ? (
        <StatusBar style="light" backgroundColor={DiscoveryColors.bg} hidden={false} />
      ) : (
        <StatusBar style="dark" hidden={false} />
      )}

      {isDiscoveryLayout ? (
        <DiscoveryHomeHeader
          topInset={statusBarTopInset}
          locationLabel={
            [gridFirstLocationLabels.primary, gridFirstLocationLabels.secondary]
              .filter(Boolean)
              .join(", ")
          }
          onBack={handleBack}
          onLocationPress={handleLocationPress}
          onSearchPress={handleSearch}
          vegOnly={vegOnly}
          onVegChange={setVegOnly}
        />
      ) : !isGridFirstLayout ? (
        <GMHeader
          topInset={HEADER_TOP_PADDING_NONE}
          compact
          onBack={handleBack}
          onSearchPress={handleSearch}
          showActions={true}
          vegOnly={vegOnly}
          onVegChange={setVegOnly}
          showCart={false}
          searchElement={<GMSearchBar onPress={handleSearch} rotatingPlaceholder />}
        />
      ) : null}

      <View style={[styles.contentWrap, isDiscoveryLayout && styles.discoveryContentWrap]}>
        <FlashList
          style={StyleSheet.flatten([styles.scroll, isDiscoveryLayout && styles.discoveryScroll])}
          data={showMerchantsSkeleton ? EMPTY_MERCHANTS : listMerchants}
          keyExtractor={restaurantKeyExtractor}
          renderItem={renderRestaurantItem}
          extraData={restaurantListExtraData}
          drawDistance={480}
          removeClippedSubviews={Platform.OS === "android"}
          contentInsetAdjustmentBehavior="never"
          overScrollMode="never"
          bounces={!isDiscoveryLayout}
          contentContainerStyle={{
            paddingBottom: isDiscoveryLayout
              ? Math.max(insets.bottom, 10) +
                8 +
                (floatingDockVisible
                  ? FLOATING_CART_BAR_HEIGHT + FLOATING_CART_UI_LIFT
                  : DISCOVERY_FLOAT_BAR_H)
              : 8,
          }}
          showsVerticalScrollIndicator={false}
          // First-tap cards/chips must not wait for scroll gesture settle (mirror merchant menu).
          delaysContentTouches={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onScroll={isGridFirstLayout ? onGridFirstScroll : undefined}
          scrollEventThrottle={isGridFirstLayout ? 32 : undefined}
          onScrollBeginDrag={onFoodHomeListScrollBegin}
          onScrollEndDrag={onFoodHomeListScrollEnd}
          onMomentumScrollBegin={onFoodHomeListScrollBegin}
          onMomentumScrollEnd={onFoodHomeListScrollEnd}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={isDiscoveryLayout ? DiscoveryColors.teal : GatiMitraColors.primaryMint}
              colors={[isDiscoveryLayout ? DiscoveryColors.teal : GatiMitraColors.primaryMint]}
              progressBackgroundColor={isDiscoveryLayout ? DiscoveryColors.card : "#FFFFFF"}
            />
          }
          ListHeaderComponent={
            <>
          {isGridFirstLayout ? (
            <View style={styles.gridFirstSkyBlock}>
              <View
                style={[
                  styles.gridFirstSkyInner,
                  (!gridFirstHeroHasSlides || !gridFirstHeroReady) &&
                    styles.gridFirstSkyInnerCompact,
                  { height: gridFirstSkyHeight },
                ]}
              >
                {gridFirstHeroHasSlides ? (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { opacity: gridFirstHeroReady ? 1 : 0 },
                  ]}
                  pointerEvents={gridFirstHeroReady ? "auto" : "none"}
                >
                  <FoodHomeHeroCarousel
                    heroMedia={gridFirstHeroMedia}
                    offers={homeFeaturedOffers}
                    embeddedInSky
                    immersive
                    topInset={statusBarTopInset}
                    placeholderColor={GRID_FIRST_PAGE_BG}
                    shouldPlay={isScreenFocused && !listScrolling}
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
                    vegOnly={vegOnly}
                    onVegChange={setVegOnly}
                    stickyScrollY={gridFirstScrollY}
                    searchStickAt={gridFirstSearchStickAtSv}
                    fadeLocationOnSticky
                    heroReady={gridFirstHeroHasSlides && gridFirstHeroReady}
                  />
                </View>
                {gridFirstHeroHasSlides && gridFirstHeroReady ? (
                  <View style={styles.gridFirstOffersOverlay} pointerEvents="box-none">
                    <FoodOffersRibbonCarousel
                      offers={homeFeaturedOffers}
                      merchantFallbacks={merchants}
                      cardHeight={promoCardHeight}
                      showDefaultWhenEmpty={false}
                      embedOnHero
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : isDiscoveryLayout && discoveryCtaTiles.length > 0 ? (
            <View style={[styles.discoveryPromoSection, styles.discoveryPromoSlot]}>
              <DiscoveryPromoRail
                tiles={discoveryCtaTiles}
                offers={homeFeaturedOffers}
                dealsAtMaxPrice={discoveryDealsAtPrice}
                onMealsPress={handleMealsUnderPricePress}
                onDealsPress={handleCrazyDealsPress}
                onPackagingPress={handleFreePackagingPress}
              />
            </View>
          ) : isDiscoveryLayout ? null : (
            <View style={styles.offersSection}>
              <FoodOffersRibbonCarousel
                offers={homeFeaturedOffers}
                merchantFallbacks={merchants}
                cardHeight={promoCardHeight}
                showDefaultWhenEmpty={false}
              />
            </View>
          )}

          {isGridFirstLayout && showGridFirstSubscriptionRow ? (
            <View
              style={{ minHeight: GRID_FIRST_GOLD_STRIP_H }}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0) setGridFirstGoldStripH(h);
              }}
            >
              <FoodHomeGoldStrip
                enabled={gridFirstSubscriptionRowEnabled}
                message={gridFirstSubscriptionRowText}
                backgroundColor={gridFirstSubscriptionRowBgColor}
              />
            </View>
          ) : isGridFirstLayout ? null : isDiscoveryLayout ? null : (
            <View style={styles.sectionGap} />
          )}

          {isGridFirstLayout ? (
            useGridFirstCategoryTabs ? (
              <Animated.View
                style={[styles.categoryTabsSection, gridFirstCategoryFlowStyle]}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  if (height > 0) {
                    setGridFirstCategoryLayout({ y, height });
                  }
                }}
              >
                {gridFirstCategoryTabsEl}
              </Animated.View>
            ) : (
              <View
                style={[styles.categoryRailSection, { minHeight: classicCategoryRailMinHeight }]}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  if (height > 0) {
                    setGridFirstCategoryLayout({ y, height });
                  }
                }}
              >
                {classicCategoryRailEl}
              </View>
            )
          ) : foodHomeLayoutKey === "discovery" ? (
            <View style={[styles.discoveryCategorySection, styles.discoveryCategorySlot]}>
              {categoryRailBootstrapping ? (
                <CategoryRailSkeleton
                  columnCount={5}
                  itemW={categoryRailLayout.itemW}
                  columnGap={categoryRailLayout.columnGap}
                  circle={Math.min(58, Math.max(46, categoryRailLayout.circle - 4))}
                  rowGap={RAIL_ROW_GAP}
                />
              ) : homeCategoryRailItems.length === 0 ? (
                <View style={styles.categoryRailLoading}>
                  <AppText style={styles.discoveryMutedText}>No categories yet.</AppText>
                </View>
              ) : (
                <DiscoveryCategoryGrid items={homeCategoryRailItems} onSelect={handleCategorySelect} />
              )}
            </View>
          ) : (
          <>
          <View
            style={[
              styles.categoryRailSection,
              {
                minHeight: classicCategoryRailMinHeight,
              },
            ]}
          >
            {classicCategoryRailEl}
          </View>
          </>
          )}

          {isDiscoveryLayout ? (
            <DiscoveryBackForMoreSection
              stores={recentlyViewedStores}
              liveMerchants={merchants}
              vegOnly={vegOnly}
            />
          ) : null}

          {/* Filter bar — always in flow above Recommended; sticky chrome takes over on scroll */}
          {isGridFirstLayout ? (
            <Animated.View
              style={[styles.section, styles.filterBar, gridFirstFilterFlowStyle]}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                if (height > 0) {
                  setGridFirstFilterLayout({ y, height });
                }
              }}
            >
              {gridFirstFilterRowEl}
            </Animated.View>
          ) : isDiscoveryLayout ? (
            <DiscoveryExploreSection
              openNow={openNow}
              topBrands={topBrands}
              sortBy={sortBy}
              nearFast={nearFast}
              hasOffers={filterHasOffers}
              noPackagingCharges={noPackagingCharges}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              onToggleOpenNow={() => setOpenNow((v) => !v)}
              onToggleTopBrands={() => setTopBrands((v) => !v)}
              onToggleSort={handleClassicSortToggle}
              onToggleOffers={() => setFilterHasOffers((v) => !v)}
              onToggleNoPackaging={() => setNoPackagingCharges((v) => !v)}
              onToggleNearFast={handleNearFastToggle}
              onOpenFilters={() => setFilterSheetVisible(true)}
            />
          ) : (
            <View style={[styles.section, styles.filterBar]}>
              {classicFilterRowEl}
            </View>
          )}

          {/* Loved by Customers — horizontal rail: 2 full + 3rd peek */}
          {(showMerchantsSkeleton || lovedByCustomers.length > 0) && (showLovedGrid || showLovedHorizontal) ? (
            <View style={styles.lovedSection}>
              <AppText style={styles.sectionHeading}>{lovedSectionTitle}</AppText>
              {showMerchantsSkeleton ? (
                <LovedMerchantsGridSkeleton count={4} dark={isDiscoveryLayout} />
              ) : (
                <LovedMerchantsHorizontal
                  merchants={lovedByCustomers}
                  weatherDelayMinutes={weatherDelayMinutes}
                  onPressMerchant={openMerchantPageGuarded}
                />
              )}
            </View>
          ) : null}

          {isDiscoveryLayout ? (
            foodLocked ? (
              <View style={[styles.preventBanner, styles.discoveryPreventBanner]}>
                <Ionicons name="shield-outline" size={16} color="#FCA5A5" />
                <AppText style={styles.discoveryPreventText}>
                  Food ordering is restricted for this delivery location. Change address to continue.
                </AppText>
              </View>
            ) : null
          ) : (
          <View style={[styles.section, styles.restaurantSection]}>
            <AppText style={styles.sectionHeading}>RESTAURANTS NEAR YOU</AppText>
            {foodLocked ? (
              <View style={styles.preventBanner}>
                <Ionicons name="shield-outline" size={16} color="#B91C1C" />
                <AppText style={styles.preventBannerText}>
                  Food ordering is restricted for this delivery location. Change address to continue.
                </AppText>
              </View>
            ) : null}
            {!showMerchantsSkeleton ? (
              <AppText style={styles.restaurantOpenCount}>{openRestaurantCountLabel}</AppText>
            ) : null}
          </View>
          )}
            </>
          }
          ListEmptyComponent={
            showMerchantsSkeleton ? (
              <RestaurantListSkeleton
                count={3}
                cardWidth={restaurantCardWidth}
                dark={isDiscoveryLayout}
                layout={isDiscoveryLayout ? "row" : "poster"}
              />
            ) : vegOnly ? (
              <View style={styles.vegEmptyWrap}>
                <View style={[styles.vegEmptyIconRing, isDiscoveryLayout && styles.discoveryVegRing]}>
                  <Ionicons name="leaf" size={20} color={GatiMitraColors.primaryMint} />
                </View>
                <AppText style={[styles.vegEmptyTitle, isDiscoveryLayout && styles.discoveryMutedText]}>
                  We couldn’t find any pure-veg stores in your area.
                </AppText>
              </View>
            ) : (
              <AppText style={[styles.restaurantEmptyHint, isDiscoveryLayout && styles.discoveryMutedText]}>
                No restaurants match your filters.
              </AppText>
            )
          }
          ListFooterComponent={
            isDiscoveryLayout ? (
              <View style={{ height: 8 }} />
            ) : (
            <View style={isVegEmptyState ? styles.footerDock : undefined}>
              <BrandingFooter compact />
            </View>
            )
          }
        />

        {isGridFirstLayout ? (
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
            vegOnly={vegOnly}
            onVegChange={setVegOnly}
            categories={useGridFirstCategoryTabs ? gridFirstCategoryTabsEl : null}
            filters={gridFirstStickyFilterRowEl}
            enableCategorySticky={useGridFirstCategoryTabs}
            enableFilterSticky
          />
        ) : null}

        {isDiscoveryLayout && !floatingDockVisible ? (
          <DiscoveryFloatingBar
            sortBy={sortBy}
            hasActiveFilters={hasActiveFilters}
            bottomInset={Math.max(insets.bottom, 10)}
            onSortPress={handleClassicSortToggle}
            onFiltersPress={() => setFilterSheetVisible(true)}
          />
        ) : null}
      </View>

      {/* Filter sheet — full-bleed bottom sheet */}
      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.filterOverlay} onPress={() => setFilterSheetVisible(false)}>
          <Pressable style={styles.filterSheetStack} onPress={() => {}}>
            <View
              style={[
                styles.filterSheetCard,
                isDiscoveryLayout && styles.discoveryFilterSheetCard,
                { maxHeight: windowHeight * 0.9 },
              ]}
            >
              {isDiscoveryLayout ? null : (
                <LinearGradient
                  colors={[GatiMitraColors.mintSoft, "#FFFFFF"]}
                  locations={[0, 0.35]}
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents="none"
                />
              )}
              <View style={styles.filterSheetHandleWrap}>
                <View style={[styles.filterSheetHandle, isDiscoveryLayout && styles.discoveryFilterHandle]} />
              </View>
              <View style={styles.filterSheetHeader}>
                <View style={styles.filterSheetTitleBlock}>
                  <AppText style={[styles.filterSheetTitle, isDiscoveryLayout && styles.discoveryFilterTitle]}>
                    Filters
                  </AppText>
                  <AppText style={[styles.filterSheetSubtitle, isDiscoveryLayout && styles.discoveryFilterSubtitle]}>
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active — tap Apply to update the list`
                      : "Refine delivery time, cuisine, and offers"}
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={clearFilters}
                  hitSlop={12}
                  disabled={!hasActiveFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                  accessibilityState={{ disabled: !hasActiveFilters }}
                >
                  <AppText
                    style={[
                      styles.filterSheetClear,
                      isDiscoveryLayout && styles.discoveryFilterClear,
                      !hasActiveFilters && styles.filterSheetClearDisabled,
                      !hasActiveFilters && isDiscoveryLayout && styles.discoveryFilterClearDisabled,
                    ]}
                  >
                    Clear all
                  </AppText>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={{ maxHeight: Math.min(440, windowHeight * 0.5) }}
                contentContainerStyle={styles.filterSheetScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                <AppText style={[styles.filterSectionLabel, isDiscoveryLayout && styles.discoveryFilterSectionLabel]}>
                  Delivery time
                </AppText>
                <View style={styles.filterChipsRow}>
                  {DELIVERY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.filterSheetChip,
                        isDiscoveryLayout && styles.discoveryFilterChip,
                        deliveryFilter === opt.id && styles.filterSheetChipActive,
                        deliveryFilter === opt.id && isDiscoveryLayout && styles.discoveryFilterChipActive,
                      ]}
                      onPress={() => setDeliveryFilter(opt.id)}
                      activeOpacity={0.85}
                    >
                      <AppText
                        style={[
                          styles.filterSheetChipText,
                          isDiscoveryLayout && styles.discoveryFilterChipText,
                          deliveryFilter === opt.id && styles.filterSheetChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
                <AppText style={[styles.filterSectionLabel, isDiscoveryLayout && styles.discoveryFilterSectionLabel]}>
                  Cuisine
                </AppText>
                <View style={styles.filterChipsRow}>
                  {CUISINE_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.filterSheetChip,
                        isDiscoveryLayout && styles.discoveryFilterChip,
                        selectedCuisines.includes(c) && styles.filterSheetChipActive,
                        selectedCuisines.includes(c) && isDiscoveryLayout && styles.discoveryFilterChipActive,
                      ]}
                      onPress={() => toggleCuisine(c)}
                      activeOpacity={0.85}
                    >
                      <AppText
                        style={[
                          styles.filterSheetChipText,
                          isDiscoveryLayout && styles.discoveryFilterChipText,
                          selectedCuisines.includes(c) && styles.filterSheetChipTextActive,
                        ]}
                      >
                        {c}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
                <AppText style={[styles.filterSectionLabel, isDiscoveryLayout && styles.discoveryFilterSectionLabel]}>
                  Other
                </AppText>
                <TouchableOpacity
                  style={[
                    styles.filterSheetRow,
                    isDiscoveryLayout && styles.discoveryFilterRow,
                    filterHasOffers && styles.filterSheetRowActive,
                    filterHasOffers && isDiscoveryLayout && styles.discoveryFilterRowActive,
                  ]}
                  onPress={() => setFilterHasOffers((v) => !v)}
                  activeOpacity={0.88}
                >
                  <View
                    style={[
                      styles.filterSheetRowIconWrap,
                      isDiscoveryLayout && styles.discoveryFilterRowIconWrap,
                      filterHasOffers && styles.filterSheetRowIconWrapActive,
                    ]}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={20}
                      color={
                        filterHasOffers
                          ? "#fff"
                          : isDiscoveryLayout
                            ? DiscoveryColors.accent
                            : GatiMitraColors.primaryMint
                      }
                    />
                  </View>
                  <AppText
                    style={[
                      styles.filterSheetRowText,
                      isDiscoveryLayout && styles.discoveryFilterRowText,
                      filterHasOffers && styles.filterSheetRowTextOnMint,
                    ]}
                  >
                    Has offers
                  </AppText>
                  {filterHasOffers ? (
                    <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.filterSheetRowTrailing} />
                  ) : null}
                </TouchableOpacity>
              </ScrollView>
              <View
                style={[
                  styles.filterSheetFooter,
                  isDiscoveryLayout && styles.discoveryFilterFooter,
                  { paddingBottom: Math.max(insets.bottom, 14) },
                ]}
              >
                <TouchableOpacity
                  style={styles.filterApplyBtnOuter}
                  onPress={applyFilters}
                  activeOpacity={0.92}
                  accessibilityRole="button"
                  accessibilityLabel="Apply filters"
                >
                  <LinearGradient
                    colors={
                      isDiscoveryLayout
                        ? DiscoveryColors.homeDelivery
                        : GatiMitraColors.checkoutGradient
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.filterApplyBtnGradient}
                  >
                    <AppText style={styles.filterApplyBtnText}>Apply</AppText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  discoveryContainer: {
    backgroundColor: DiscoveryColors.bg,
    overflow: "hidden",
  },
  discoveryPromoSection: {
    marginBottom: 10,
    marginTop: 2,
  },
  discoveryPromoSlot: {
    minHeight: 46,
  },
  discoveryCategorySection: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  discoveryCategorySlot: {
    minHeight: 196,
  },
  discoveryMutedText: {
    color: DiscoveryColors.textMuted,
  },
  discoveryPreventBanner: {
    backgroundColor: "#3F1D1D",
    borderColor: "#7F1D1D",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  discoveryPreventText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#FECACA",
    lineHeight: 17,
  },
  discoveryVegRing: {
    backgroundColor: "rgba(34, 197, 94, 0.16)",
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  gridFirstSkyBlock: {
    marginBottom: 0,
    overflow: "hidden",
  },
  gridFirstOffersOnHero: {
    zIndex: 3,
    elevation: 3,
  },
  gridFirstOffersOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    elevation: 6,
  },
  gridFirstSkyInner: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "transparent",
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
  nonServiceableContainer: {
    backgroundColor: NON_SERVICEABLE_STATUS_BAR_BG,
  },
  contentWrap: {
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  discoveryContentWrap: {
    zIndex: 0,
    overflow: "hidden",
    backgroundColor: DiscoveryColors.bg,
  },
  nonServiceableContent: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  discoveryScroll: {
    backgroundColor: DiscoveryColors.bg,
  },
  section: {
    paddingHorizontal: PAGE_PAD,
    marginBottom: SECTION_GAP,
  },
  offersSection: {
    marginBottom: 4,
  },
  offersScrollContent: {
    gap: OFFER_GAP,
    paddingRight: PAGE_PAD,
    paddingVertical: 4,
  },
  offerCardWrap: {
    height: OFFER_CARD_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  restaurantEmptyHint: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  vegEmptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 12,
  },
  vegEmptyIconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
  },
  vegEmptyTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
  sectionGap: {
    height: SECTION_GAP_SM,
  },
  categoryRailSection: {
    paddingVertical: 12,
    marginBottom: SECTION_GAP,
    overflow: "visible",
  },
  categoryGridSection: {
    paddingVertical: 8,
    marginBottom: SECTION_GAP_SM,
  },
  categoryTabsSection: {
    paddingTop: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
    paddingBottom: 4,
    marginBottom: 0,
    marginTop: 0,
    backgroundColor: GRID_FIRST_PAGE_BG,
    overflow: "hidden",
  },
  categoryChipsSection: {
    paddingVertical: 8,
    marginBottom: SECTION_GAP_SM,
  },
  categoryRailScrollContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  categoryRailScrollTrail: {
    width: 0,
    flexShrink: 0,
  },
  categoryRailColumn: {
    flexDirection: "column",
    gap: RAIL_ROW_GAP,
    alignItems: "center",
  },
  categoryRailItem: {
    alignItems: "center",
  },
  categoryRailCircle: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 1, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    }),
    elevation: 3,
  },
  categoryRailLoading: {
    paddingHorizontal: PAGE_PAD,
    paddingVertical: 24,
    alignItems: "center",
  },
  categoryRailLoadingText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
  },
  categoryRailLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  filterBarChipsScroll: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  filterBarChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 4,
  },
  filterStoreCount: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  filterChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  filterChipNearFast: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  filterChipTextNearFast: {
    color: "#15803D",
  },
  restaurantSection: {
    borderTopWidth: 0,
    marginBottom: 0,
    paddingTop: 4,
    /** Headings use sectionHeading pad (16) — don't double-inset vs Recommended. */
    paddingHorizontal: 0,
  },
  preventBanner: {
    marginHorizontal: PAGE_PAD,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  preventBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#B91C1C",
    lineHeight: 17,
  },
  lovedSection: {
    marginTop: 4,
    marginBottom: 12,
    overflow: "visible",
  },
  merchantGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAGE_PAD,
    gap: 10,
    overflow: "visible",
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: GatiMitraColors.textSecondary,
    marginTop: 0,
    /** Match Swiggy title → row gap (~1.5× title height). */
    marginBottom: 14,
    paddingHorizontal: PAGE_PAD,
    textTransform: "uppercase",
  },
  restaurantOpenCount: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: "#64748B",
    paddingHorizontal: PAGE_PAD,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    marginBottom: 12,
  },
  footerDock: {
    marginTop: "auto",
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  /** Full-bleed bottom sheet — no horizontal inset on the card. */
  filterSheetStack: {
    width: "100%",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  filterSheetCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 16 },
    }),
  },
  filterSheetHandleWrap: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: "center",
  },
  filterSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(34, 197, 94, 0.35)",
  },
  filterSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 16,
    gap: 12,
  },
  filterSheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  filterSheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.3,
  },
  filterSheetSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
  },
  filterSheetClear: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.primaryMint,
    paddingTop: 4,
  },
  filterSheetClearDisabled: {
    color: GatiMitraColors.textSecondary,
    opacity: 0.5,
  },
  filterSheetScrollContent: {
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 8,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: GatiMitraColors.textSecondary,
    marginBottom: 12,
    marginTop: 6,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  filterSheetChip: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
  },
  filterSheetChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterSheetChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetChipTextActive: {
    color: "#fff",
  },
  filterSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
    marginBottom: 4,
  },
  filterSheetRowActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterSheetRowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSheetRowIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterSheetRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetRowTextOnMint: {
    color: "#fff",
  },
  filterSheetRowTrailing: {
    marginLeft: 4,
  },
  filterSheetFooter: {
    paddingTop: 12,
    paddingHorizontal: PAGE_PAD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      android: { elevation: 10 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
    }),
  },
  filterApplyBtnOuter: {
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
    }),
  },
  filterApplyBtnGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterApplyBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  discoveryFilterSheetCard: {
    backgroundColor: DiscoveryColors.card,
  },
  discoveryFilterHandle: {
    backgroundColor: "rgba(45, 212, 191, 0.45)",
  },
  discoveryFilterTitle: {
    color: DiscoveryColors.text,
  },
  discoveryFilterSubtitle: {
    color: DiscoveryColors.textMuted,
  },
  discoveryFilterClear: {
    color: DiscoveryColors.accent,
  },
  discoveryFilterClearDisabled: {
    color: DiscoveryColors.textDim,
    opacity: 0.7,
  },
  discoveryFilterSectionLabel: {
    color: DiscoveryColors.textDim,
  },
  discoveryFilterChip: {
    backgroundColor: DiscoveryColors.pill,
    borderColor: DiscoveryColors.border,
  },
  discoveryFilterChipActive: {
    backgroundColor: DiscoveryColors.accent,
    borderColor: DiscoveryColors.accent,
  },
  discoveryFilterChipText: {
    color: DiscoveryColors.text,
  },
  discoveryFilterRow: {
    backgroundColor: DiscoveryColors.pill,
    borderColor: DiscoveryColors.border,
  },
  discoveryFilterRowActive: {
    backgroundColor: DiscoveryColors.accent,
    borderColor: DiscoveryColors.accent,
  },
  discoveryFilterRowIconWrap: {
    backgroundColor: "rgba(45, 212, 191, 0.16)",
  },
  discoveryFilterRowText: {
    color: DiscoveryColors.text,
  },
  discoveryFilterFooter: {
    backgroundColor: DiscoveryColors.card,
    borderTopColor: DiscoveryColors.border,
  },
  layoutResolvingShell: {
    flex: 1,
    gap: SECTION_GAP,
    paddingHorizontal: PAGE_PAD,
  },
  layoutResolvingHero: {
    height: OFFER_CARD_HEIGHT + 48,
    borderRadius: 16,
    width: "100%",
  },
});
