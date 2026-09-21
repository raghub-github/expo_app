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
  InteractionManager,
  Alert,
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
import { useRouter, useFocusEffect, useNavigation, useSegments } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { foodHomeRouterBack } from "@/lib/safeRouterBack";
import { consumeFoodHomeFlashDealFilter } from "@/lib/foodHomePendingFilters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { MerchantSummary, MenuItem } from "@/services/merchant.service";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import {
  prefetchMenuItemFullConfig,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { prefetchMerchantBanners, prioritizeVisibleMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { prefetchVisibleMerchantBanners } from "@/lib/merchantHeroWarmCache";
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
import { prefetchMerchantDetail } from "@/lib/prefetchMerchantDetail";
import { seedMerchantMenuQueryIfCached } from "@/lib/merchantMenuCache";
import { markFoodHomeRouteMounted } from "@/lib/navigateToFoodHome";
import { foodFixDbg, foodNavDbg, useTabScreenDebug } from "@/lib/tabNavDebug";
import { navigatePrimaryTab } from "@/lib/navigatePrimaryTab";
import { navigateToMealsUnderPrice } from "@/lib/navigateToMealsUnderPrice";
import {
  markFoodHomeListScrollActive,
  markFoodHomeListScrollEnded,
  registerFoodHomeListScroller,
  resetFoodHomeListScrollGuard,
} from "@/lib/foodHomeScrollGuard";
import {
  NATURAL_DECELERATION_RATE,
  SCROLL_FLING_VELOCITY_EPS,
} from "@/lib/naturalScrollProps";
import { prefetchGridFirstHeroMedia, prefetchFeaturedOfferHeroImages, isHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import { isRawCoordinateText } from "@/lib/isRawCoordinateText";
import { invalidateFoodHomeListingQueriesAfterMove } from "@/lib/invalidateFoodHomeLocationQueries";
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
import { BrandingFooter } from "@/components/BrandingFooter";
import {
  CategoryRailSkeleton,
  GMSkeleton,
  LovedMerchantsGridSkeleton,
} from "@/components/ShimmerSkeleton";
import { FoodOffersRibbonCarousel } from "@/components/home/FoodOffersRibbonCarousel";
import {
  FoodHomeHeroCarousel,
  GRID_FIRST_HEADER_OVERLAY_H,
  gridFirstSkyHeightForAspect,
  hasGridFirstHeroSlides,
} from "@/components/home/FoodHomeHeroCarousel";
import { FoodHomeGoldStrip } from "@/components/home/FoodHomeGoldStrip";
import { FoodHomeGridFirstHeader } from "@/components/home/FoodHomeGridFirstHeader";
import { FoodHomeListingSkeleton } from "@/components/home/FoodHomeListingSkeleton";
import { ClassicExploreRestaurantsSkeleton } from "@/components/home/ClassicExploreRestaurantsSkeleton";
import { VegModeSettingsSheet } from "@/components/home/VegModeSettingsSheet";
import { VegModePopover, type VegPopoverAnchor } from "@/components/home/VegModePopover";
import { VegModeTransitionOverlay } from "@/components/home/VegModeTransitionOverlay";
import { FoodHomeGridFirstStickyChrome } from "@/components/home/FoodHomeGridFirstStickyChrome";
import { FoodHomeFilterRow } from "@/components/home/FoodHomeFilterRow";
import {
  defaultGridFirstStickyMetrics,
  GRID_FIRST_FILTER_ROW_H,
  GRID_FIRST_GOLD_STRIP_H,
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
import { HEADER_TOP_PADDING_NONE, HOME_HEADER_BELOW_STATUS_GAP, resolveTopSafeInset, resolveCustomerBottomNavHeight } from "@/constants/layout";
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
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useFoodHomeLayout } from "@/hooks/useFoodHomeLayout";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  resolveDiscoveryDealsAtMaxPrice,
} from "@/lib/foodHomeLayout";
import { peekCachedFoodHomeLayoutKey } from "@/lib/foodHomeLayoutCache";
import { fetchFoodItemsUnderPrice, fetchFoodItemsUnderPriceGrouped } from "@/services/foodHomeItemsUnderPrice.service";
import { FoodHomeUnder250Section } from "@/components/home/FoodHomeUnder250Section";
import { ClassicFoodCategoryRail } from "@/components/home/ClassicFoodCategoryRail";
import { ClassicStoreWithItemsCard } from "@/components/home/ClassicStoreWithItemsCard";
import { ClassicFeaturedStoreRail } from "@/components/home/ClassicFeaturedStoreRail";
import { useClassicFoodChromeStore } from "@/store/classicFoodChromeStore";
import { ClassicStickyCategoryChrome } from "@/components/home/ClassicStickyCategoryChrome";
import type { FoodItemUnderPrice, StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import { buildCategoryFromPriceMap, itemMatchesCategoryLabel } from "@/lib/classicCategoryFromPrice";
import { isClassicPopularRatedStore } from "@/lib/classicStoreRating";
import { useCartStore } from "@/store/cartStore";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { Image } from "expo-image";
import { filterPureVegMerchants, filterVegSafeCategories } from "@/lib/pureVegFilter";
import { filterHiddenStores, useHiddenStores } from "@/lib/hiddenStores";
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
  DiscoveryColors,
} from "@/features/discovery-home";
import { useDiscoveryFloatingChromeStore } from "@/store/discoveryFloatingChromeStore";

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
/** Last known grid-first hero presence — avoids main→food sky compact↔expand jerk. */
let lastFoodHomeHadHeroSlides: boolean | null = null;

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
  useTabScreenDebug("food");
  const mountT0 = useRef(__DEV__ ? Date.now() : 0);
  const insets = useAppSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const segments = useSegments();
  /** Mounted inside the tab navigator (vs stack `/home`). */
  const underTabs = segments[0] === "(tabs)";
  const queryClient = useQueryClient();
  const { hiddenIds } = useHiddenStores();
  const { foodLocked } = usePreventServicesAtPin();

  // Prevent stacking a second Food entry when Order Food / tab press both fire.
  useEffect(() => {
    foodNavDbg("MOUNT", {
      source: "FoodMerchantsScreen",
      method: "mount",
      from: segments.join("/"),
      to: underTabs ? "(tabs)/food" : "/home",
      reason: underTabs ? "tab-instance" : "stack-instance",
      underTabs,
    });
    markFoodHomeRouteMounted(true);
    return () => {
      foodNavDbg("UNMOUNT", {
        source: "FoodMerchantsScreen",
        method: "unmount",
        reason: underTabs ? "tab-instance" : "stack-instance",
        underTabs,
      });
      markFoodHomeRouteMounted(false);
    };
    // Capture mount-time route identity for the dual-instance probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    // eslint-disable-next-line no-console
    console.log(`[FOOD_NAV] first-render +${Date.now() - mountT0.current}ms`);
  }, []);

  const openMerchantPageGuarded = useCallback(
    (id: string, merchant?: MerchantSummary) => {
      if (foodLocked) return;
      navigateToMerchant(router, queryClient, id, merchant);
    },
    [foodLocked, queryClient, router]
  );

  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const locationSource = useLocationStore((s) => s.locationSource);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const refetchLocation = useLocationStore((s) => s.refetchLocation);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
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
  const { refetch: refetchBookmarks } = useStoreBookmarks();
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
    gridFirstUnder250Title,
    gridFirstUnder250TabImageUrl,
    gridFirstUnder250HeroImageUrl,
    gridFirstUnder250MaxPrice,
    classicUnder250Enabled,
    classicUnder250Title,
    classicUnder250HeroImageUrl,
    classicUnder250TabImageUrl,
    classicUnder250MaxPrice,
    discoveryDealsAtMaxPrice,
    discoveryDealsAtImageUrl,
    discoveryDealsAtHeroImageUrl,
    discoveryCrazyDealsImageUrl,
    discoveryFreePackagingImageUrl,
    discoveryCtaTiles,
  } = useFoodHomeLayout(address, merchantsAnchorCoords);

  const resolvedFoodHomeLayoutKey =
    foodHomeLayoutKeyRaw ??
    cachedLayoutKey ??
    peekCachedFoodHomeLayoutKey() ??
    DEFAULT_FOOD_HOME_LAYOUT;
  const isGridFirstLayout = resolvedFoodHomeLayoutKey === "grid_first";
  const isDiscoveryLayout = resolvedFoodHomeLayoutKey === "discovery";
  const listBottomSafe = underTabs
    ? resolveCustomerBottomNavHeight(insets.bottom)
    : Math.max(insets.bottom, 16);

  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const vegToggleOn = useDietaryPreferenceStore((s) => s.vegToggleOn);
  const turnOffVegMode = useDietaryPreferenceStore((s) => s.turnOff);
  const refreshVegCalendarDay = useDietaryPreferenceStore((s) => s.refreshCalendarDay);
  const hydrateDietaryPreferences = useDietaryPreferenceStore((s) => s.hydrate);
  // Prefs hydrate in background; never block nearby-store paint on AsyncStorage.
  // Sync merchant cache + client-side pure-veg filter keep first frame correct.

  // Sync cache seed only — image prefetch must NOT run in layout (blocks first paint).
  useLayoutEffect(() => {
    seedUserAppCategoriesQueryIfCached(queryClient, HOME_CATEGORY_STORE_TYPE);
    if (merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null) {
      const lat = merchantsAnchorCoords.latitude;
      const lng = merchantsAnchorCoords.longitude;
      // Seed both diet buckets so a late veg hydrate does not blank the list.
      seedMerchantsListQueryIfCached(queryClient, lat, lng, false, HOME_MERCHANTS_STORE_TYPE);
      seedMerchantsListQueryIfCached(queryClient, lat, lng, true, HOME_MERCHANTS_STORE_TYPE);
    }
  }, [
    queryClient,
    merchantsAnchorCoords?.latitude,
    merchantsAnchorCoords?.longitude,
  ]);

  // Imagery warm after first paint — never on the critical navigation path.
  useEffect(() => {
    const cachedCategories = readSyncUserAppCategories(HOME_CATEGORY_STORE_TYPE);
    if (cachedCategories) {
      void prefetchUserAppCategoryImagesAwait(
        cachedCategories.items ?? [],
        cachedCategories.allTab?.imageUrl
      );
    }
  }, []);

  const [vegSheetOpen, setVegSheetOpen] = useState(false);
  const [vegPopoverAnchor, setVegPopoverAnchor] = useState<VegPopoverAnchor | null>(null);
  const [vegFlash, setVegFlash] = useState<"on" | "off" | null>(null);
  const vegFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashVegMode = useCallback((kind: "on" | "off") => {
    if (vegFlashTimerRef.current) clearTimeout(vegFlashTimerRef.current);
    setVegFlash(kind);
    vegFlashTimerRef.current = setTimeout(() => {
      vegFlashTimerRef.current = null;
      setVegFlash(null);
    }, 420);
  }, []);
  useEffect(
    () => () => {
      if (vegFlashTimerRef.current) clearTimeout(vegFlashTimerRef.current);
    },
    []
  );
  const onVegChange = useCallback(
    (next: boolean) => {
      if (next) {
        // Veg Mode turns on only via popover/sheet Apply — never from the toggle alone.
        return;
      }
      setVegPopoverAnchor(null);
      turnOffVegMode();
      flashVegMode("off");
    },
    [turnOffVegMode, flashVegMode]
  );
  const onOpenVegPopover = useCallback((anchor: VegPopoverAnchor) => {
    setVegSheetOpen(false);
    setVegPopoverAnchor(anchor);
  }, []);

  const [openNow, setOpenNow] = useState(false);
  const [topBrands, setTopBrands] = useState(false);
  const [nearFast, setNearFast] = useState(false);
  const [flashDeals, setFlashDeals] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [gridFirstCategoryTabId, setGridFirstCategoryTabId] = useState("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [classicCustomizeItem, setClassicCustomizeItem] = useState<MenuItem | null>(null);
  const [classicCustomizeStore, setClassicCustomizeStore] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [classicCustomizeVisible, setClassicCustomizeVisible] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("any");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [filterHasOffers, setFilterHasOffers] = useState(false);
  const [noPackagingCharges, setNoPackagingCharges] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cachedMerchantsEntry = useMemo(() => {
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
    return entry?.items?.length ? entry : undefined;
  }, [merchantsAnchorCoords?.latitude, merchantsAnchorCoords?.longitude, vegOnly]);

  const cachedMerchantsInitial = cachedMerchantsEntry?.items;

  const {
    data: merchantsData,
    isLoading,
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
    // Paint as soon as we have a delivery pin. Sync cache fills first frame;
    // network refreshes in the background. Dietary hydrate must not delay cards.
    enabled:
      merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    initialData: cachedMerchantsInitial,
    // Force seed stale (same as grocery home) so mount always background-refetches.
    // A "fresh" MMKV paint of a partial list was locking Food Home on 1 store
    // while /v1/merchants already returned the full nearby set.
    initialDataUpdatedAt: cachedMerchantsInitial
      ? Date.now() - MERCHANTS_LIST_STALE_MS
      : undefined,
    staleTime: MERCHANTS_LIST_STALE_MS,
    gcTime: MERCHANTS_LIST_GC_MS,
    // Keep prior list across veg/geo key flips — pure-veg client filter narrows instantly.
    placeholderData: (previousData) => previousData,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  useEffect(() => {
    if (merchantsData?.length) {
      prefetchMerchantCardImages(merchantsData);
    }
  }, [merchantsData]);
  const offerLocationParams = useMemo(() => {
    return normalizeOfferLocationParams({
      pincode: address?.pincode?.trim() || undefined,
      state: address?.state?.trim() || undefined,
      city: address?.city?.trim() || undefined,
      lat: merchantsAnchorCoords?.latitude,
      lng: merchantsAnchorCoords?.longitude,
    });
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
    isFetched: featuredOffersFetched,
  } = useFeaturedOffersHome(
    offerLocationParams,
    Boolean(
      offerLocationParams.pincode ||
        offerLocationParams.state ||
        (merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null)
    )
  );

  const homeFeaturedOffers = featuredOffersData?.offers ?? [];
  const featuredOffersQueryEnabled = Boolean(
    offerLocationParams.pincode ||
      offerLocationParams.state ||
      (merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null)
  );

  useEffect(() => {
    if (gridFirstHeroMedia.length > 0) prefetchGridFirstHeroMedia(gridFirstHeroMedia);
    if (homeFeaturedOffers.length > 0) prefetchFeaturedOfferHeroImages(homeFeaturedOffers);
    prefetchMealsUnder250HeroMedia({
      gridFirstUnder250TabImageUrl,
      gridFirstUnder250HeroImageUrl,
      classicUnder250HeroImageUrl,
      classicUnder250TabImageUrl,
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

  useEffect(() => {
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

  const merchants = filterHiddenStores(
    filterPureVegMerchants(Array.isArray(merchantsData) ? merchantsData : [], vegOnly),
    hiddenIds
  );
  const hasDeliveryCoords =
    merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null;
  /** True when at least one ACTIVE store exists in the area (open or closed). Not tied to Open Now filter. */
  const hasStoresInArea = merchants.length > 0;
  /**
   * Only show "not serving" after a successful empty network response.
   * Never on error, or from a stale empty disk cache. Background refetch
   * must not flip this — that was remounting food home every 20–30s.
   */
  const merchantsDiscoverySettled = isFetched && !isError;
  const isNonServiceableScreen =
    hasDeliveryCoords && merchantsDiscoverySettled && !hasStoresInArea && !vegOnly;
  /** First load only. Settled empty (incl. veg) stays empty during refetch. */
  const listingSettledEmpty =
    hasDeliveryCoords &&
    isFetched &&
    !isLoading &&
    merchants.length === 0;
  const showMerchantsSkeleton =
    !isNonServiceableScreen && merchants.length === 0 && !listingSettledEmpty;
  const seedStatusesFromApi = useStoreStatusStore((s) => s.seedStatusesFromApi);
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

  // Seed open/closed from listing — never invent CLOSED when API omits status,
  // and never downgrade a realtime OPEN unless API explicitly says CLOSED.
  useEffect(() => {
    const prev = useStoreStatusStore.getState().statusMap;
    const rows: Array<{ storeId: string; isOpen?: boolean; liveStatus?: "OPEN" | "CLOSED" }> = [];
    for (const m of merchants) {
      const raw = (m.liveStatus ?? "").toString().trim().toUpperCase();
      const hasExplicit =
        raw === "OPEN" || raw === "CLOSED" || m.isOpen === true || m.isOpen === false;
      if (!hasExplicit) continue;
      const apiStatus = resolveMerchantLiveStatus(m, {});
      const existing = prev[m.id];
      if (existing === "OPEN" && apiStatus !== "OPEN") {
        if (raw !== "CLOSED") continue;
      }
      rows.push({ storeId: m.id, isOpen: apiStatus === "OPEN", liveStatus: apiStatus });
    }
    if (rows.length > 0) seedStatusesFromApi(rows);
  }, [merchants, seedStatusesFromApi]);

  useEffect(() => {
    if (merchants.length > 0) prefetchMerchantBanners(merchants);
  }, [merchants]);

  useFocusEffect(
    useCallback(() => {
      if (consumeFoodHomeFlashDealFilter()) {
        setFlashDeals(true);
        // Do not force Open Now — show full nearby list (open + closed).
      }
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        prioritizeVisibleMerchantBanners(12);
      });
      return () => task.cancel();
    }, [])
  );

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
        // Open Now = only open stores. Off = full nearby list (open + closed).
        hideClosed: openNow,
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

  const listMerchantsBase = isDiscoveryLayout ? topBrandMerchants : filteredAndSortedMerchants;

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

  // Warm Recommended-with-Deals banners before the rail mounts — avoids white tile flash.
  useEffect(() => {
    if (lovedByCustomers.length === 0) return;
    prefetchVisibleMerchantBanners(lovedByCustomers, 8);
  }, [lovedByCustomers]);

  const openRestaurantCountLabel = useMemo(
    () => openRestaurantsDeliveringLabel(merchants, statusMap),
    [merchants, statusMap]
  );

  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    resetFoodHomeListScrollGuard();
    foodFixDbg("LEAVE food", {
      source: "FoodMerchantsScreen.handleBack",
      method: underTabs ? "navigatePrimaryTab(index)" : "foodHomeRouterBack",
      from: underTabs ? "(tabs)/food" : "/home",
      target: underTabs ? "index" : "stack-back-or-home-tab",
      reason: "header-back",
      underTabs,
    });
    foodNavDbg("LEAVE", {
      source: "FoodMerchantsScreen.handleBack",
      method: underTabs ? "navigatePrimaryTab(index)" : "foodHomeRouterBack",
      from: underTabs ? "(tabs)/food" : "/home",
      to: underTabs ? "index" : "stack-back-or-/(tabs)/",
      reason: "header-back",
      underTabs,
    });
    if (underTabs) {
      navigatePrimaryTab("index", "FoodMerchantsScreen.handleBack", router);
      return;
    }
    foodHomeRouterBack(router);
  }, [router, underTabs]);
  const handleSearch = useCallback(() => {
    const classic = resolvedFoodHomeLayoutKey === "classic";
    // Do not clear onSearchPress here — that raced the press and could crash.
    useClassicFoodChromeStore.getState().setCategoriesSticky(false);
    router.push({
      pathname: "/search",
      params: {
        storeType: "FOOD",
        ...(classic ? { classic: "1" } : {}),
      },
    });
  }, [router, resolvedFoodHomeLayoutKey]);
  const handleLocationPress = () => router.push("/location");
  const handleCategorySelect = useCallback((id: string, slug: string) => {
    setActiveCategoryId(id);
    setGridFirstCategoryTabId(id);
    router.push({ pathname: "/home/category/[slug]", params: { slug, storeType: "FOOD" } });
  }, [router]);
  const handleMealsUnderPricePress = useCallback(
    (tile?: {
      id?: string;
      maxPrice?: number | null;
      heroImageUrl?: string | null;
      label?: string | null;
    }) => {
      const useClassic = resolvedFoodHomeLayoutKey === "classic";
      const defaultMax = useClassic
        ? classicUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice
        : gridFirstUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
      const defaultHero = useClassic
        ? classicUnder250HeroImageUrl
        : gridFirstUnder250HeroImageUrl;
      const defaultTitle = useClassic
        ? classicUnder250Title || DEFAULT_GRID_FIRST_UNDER_250.title
        : gridFirstUnder250Title || DEFAULT_GRID_FIRST_UNDER_250.title;
      // Ignore press-event objects from InstantPressable (no maxPrice/id).
      const fromTile =
        tile != null &&
        typeof tile === "object" &&
        ("maxPrice" in tile || "id" in tile || "label" in tile || "heroImageUrl" in tile);
      navigateToMealsUnderPrice(router, queryClient, {
        tileId: fromTile ? tile?.id : undefined,
        maxPrice: fromTile && tile?.maxPrice != null ? tile.maxPrice : defaultMax,
        heroImageUrl: fromTile ? tile?.heroImageUrl ?? defaultHero : defaultHero,
        title: fromTile ? tile?.label ?? defaultTitle : defaultTitle,
      });
    },
    [
      router,
      queryClient,
      resolvedFoodHomeLayoutKey,
      classicUnder250MaxPrice,
      classicUnder250HeroImageUrl,
      classicUnder250Title,
      gridFirstUnder250MaxPrice,
      gridFirstUnder250HeroImageUrl,
      gridFirstUnder250Title,
    ]
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
    resolvedFoodHomeLayoutKey === "grid_first" &&
    gridFirstUnder250Enabled &&
    gridFirstUnder250FilterLabel.trim().length > 0;

  const isClassicLayout = resolvedFoodHomeLayoutKey === "classic";
  const classicMealsMaxPrice =
    classicUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
  /**
   * Nested classic store rails must not be limited to “meals under ₹99” —
   * that gate left most nearby stores without grouped items and fell back to
   * grid GMRestaurantCardV2. Use a high cap so classic cards get real menu rails.
   */
  const classicStoreRailMaxPrice = Math.max(classicMealsMaxPrice, 999);
  const classicMealsTitle =
    classicUnder250Title.trim() ||
    DEFAULT_GRID_FIRST_UNDER_250.title ||
    `Meals under ₹${classicMealsMaxPrice}`;
  const classicMealsSectionEnabled =
    isClassicLayout && classicUnder250Enabled;

  const classicMealsQuery = useQuery({
    queryKey: [
      "classic-meals-under-price",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      classicMealsMaxPrice,
      vegOnly,
    ],
    enabled:
      isClassicLayout &&
      classicMealsSectionEnabled &&
      !isGridFirstLayout &&
      layoutReady &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
    queryFn: () =>
      fetchFoodItemsUnderPrice({
        lat: merchantsAnchorCoords!.latitude,
        lng: merchantsAnchorCoords!.longitude,
        maxPrice: classicMealsMaxPrice,
        limit: 48,
        vegOnly,
      }),
  });
  const classicMealsItems = classicMealsQuery.data ?? [];

  const classicGroupedStoresQuery = useQuery({
    queryKey: [
      "classic-store-rails-grouped",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      classicStoreRailMaxPrice,
      vegOnly,
    ],
    enabled:
      isClassicLayout &&
      !isGridFirstLayout &&
      layoutReady &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
    queryFn: () =>
      fetchFoodItemsUnderPriceGrouped({
        lat: merchantsAnchorCoords!.latitude,
        lng: merchantsAnchorCoords!.longitude,
        maxPrice: classicStoreRailMaxPrice,
        vegOnly,
        maxStores: 50,
        itemsPerStore: 10,
      }),
  });
  const classicStoreItemsById = useMemo(() => {
    const map = new Map<string, StoreFoodItemsUnderPrice>();
    for (const store of classicGroupedStoresQuery.data ?? []) {
      if (store.storePublicId) map.set(store.storePublicId, store);
    }
    return map;
  }, [classicGroupedStoresQuery.data]);

  /** Nearby outlets with at least one active FLASH_SALE item (for FLASH DEALS chip). */
  const flashDealsPresenceQuery = useQuery({
    queryKey: [
      "flash-deals-presence",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      vegOnly,
    ],
    enabled:
      layoutReady &&
      merchantsAnchorCoords?.latitude != null &&
      merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
    queryFn: () =>
      fetchFoodItemsUnderPriceGrouped({
        lat: merchantsAnchorCoords!.latitude,
        lng: merchantsAnchorCoords!.longitude,
        maxPrice: 5000,
        vegOnly,
        maxStores: 40,
        itemsPerStore: 6,
      }),
  });

  const flashDealStoreIds = useMemo(() => {
    const ids = new Set<string>();
    const pushStore = (store: StoreFoodItemsUnderPrice) => {
      if (!store.storePublicId) return;
      if (store.items.some((it) => it.flashSale != null)) ids.add(store.storePublicId);
    };
    for (const store of classicGroupedStoresQuery.data ?? []) pushStore(store);
    for (const store of flashDealsPresenceQuery.data ?? []) pushStore(store);
    for (const item of classicMealsItems) {
      if (item.flashSale != null && item.storePublicId) ids.add(item.storePublicId);
    }
    return ids;
  }, [classicGroupedStoresQuery.data, flashDealsPresenceQuery.data, classicMealsItems]);

  const showFlashDealsChip = flashDealStoreIds.size > 0;

  useEffect(() => {
    // Only clear once we know flash outlets are absent (avoid wiping promo-nav intent
    // before flash-deals-presence / classic items finish loading).
    if (
      flashDeals &&
      !showFlashDealsChip &&
      flashDealsPresenceQuery.isFetched &&
      !classicGroupedStoresQuery.isFetching
    ) {
      setFlashDeals(false);
    }
  }, [
    showFlashDealsChip,
    flashDeals,
    flashDealsPresenceQuery.isFetched,
    classicGroupedStoresQuery.isFetching,
  ]);

  const classicMerchantsById = useMemo(() => {
    const map = new Map<string, MerchantSummary>();
    for (const m of merchants) {
      if (m.id) map.set(m.id, m);
    }
    return map;
  }, [merchants]);

  const classicPopularFeaturedStores = useMemo(() => {
    if (!isClassicLayout) return [];
    return (classicGroupedStoresQuery.data ?? []).filter((store) =>
      isClassicPopularRatedStore(store, classicMerchantsById.get(store.storePublicId))
    );
  }, [isClassicLayout, classicGroupedStoresQuery.data, classicMerchantsById]);

  /** Classic: selected category filters this page (no /category redirect). */
  const classicCategoryFilterName = useMemo(() => {
    if (!isClassicLayout) return null;
    const id = gridFirstCategoryTabId;
    if (!id || id === "all") return null;
    return homeCategoryRailItems.find((c) => c.id === id)?.name ?? null;
  }, [isClassicLayout, gridFirstCategoryTabId, homeCategoryRailItems]);

  const classicFilteredMealsItems = useMemo(() => {
    // Under-₹X rail: hide only when we know the store is CLOSED.
    // Unknown / missing live status must still show — otherwise the whole
    // section vanishes before statusMap hydrates.
    const isNotClosed = (storePublicId: string) => {
      const merchant = classicMerchantsById.get(storePublicId);
      if (merchant) {
        return resolveMerchantLiveStatus(merchant, statusMap) !== "CLOSED";
      }
      const live = statusMap[storePublicId];
      return live !== "CLOSED";
    };

    const fromFlat = classicMealsItems.filter((item) => isNotClosed(item.storePublicId));
    if (fromFlat.length > 0) return fromFlat;

    // Fallback: flatten grouped store rails under the same price cap so the
    // section still paints when the flat endpoint is empty/slow.
    const fromGrouped: FoodItemUnderPrice[] = [];
    for (const store of classicStoreItemsById.values()) {
      if (!isNotClosed(store.storePublicId)) continue;
      for (const item of store.items) {
        if (item.price <= classicMealsMaxPrice) fromGrouped.push(item);
      }
    }
    fromGrouped.sort((a, b) => a.price - b.price);
    return fromGrouped.slice(0, 48);
  }, [
    classicMealsItems,
    classicMerchantsById,
    classicStoreItemsById,
    classicMealsMaxPrice,
    statusMap,
  ]);

  const listMerchants = useMemo(() => {
    let rows = listMerchantsBase;
    if (flashDeals && flashDealStoreIds.size > 0) {
      rows = rows.filter((m) => flashDealStoreIds.has(String(m.id)));
    }
    if (!isClassicLayout || !classicCategoryFilterName) return rows;
    const name = classicCategoryFilterName;
    return rows.filter((m) => {
      if (
        Array.isArray(m.cuisines) &&
        m.cuisines.some((c) => itemMatchesCategoryLabel({ name: c, itemTags: [] }, name))
      ) {
        return true;
      }
      const storeItems = classicStoreItemsById.get(m.id);
      if (storeItems?.items.some((i) => itemMatchesCategoryLabel(i, name))) return true;
      return false;
    });
  }, [
    isClassicLayout,
    classicCategoryFilterName,
    listMerchantsBase,
    classicStoreItemsById,
    flashDeals,
    flashDealStoreIds,
  ]);

  /** Classic explore: stores with any under-price items (photo or placeholder). */
  const classicExploreMerchants = useMemo(() => {
    if (!isClassicLayout) return listMerchants;
    return listMerchants.filter((m) => {
      const store = classicStoreItemsById.get(m.id);
      return Boolean(store?.items?.length);
    });
  }, [isClassicLayout, listMerchants, classicStoreItemsById]);

  const showClassicExploreSkeleton = useMemo(() => {
    if (!isClassicLayout) return false;
    if (classicExploreMerchants.length > 0) return false;
    if (showMerchantsSkeleton) return true;
    if (merchants.length === 0) return false;
    // Keep explore skeleton until store-rail grouped query settles — otherwise the
    // merchants list paints with zero classic cards (looks like “details not loading”).
    if (!classicGroupedStoresQuery.isFetched) return true;
    if (classicGroupedStoresQuery.isFetching && classicExploreMerchants.length === 0) {
      return true;
    }
    return false;
  }, [
    isClassicLayout,
    classicExploreMerchants.length,
    showMerchantsSkeleton,
    merchants.length,
    classicGroupedStoresQuery.isFetched,
    classicGroupedStoresQuery.isFetching,
  ]);

  const foodItemToMenuItem = useCallback((item: FoodItemUnderPrice): MenuItem => {
    return {
      id: item.itemId,
      menuItemId: item.menuItemPk,
      name: item.name,
      price: item.price,
      basePrice: item.basePrice ?? undefined,
      discountPercentage: item.discountPercentage ?? undefined,
      isVeg: item.isVeg,
      imageUrl: item.imageUrl ?? undefined,
      flashSale: item.flashSale
        ? {
            offer_id: item.flashSale.offerId,
            original_customer_unit: item.flashSale.originalCustomerUnit,
            flash_price: item.flashSale.flashPrice,
            max_flash_quantity: item.flashSale.maxFlashQuantity,
          }
        : undefined,
    };
  }, []);

  const openClassicItemSheet = useCallback(
    (item: FoodItemUnderPrice) => {
      const menuItem = foodItemToMenuItem(item);
      const configId = resolveFullConfigItemId(menuItem);
      // Warm RQ + memory cache before mount so the sheet skips a cold load.
      void prefetchMenuItemFullConfig(queryClient, item.storePublicId, configId);
      setClassicCustomizeStore({ id: item.storePublicId, name: item.storeName });
      setClassicCustomizeItem(menuItem);
      setClassicCustomizeVisible(true);
    },
    [foodItemToMenuItem, queryClient]
  );

  /** Finger-down on image/name — start full-config before the sheet mounts. */
  const warmClassicItemConfig = useCallback(
    (item: FoodItemUnderPrice) => {
      const menuItem = foodItemToMenuItem(item);
      const configId = resolveFullConfigItemId(menuItem);
      void prefetchMenuItemFullConfig(queryClient, item.storePublicId, configId);
    },
    [foodItemToMenuItem, queryClient]
  );

  // Prefetch first rail items in parallel so image→sheet rarely waits on cold load.
  useEffect(() => {
    if (!isClassicLayout || classicMealsItems.length === 0) return;
    const slice = classicMealsItems.slice(0, 10);
    for (const item of slice) {
      const id = String(item.itemId || item.menuItemPk || "").trim();
      if (!id) continue;
      void prefetchMenuItemFullConfig(queryClient, item.storePublicId, id).catch(() => {});
    }
  }, [isClassicLayout, classicMealsItems, queryClient]);

  // Warm store menus for under-₹X rail so home `+` → focus scroll is not blocked on cold fetch.
  useEffect(() => {
    if (!isClassicLayout || classicMealsItems.length === 0) return;
    const seen = new Set<string>();
    for (const item of classicMealsItems) {
      const id = String(item.storePublicId ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      prefetchMerchantDetail(queryClient, id);
      if (seen.size >= 8) break;
    }
  }, [isClassicLayout, classicMealsItems, queryClient]);

  const getClassicCartLineId = useCallback((item: FoodItemUnderPrice): string | null => {
    const state = useCartStore.getState();
    const id = item.itemId;
    const numId = item.menuItemPk != null ? String(item.menuItemPk) : null;
    const findIn = (items: typeof state.items) => {
      const line = items.find(
        (i) =>
          i.menuItemId === id ||
          i.menuItemId.startsWith(id + "_") ||
          (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_")))
      );
      return line?.lineId ?? null;
    };
    if (merchantCartMatchesRoute(state.merchantId, item.storePublicId)) {
      return findIn(state.items);
    }
    // Multi-store: line may live in a stashed cart until that store is activated.
    const want = String(item.storePublicId ?? "").trim();
    const stash =
      state.stashedCarts[want] ??
      Object.entries(state.stashedCarts).find(
        ([k]) => String(k).trim() === want
      )?.[1];
    if (!stash?.items?.length) return null;
    return findIn(stash.items);
  }, []);

  /**
   * Home rail `+`: add to cart immediately, then open the store and focus that dish.
   * Quantity steppers (qty > 0) still update cart on home.
   */
  const openClassicItemInStore = useCallback(
    (item: FoodItemUnderPrice) => {
      if (foodLocked) return;
      const focusItemId = String(item.itemId || item.menuItemPk || "").trim();
      if (!focusItemId || !item.storePublicId) return;
      // Billing/order APIs require numeric menu PK — never store public SKU as menuItemId.
      const cartMenuItemId =
        item.menuItemPk != null && Number.isFinite(item.menuItemPk) && item.menuItemPk > 0
          ? String(item.menuItemPk)
          : focusItemId;

      // Cart first so the store page already shows qty / stepper.
      useCartStore.getState().addItem(
        item.storePublicId,
        item.storeName,
        {
          menuItemId: cartMenuItemId,
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
          imageUrl: item.imageUrl ?? null,
        },
        1
      );
      const dock = useFloatingDockUiStore.getState();
      dock.setDockVisible(true, "cart");

      // Warm menu before push so focus scroll does not wait on a cold fetch.
      seedMerchantMenuQueryIfCached(queryClient, item.storePublicId);
      prefetchMerchantDetail(queryClient, item.storePublicId);

      const merchant = classicMerchantsById.get(item.storePublicId);
      navigateToMerchant(router, queryClient, item.storePublicId, merchant, {
        focusItemId,
      });
    },
    [classicMerchantsById, foodLocked, queryClient, router]
  );

  const ensureClassicCartActive = useCallback((storePublicId: string) => {
    const state = useCartStore.getState();
    if (merchantCartMatchesRoute(state.merchantId, storePublicId)) return true;
    return state.activateStashedCart(storePublicId);
  }, []);

  const incrementClassicItem = useCallback(
    (item: FoodItemUnderPrice) => {
      if (!ensureClassicCartActive(item.storePublicId)) return;
      const lineId = getClassicCartLineId(item);
      if (!lineId) return;
      // Flash Sale cap is soft — over-limit units use regular price in billing.
      useCartStore.getState().updateQuantity(lineId, 1);
    },
    [ensureClassicCartActive, getClassicCartLineId]
  );

  const decrementClassicItem = useCallback(
    (item: FoodItemUnderPrice) => {
      if (!ensureClassicCartActive(item.storePublicId)) return;
      const lineId = getClassicCartLineId(item);
      if (!lineId) return;
      useCartStore.getState().updateQuantity(lineId, -1);
    },
    [ensureClassicCartActive, getClassicCartLineId]
  );

  const handleClassicCustomizationAdd = useCallback(
    (params: {
      menuItemId: string;
      name: string;
      price: number;
      quantity: number;
      isVeg: boolean;
      basePrice?: number;
      variantId?: string;
      variantName?: string;
      variantSizeValue?: string | null;
      variantSizeUnit?: string | null;
      variantSizePreset?: string | null;
      addons?: Array<{
        addonId: string;
        customizationId?: string;
        addonName: string;
        addonPrice: number;
        quantity: number;
        addonSizeValue?: string | null;
        addonSizeUnit?: string | null;
        addonSizePreset?: string | null;
      }>;
      imageUrl?: string | null;
      specialInstructions?: string | null;
    }) => {
      if (!classicCustomizeStore) return;
      useCartStore.getState().addItem(
        classicCustomizeStore.id,
        classicCustomizeStore.name,
        {
          menuItemId: params.menuItemId,
          name: params.name,
          price: params.price,
          isVeg: params.isVeg,
          basePrice: params.basePrice,
          variantId: params.variantId,
          variantName: params.variantName,
          variantSizeValue: params.variantSizeValue,
          variantSizeUnit: params.variantSizeUnit,
          variantSizePreset: params.variantSizePreset,
          addons: params.addons,
          imageUrl: params.imageUrl ?? classicCustomizeItem?.imageUrl ?? null,
          specialInstructions: params.specialInstructions ?? null,
        },
        params.quantity
      );
      setClassicCustomizeVisible(false);
      setClassicCustomizeItem(null);
      setClassicCustomizeStore(null);
    },
    [classicCustomizeItem?.imageUrl, classicCustomizeStore]
  );

  useEffect(() => {
    if (!isClassicLayout || !classicMealsQuery.data?.length) return;
    const uris = classicMealsQuery.data
      .map((item) => toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 12);
    if (uris.length === 0) return;
    void Image.prefetch(uris, { cachePolicy: "memory-disk" }).catch(() => {});
  }, [isClassicLayout, classicMealsQuery.data]);

  useEffect(() => {
    // Grid meals-under card → prefetch grouped list (grid destination page).
    // Classic uses its own flat `classic-meals-under-price` query for the rail.
    if (!isGridFirstLayout || !showMealsUnderPriceChip) return;
    if (merchantsAnchorCoords?.latitude == null || merchantsAnchorCoords.longitude == null) return;
    const maxPrice = gridFirstUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
    void queryClient.prefetchQuery({
      queryKey: [
        "meals-under-price-grouped",
        "food-only",
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
    isGridFirstLayout,
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
    const fromPricesById = buildCategoryFromPriceMap(
      homeCategoryRailItems,
      classicMealsItems
    );
    // Show every CMS category; green FROM₹ pill only when that category has items.
    return (
      <ClassicFoodCategoryRail
        items={homeCategoryRailItems}
        activeId={gridFirstCategoryTabId}
        allTabLabel={categoryAllTab.label}
        allTabImageUrl={categoryAllTab.imageUrl}
        fromPricesById={fromPricesById}
        onSelectAll={() => setGridFirstCategoryTabId("all")}
        onSelect={(id) => {
          // Stay on Classic home — filter meals + restaurants in place.
          setGridFirstCategoryTabId(id);
        }}
      />
    );
  }, [
    categoryRailBootstrapping,
    homeCategoryRailItems,
    categoryRailLayout,
    classicMealsItems,
    gridFirstCategoryTabId,
    categoryAllTab.label,
    categoryAllTab.imageUrl,
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
  const handleOpenFilterSheet = useCallback(() => setFilterSheetVisible(true), []);

  // Publish Relevance|Filters handlers into the tab-bar edge row (discovery only).
  useEffect(() => {
    if (!isDiscoveryLayout) {
      useDiscoveryFloatingChromeStore.getState().clearChrome();
      return;
    }
    useDiscoveryFloatingChromeStore.getState().setChrome({
      sortBy,
      hasActiveFilters,
      onSortPress: handleClassicSortToggle,
      onFiltersPress: handleOpenFilterSheet,
    });
    return () => {
      useDiscoveryFloatingChromeStore.getState().clearChrome();
    };
  }, [
    isDiscoveryLayout,
    sortBy,
    hasActiveFilters,
    handleClassicSortToggle,
    handleOpenFilterSheet,
  ]);

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
    const sanitize = (value: string | null | undefined, fallback: string) => {
      const trimmed = value?.trim() || "";
      if (!trimmed || isRawCoordinateText(trimmed)) return fallback;
      return trimmed;
    };
    const clip = (value: string) => (value.length > 48 ? `${value.slice(0, 45)}…` : value);

    if (locationSource === "selected" && address) {
      const primary = sanitize(address.primary, "Home");
      const secondary = clip(
        sanitize(
          address.secondary || address.fullAddress,
          "Add delivery address"
        )
      );
      return { primary, secondary };
    }

    const resolved = resolveCheckoutDeliveryAddress(
      addresses,
      listingCoords ?? null,
      locationSource,
      locationSource === "selected" ? activeLocation : null
    );
    const primary = sanitize(resolved?.label || address?.primary, "Home");
    const secondary = clip(
      sanitize(
        resolved?.fullAddress || address?.secondary || address?.fullAddress,
        "Detecting address…"
      )
    );
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
    if (locationSyncKeyRef.current === "") {
      locationSyncKeyRef.current = syncKey;
      return;
    }
    if (locationSyncKeyRef.current === syncKey) return;
    locationSyncKeyRef.current = syncKey;
    if (vegOnly && isFetched && merchants.length === 0) return;
    if (locationSyncDebounceRef.current) clearTimeout(locationSyncDebounceRef.current);
    locationSyncDebounceRef.current = setTimeout(() => {
      locationSyncDebounceRef.current = null;
      // Coords already moved enough to change syncKey — refresh listings without 60s gate.
      invalidateFoodHomeListingQueriesAfterMove(queryClient);
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
    vegOnly,
    isFetched,
    merchants.length,
  ]);

  const foodHomeLayoutKey = resolvedFoodHomeLayoutKey;
  // Reserve gold strip until layout says otherwise — avoids category jump when CMS row arrives.
  const showGridFirstSubscriptionRow =
    isGridFirstLayout &&
    (layoutReady
      ? gridFirstSubscriptionRowEnabled && gridFirstSubscriptionRowText.trim().length > 0
      : DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.enabled);
  const useGridFirstCategoryTabs = isGridFirstLayout;

  const filterRowProps = useMemo(
    () => ({
      hasActiveFilters,
      sortBy,
      openNow,
      nearFast,
      filterHasOffers,
      showFlashDeals: showFlashDealsChip,
      flashDeals,
      topBrands,
      noPackagingCharges,
      showMealsUnderPriceChip: showMealsUnderPriceChip,
      mealsUnderPriceLabel: gridFirstUnder250FilterLabel,
      onOpenFilters: () => setFilterSheetVisible(true),
      onToggleSort: isGridFirstLayout ? handleGridFirstSortToggle : handleClassicSortToggle,
      onToggleOpenNow: () => setOpenNow((v) => !v),
      onToggleNearFast: handleNearFastToggle,
      onToggleFlashDeals: () => setFlashDeals((v) => !v),
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
      showFlashDealsChip,
      flashDeals,
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

  const classicFilterRowEl = useMemo(
    () => <FoodHomeFilterRow variant="classic" {...filterRowProps} />,
    [filterRowProps]
  );
  const classicCategoryRailMinHeight = 112;
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
  const gridFirstSkyHeightRef = useRef(0);

  // After first paint / tab slide — never block Food entry with status-bar layout work.
  useEffect(() => {
    if (!isGridFirstLayout || isNonServiceableScreen) return;
    setImmersiveStatusBarChrome(true);
    applyGridFirstStatusBarChrome(false);
  }, [
    isGridFirstLayout,
    isNonServiceableScreen,
    setImmersiveStatusBarChrome,
    applyGridFirstStatusBarChrome,
  ]);

  useEffect(() => {
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
      const task = InteractionManager.runAfterInteractions(() => {
        refreshVegCalendarDay();
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
          const vegEmptySettled = vegOnly && isFetched && merchants.length === 0;
          if (
            !vegEmptySettled &&
            Date.now() - merchantsDataUpdatedAt > MERCHANTS_LIST_STALE_MS
          ) {
            void refetch();
          }
          if (Date.now() - featuredOffersDataUpdatedAt > 5 * 60 * 1000) {
            void refetchFeaturedOffers();
          }
        }
      });
      return () => task.cancel();
    }, [
      queryClient,
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      merchantsDataUpdatedAt,
      featuredOffersDataUpdatedAt,
      refetch,
      refetchFeaturedOffers,
      refreshVegCalendarDay,
      vegOnly,
      isFetched,
      merchants.length,
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
        // Under main tabs, keep immersive soft chrome so tab-slide doesn't
        // flash a root status spacer. Stack /home → merchant still resets.
        if (segments[0] === "(tabs)") {
          useScreenChromeStore.setState({
            statusBarBackground: GatiMitraColors.softBackground,
            statusBarStyle: "dark",
            hideStatusBarSpacer: true,
          });
          setImmersiveStatusBarChrome(false);
          return;
        }
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [
      isGridFirstLayout,
      isNonServiceableScreen,
      setImmersiveStatusBarChrome,
      setStatusBarBackground,
      applyGridFirstStatusBarChrome,
      segments,
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
        NativeStatusBar.setBarStyle("light-content", true);
      }
      return () => {
        if (segments[0] === "(tabs)") {
          useScreenChromeStore.setState({
            statusBarBackground: GatiMitraColors.softBackground,
            statusBarStyle: "dark",
            hideStatusBarSpacer: true,
          });
          navigation.setOptions({ statusBarStyle: "dark" });
          return;
        }
        useScreenChromeStore.getState().resetStatusBarBackground();
        navigation.setOptions({ statusBarStyle: "dark" });
      };
    }, [isDiscoveryLayout, navigation, segments])
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
    () =>
      gridFirstSkyHeightForAspect(
        statusBarTopInset,
        windowWidth,
        windowHeight
      ),
    [statusBarTopInset, windowWidth, windowHeight]
  );
  // Keep last known hero-band across entries so main→food doesn't compact→expand
  // when featured offers resolve one frame later.
  const gridFirstHeroHasSlides = useMemo(() => {
    const detected = hasGridFirstHeroSlides(gridFirstHeroMedia, homeFeaturedOffers);
    // Prefer live media/layout signal — don't keep a full-sky reservation from a
    // previous visit while offers are still loading (that painted empty white).
    if (gridFirstHeroMedia.length > 0) {
      lastFoodHomeHadHeroSlides = detected;
      return detected;
    }
    if (featuredOffersFetched || !featuredOffersQueryEnabled) {
      lastFoodHomeHadHeroSlides = detected;
      return detected;
    }
    return false;
  }, [
    gridFirstHeroMedia,
    homeFeaturedOffers,
    featuredOffersFetched,
    featuredOffersQueryEnabled,
  ]);
  const [gridFirstHeaderBlockH, setGridFirstHeaderBlockH] = useState(
    gridFirstDefaultHeaderBlockHeight
  );
  // Compact (no-hero) sky = real header height only — not the taller hero overlay reserve.
  const gridFirstCompactSkyHeight =
    statusBarTopInset + HOME_HEADER_BELOW_STATUS_GAP + gridFirstHeaderBlockH;
  const [gridFirstMeasuredSkyHeight, setGridFirstMeasuredSkyHeight] = useState(
    () => statusBarTopInset + GRID_FIRST_HEADER_OVERLAY_H
  );
  const [gridFirstHeroReady, setGridFirstHeroReady] = useState(() => {
    const firstImage = gridFirstHeroMedia.find((m) => m.kind === "image" && m.url?.trim());
    return firstImage ? isHeroMediaSessionReady(firstImage.url) : false;
  });
  // Mount hero immediately — deferred mount caused a one-frame hero/category jump on entry.
  const allowHeroMount = true;
  /** Once the carousel reports an aspect-based height, don't clobber it with the default. */
  const gridFirstSkyMeasuredFromHeroRef = useRef(false);
  // Compact until the first hero slide is painted — reserving full height while
  // opacity:0 left a large white band under the search bar (categories jumped
  // less that way, but the empty gap was worse). Expand once ready.
  const gridFirstSkyHeight =
    gridFirstHeroHasSlides && gridFirstHeroReady
      ? Math.max(
          gridFirstSkyHeightDefault,
          gridFirstMeasuredSkyHeight > gridFirstCompactSkyHeight + 1
            ? gridFirstMeasuredSkyHeight
            : gridFirstSkyHeightDefault
        )
      : gridFirstCompactSkyHeight;
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

  // Only adjust for status-bar inset changes — never collapse a reserved hero band.
  useEffect(() => {
    const prevDefault = prevSkyDefaultRef.current;
    prevSkyDefaultRef.current = gridFirstSkyHeightDefault;
    const delta = gridFirstSkyHeightDefault - prevDefault;
    if (Math.abs(delta) < 1) return;
    setGridFirstMeasuredSkyHeight((prev) => {
      if (!gridFirstHeroHasSlidesRef.current) {
        return gridFirstCompactSkyHeight;
      }
      // Keep reserved full band; nudge by inset delta.
      const base = prev > gridFirstCompactSkyHeight + 1 ? prev : gridFirstSkyHeightDefault;
      return Math.max(gridFirstCompactSkyHeight, base + delta);
    });
  }, [gridFirstSkyHeightDefault, gridFirstCompactSkyHeight]);

  const onGridFirstHeroHeightChange = useCallback((h: number) => {
    if (!(h > 0)) return;
    // Layout height is UI-driven — clamp near the reserved default so decode
    // callbacks never reflow the category rail.
    const reserved = gridFirstSkyHeightRef.current;
    const next =
      reserved > gridFirstCompactSkyHeight + 1
        ? Math.abs(h - reserved) < 12
          ? h
          : reserved
        : h;
    gridFirstSkyMeasuredFromHeroRef.current = true;
    setGridFirstMeasuredSkyHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  }, [gridFirstCompactSkyHeight]);

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
    // Prefetched hero: paint immediately (no opacity-0 flash while decode already done).
    const firstImage = gridFirstHeroMedia.find((m) => m.kind === "image" && m.url?.trim());
    if (firstImage && isHeroMediaSessionReady(firstImage.url)) {
      setGridFirstHeroReady(true);
    }
    // Slides exist: keep the reserved full sky height (do not collapse while decoding).
    setGridFirstMeasuredSkyHeight((prev) =>
      prev > gridFirstCompactSkyHeight + 1 ? prev : gridFirstSkyHeightDefault
    );
  }, [
    gridFirstHeroHasSlides,
    gridFirstCompactSkyHeight,
    gridFirstSkyHeightDefault,
    gridFirstHeroMedia,
  ]);

  useEffect(() => {
    if (!gridFirstHeroHasSlides) return;
    // Media id refresh: keep reserved height; only reset ready paint via carousel.
    if (!gridFirstHeroReady) {
      gridFirstSkyMeasuredFromHeroRef.current = false;
    }
  }, [
    gridFirstHeroHasSlides,
    gridFirstHeroMedia.map((m) => m.id).join("|"),
    gridFirstHeroReady,
  ]);

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
    // Prefer computed Y from reserved sky height — onLayout y lags and jerks stickAt.
    const categoryBlockY = gridFirstSkyHeight + goldStripHeight;
    const categoryBlockHeight = Math.max(
      fallbackCategoryHeight,
      gridFirstCategoryLayout.height || 0
    );
    return {
      ...base,
      goldStripHeight,
      headerBlockHeight: gridFirstHeaderBlockH,
      categoryBlockY,
      categoryBlockHeight,
      filterBlockY:
        gridFirstFilterLayout.y > 0
          ? gridFirstFilterLayout.y
          : categoryBlockY + categoryBlockHeight,
      filterBlockHeight: gridFirstFilterLayout.height || GRID_FIRST_FILTER_ROW_H,
    };
  }, [
    statusBarTopInset,
    gridFirstSkyHeight,
    gridFirstGoldStripH,
    gridFirstCategoryLayout.height,
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
  const foodHomeFlashListRef = useRef<FlashList<MerchantSummary>>(null);

  useEffect(() => {
    const scrollToTop = () => {
      foodHomeFlashListRef.current?.scrollToOffset({ offset: 0, animated: false });
      gridFirstScrollY.value = 0;
    };
    registerFoodHomeListScroller(scrollToTop);
    return () => registerFoodHomeListScroller(null);
  }, [gridFirstScrollY]);
  const gridFirstSearchStickAtSv = useSharedValue(gridFirstSearchStickAt);
  const gridFirstCategoryStickAtSv = useSharedValue(gridFirstCategoryStickAt);
  const gridFirstFilterStickAtSv = useSharedValue(gridFirstFilterStickAt);
  const classicCategoryStickAtSv = useSharedValue(0);

  useEffect(() => {
    gridFirstSearchStickAtSv.value = gridFirstSearchStickAt;
    gridFirstCategoryStickAtSv.value = gridFirstCategoryStickAt;
    gridFirstFilterStickAtSv.value = gridFirstFilterStickAt;
  }, [
    gridFirstSearchStickAt,
    gridFirstCategoryStickAt,
    gridFirstFilterStickAt,
  ]);

  const onClassicOrGridScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Shared value only — no Zustand / setState on the scroll hot path.
      gridFirstScrollY.value = e.nativeEvent.contentOffset.y;
    },
    [gridFirstScrollY]
  );

  const onClassicCategoryStickyChange = useCallback((sticky: boolean) => {
    // Store-only — never setState on FoodMerchantsScreen mid-fling (that rebuilt FlashList).
    useClassicFoodChromeStore.getState().setCategoriesSticky(sticky);
  }, []);

  // Classic Food: Discovery-style HOME edge chrome.
  useEffect(() => {
    const active = isClassicLayout && isScreenFocused;
    useClassicFoodChromeStore.getState().setActive(active);
    return () => {
      useClassicFoodChromeStore.getState().setActive(false);
    };
  }, [isClassicLayout, isScreenFocused]);

  // Register search handler only — visibility comes from sticky + scroll-up.
  useEffect(() => {
    if (!isClassicLayout || !isScreenFocused) {
      useClassicFoodChromeStore.getState().setSearchPressHandler(null);
      return;
    }
    useClassicFoodChromeStore.getState().setSearchPressHandler(handleSearch);
    return () => {
      useClassicFoodChromeStore.getState().setSearchPressHandler(null);
    };
  }, [isClassicLayout, isScreenFocused, handleSearch]);

  const syncGridFirstScrollOffset = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      gridFirstScrollY.value = e.nativeEvent.contentOffset.y;
    },
    [gridFirstScrollY]
  );

  const onFoodHomeListScrollBegin = useCallback(() => {
    markFoodHomeListScrollActive();
    // Classic Food: expanded nav → collapse to HOME edge on any list scroll.
    // Does not navigate / change selected tab — chrome footing only.
    if (isClassicLayout) {
      useClassicFoodChromeStore.getState().onFoodScroll();
    }
  }, [isClassicLayout]);

  const onFoodHomeListScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncGridFirstScrollOffset(e);
      // Keep scroll-guard + decorative-animation pause through the fling.
      // Ending on finger-up (before momentum) briefly resumed card animations
      // mid-deceleration and made the list feel stuck / jerky.
      const vy = e.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(vy) < SCROLL_FLING_VELOCITY_EPS) {
        markFoodHomeListScrollEnded();
      }
    },
    [syncGridFirstScrollOffset]
  );

  const onFoodHomeListMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncGridFirstScrollOffset(e);
      markFoodHomeListScrollEnded();
    },
    [syncGridFirstScrollOffset]
  );

  // Never leave the global scroll flag stuck after unmount / mid-fling leave.
  useEffect(() => () => resetFoodHomeListScrollGuard(), []);

  const restaurantKeyExtractor = useCallback((item: MerchantSummary) => item.id, []);

  const renderRestaurantItem = useCallback<ListRenderItem<MerchantSummary>>(
    ({ item }) => {
      if (isDiscoveryLayout) {
        return (
          <DiscoveryRestaurantCard merchant={item} weatherDelayMinutes={weatherDelayMinutes} />
        );
      }
      if (isClassicLayout) {
        const storeItems = classicStoreItemsById.get(item.id);
        if (storeItems && storeItems.items.length > 0) {
          return (
            <ClassicStoreWithItemsCard
              store={storeItems}
              merchant={item}
              weatherDelayMinutes={weatherDelayMinutes}
              categories={homeCategoryRailItems}
              onPressStore={() => openMerchantPageGuarded(item.id, item)}
              onPressAdd={(foodItem) => {
                openClassicItemInStore(foodItem);
              }}
              onPressItem={openClassicItemSheet}
              onWarmItem={warmClassicItemConfig}
              onIncrement={incrementClassicItem}
              onDecrement={decrementClassicItem}
            />
          );
        }
        // Never fall back to grid GMRestaurantCardV2 on Classic.
        return null;
      }
      return (
        <GMRestaurantCardV2
          merchant={item}
          weatherDelayMinutes={weatherDelayMinutes}
          bottomSpacing={18}
        />
      );
    },
    [
      weatherDelayMinutes,
      isDiscoveryLayout,
      isClassicLayout,
      classicStoreItemsById,
      homeCategoryRailItems,
      openMerchantPageGuarded,
      openClassicItemInStore,
      openClassicItemSheet,
      warmClassicItemConfig,
      incrementClassicItem,
      decrementClassicItem,
    ]
  );

  const restaurantListExtraData = useMemo(
    () =>
      `${weatherDelayMinutes}:${foodLocked ? "1" : "0"}:${isDiscoveryLayout ? "d" : "c"}:${isClassicLayout ? "cl" : ""}:${classicStoreItemsById.size}:${classicCategoryFilterName ?? "all"}:${openNow ? "1" : "0"}:${topBrands ? "1" : "0"}:${nearFast ? "1" : "0"}:${flashDeals ? "1" : "0"}:${sortBy}:${filterHasOffers ? "1" : "0"}:${noPackagingCharges ? "1" : "0"}:${deliveryFilter}:${selectedCuisines.join(",")}`,
    [
      weatherDelayMinutes,
      foodLocked,
      isDiscoveryLayout,
      isClassicLayout,
      classicStoreItemsById.size,
      classicCategoryFilterName,
      openNow,
      topBrands,
      nearFast,
      flashDeals,
      sortBy,
      filterHasOffers,
      noPackagingCharges,
      deliveryFilter,
      selectedCuisines,
    ]
  );

  // While restaurants are still loading and hero media isn't ready, pin sticky
  // chrome so location/search never vanish into a blank white body.
  const pinChromeAtRest =
    isGridFirstLayout &&
    (!gridFirstHeroHasSlides || (showMerchantsSkeleton && !gridFirstHeroReady));

  useEffect(() => {
    if (!isGridFirstLayout) return;
    if (gridFirstScrollY.value > 16) return;
    foodHomeFlashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    gridFirstScrollY.value = 0;
  }, [gridFirstSkyHeight, pinChromeAtRest, isGridFirstLayout, gridFirstScrollY]);

  const gridFirstCategoryFlowStyle = useAnimatedStyle(() => {
    // No-hero: sticky chrome owns the rail from y=0 — keep in-flow as invisible spacer only.
    if (pinChromeAtRest) {
      return { opacity: 0 };
    }
    const stickAt = gridFirstCategoryStickAtSv.value;
    if (stickAt <= 1) {
      return { opacity: 1 };
    }
    // Crossfade with sticky chrome — same early snap, tight handoff (no jerk / double ghost).
    const early = 8;
    const handoff = 4;
    const snapY = Math.max(8, stickAt - early);
    return {
      opacity: interpolate(
        gridFirstScrollY.value,
        [snapY - handoff, snapY + handoff],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  }, [pinChromeAtRest]);

  const classicCategoryFlowStyle = useAnimatedStyle(() => {
    if (!isClassicLayout) {
      return { opacity: 1, pointerEvents: "box-none" as const };
    }
    const at = classicCategoryStickAtSv.value;
    const y = gridFirstScrollY.value;
    // Before stickAt is measured, keep the in-flow rail visible.
    if (!Number.isFinite(at) || at <= 1) {
      return { opacity: 1, pointerEvents: "box-none" as const };
    }
    // Same threshold as ClassicStickyCategoryChrome — when the pinned rail
    // appears, hide the scroll-flow copy so two identical rows never stack.
    const sticky = y >= Math.max(8, at - 8);
    return {
      opacity: sticky ? 0 : 1,
      pointerEvents: sticky ? ("none" as const) : ("box-none" as const),
    };
  }, [isClassicLayout]);

  /**
   * Fade the classic location/search header only after categories have stuck,
   * and only once it has fully scrolled under the sticky chrome — never leave
   * a transparent header shell in the gap under pinned cats.
   */
  const classicHeaderFlowStyle = useAnimatedStyle(() => {
    if (!isClassicLayout) return { opacity: 1 };
    const stickAt = classicCategoryStickAtSv.value;
    const y = gridFirstScrollY.value;
    if (!Number.isFinite(stickAt) || stickAt <= 1) return { opacity: 1 };
    // Header is fully above the viewport once y >= stickAt. Keep it opaque
    // until then so mid-scroll never punches a white hole.
    return { opacity: 1 };
  }, [isClassicLayout]);

  const gridFirstFilterFlowStyle = useAnimatedStyle(() => {
    // Filter chips stay in the scroll flow — never pin or fade with sticky chrome.
    return { opacity: 1 };
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
  const showLovedGrid = false;
  const showLovedHorizontal =
    foodHomeLayoutKey === "classic" || foodHomeLayoutKey === "grid_first";
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
        <StatusBar
          style="light"
          translucent
          backgroundColor={DiscoveryColors.bg}
          hidden={false}
        />
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
          vegOnly={vegToggleOn}
          onVegChange={onVegChange}
          onOpenVegPopover={onOpenVegPopover}
        />
      ) : !isGridFirstLayout && !isClassicLayout ? (
        <FoodHomeGridFirstHeader
          topInset={statusBarTopInset}
          locationPrimary={gridFirstLocationLabels.primary}
          locationSecondary={gridFirstLocationLabels.secondary}
          onLocationPress={handleLocationPress}
          onSearchPress={handleSearch}
          vegOnly={vegToggleOn}
          onVegChange={onVegChange}
          onOpenVegPopover={onOpenVegPopover}
          heroReady={false}
          highlightSearchPill
        />
      ) : null}

      <View style={[styles.contentWrap, isDiscoveryLayout && styles.discoveryContentWrap]}>
        {/* Always mount FlashList + chrome — never swap a boot-shell header (that
            was the main→food entry layout shift). Loading only fills list body. */}
        <FlashList
          ref={foodHomeFlashListRef}
          style={StyleSheet.flatten([styles.scroll, isDiscoveryLayout && styles.discoveryScroll])}
          data={
            showMerchantsSkeleton
              ? EMPTY_MERCHANTS
              : isClassicLayout
                ? classicExploreMerchants
                : listMerchants
          }
          keyExtractor={restaurantKeyExtractor}
          renderItem={renderRestaurantItem}
          extraData={restaurantListExtraData}
          // Off-screen buffer — keep moderate so fling stays smooth without decoding too many carousels.
          drawDistance={Math.max(1600, Math.round(windowHeight * 2.4))}
          overrideProps={{ initialDrawBatchSize: 10 }}
          contentInsetAdjustmentBehavior="never"
          decelerationRate={NATURAL_DECELERATION_RATE}
          overScrollMode="never"
          bounces={!isDiscoveryLayout}
          contentContainerStyle={{
            // Always reserve tab-chrome + Search pill clearance — sticky must not
            // change padding mid-fling (that resized content and killed momentum).
            paddingBottom: listBottomSafe + 16 + (isClassicLayout ? 38 + 12 + 8 : 0),
          }}
          showsVerticalScrollIndicator={false}
          // First-tap cards/chips must not wait for scroll gesture settle (mirror merchant menu).
          delaysContentTouches={false}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          removeClippedSubviews={false}
          onScroll={
            isGridFirstLayout || isClassicLayout ? onClassicOrGridScroll : undefined
          }
          scrollEventThrottle={32}
          onScrollBeginDrag={onFoodHomeListScrollBegin}
          onScrollEndDrag={onFoodHomeListScrollEndDrag}
          onMomentumScrollBegin={onFoodHomeListScrollBegin}
          onMomentumScrollEnd={onFoodHomeListMomentumEnd}
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
          {isClassicLayout ? (
            <Animated.View
              style={[classicHeaderFlowStyle, styles.classicHeaderShell]}
              pointerEvents="box-none"
              collapsable={false}
            >
              <FoodHomeGridFirstHeader
                topInset={statusBarTopInset}
                locationPrimary={gridFirstLocationLabels.primary}
                locationSecondary={gridFirstLocationLabels.secondary}
                onLocationPress={handleLocationPress}
                onSearchPress={handleSearch}
                vegOnly={vegToggleOn}
                onVegChange={onVegChange}
                onOpenVegPopover={onOpenVegPopover}
                heroReady={false}
                highlightSearchPill
              />
            </Animated.View>
          ) : null}
          {isGridFirstLayout ? (
            <View style={styles.gridFirstSkyBlock}>
              <View
                style={[
                  styles.gridFirstSkyInner,
                  !gridFirstHeroHasSlides && styles.gridFirstSkyInnerCompact,
                  { height: gridFirstSkyHeight, overflow: "hidden" },
                ]}
              >
                {gridFirstHeroHasSlides && allowHeroMount ? (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      height: gridFirstSkyHeightDefault,
                      // Paint only when decoded — sky stays compact until then
                      // so categories sit under the header with no white hole.
                      opacity: gridFirstHeroReady ? 1 : 0,
                    },
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
                    shouldPlay={isScreenFocused && gridFirstHeroReady}
                    onHeroHeightChange={onGridFirstHeroHeightChange}
                    onHeroReadyChange={onGridFirstHeroReadyChange}
                  />
                </View>
                ) : null}
                <View
                  style={[
                    styles.gridFirstHeaderOverlay,
                    { paddingTop: statusBarTopInset + HOME_HEADER_BELOW_STATUS_GAP },
                    pinChromeAtRest ? styles.gridFirstHeaderOverlayPinned : null,
                  ]}
                  pointerEvents={pinChromeAtRest ? "none" : "box-none"}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > statusBarTopInset + HOME_HEADER_BELOW_STATUS_GAP) {
                      const next =
                        h - statusBarTopInset - HOME_HEADER_BELOW_STATUS_GAP;
                      setGridFirstHeaderBlockH((prev) =>
                        Math.abs(prev - next) < 2 ? prev : next
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
                    vegOnly={vegToggleOn}
                    onVegChange={onVegChange}
                    onOpenVegPopover={onOpenVegPopover}
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
          ) : isDiscoveryLayout || isClassicLayout ? null : (
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
                enabled={
                  layoutReady
                    ? gridFirstSubscriptionRowEnabled
                    : DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.enabled
                }
                message={
                  gridFirstSubscriptionRowText.trim() ||
                  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text
                }
                backgroundColor={gridFirstSubscriptionRowBgColor}
              />
            </View>
          ) : isGridFirstLayout || isClassicLayout ? null : isDiscoveryLayout ? null : (
            <View style={styles.sectionGap} />
          )}

          {isGridFirstLayout ? (
            useGridFirstCategoryTabs ? (
              <View
                style={[
                  styles.categoryTabsSection,
                  pinChromeAtRest && styles.categoryTabsSectionTight,
                  {
                    height: gridFirstCategoryBlockHeight(categoryRailLayout.circle),
                    minHeight: gridFirstCategoryBlockHeight(categoryRailLayout.circle),
                  },
                ]}
                pointerEvents={pinChromeAtRest ? "none" : "box-none"}
                onLayout={(e) => {
                  const { height } = e.nativeEvent.layout;
                  if (height > 0) {
                    setGridFirstCategoryLayout((prev) =>
                      Math.abs(prev.height - height) < 1
                        ? prev
                        : { y: prev.y, height }
                    );
                  }
                }}
              >
                {/* No-hero: sticky chrome owns the rail — height spacer only (no ghost layer). */}
                {pinChromeAtRest ? null : (
                  <Animated.View style={gridFirstCategoryFlowStyle} pointerEvents="box-none">
                    {gridFirstCategoryTabsEl}
                  </Animated.View>
                )}
              </View>
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
            style={[styles.categoryRailSection, styles.classicCategoryRailSection]}
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              if (y > 0) {
                classicCategoryStickAtSv.value = y;
              }
            }}
            collapsable={false}
          >
            {/* Stay painted while scrolling under sticky — opacity:0 caused the white hole. */}
            <Animated.View style={classicCategoryFlowStyle} collapsable={false}>
              {classicCategoryRailEl}
            </Animated.View>
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
              style={[
                styles.section,
                styles.filterBar,
                styles.filterBarGridFirst,
                gridFirstFilterFlowStyle,
              ]}
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
              showFlashDeals={showFlashDealsChip}
              flashDeals={flashDeals}
              showFilterChips
              onToggleOpenNow={() => setOpenNow((v) => !v)}
              onToggleTopBrands={() => setTopBrands((v) => !v)}
              onToggleSort={handleClassicSortToggle}
              onToggleOffers={() => setFilterHasOffers((v) => !v)}
              onToggleNoPackaging={() => setNoPackagingCharges((v) => !v)}
              onToggleNearFast={handleNearFastToggle}
              onToggleFlashDeals={() => setFlashDeals((v) => !v)}
              onOpenFilters={() => setFilterSheetVisible(true)}
            />
          ) : isClassicLayout ? null : (
            <View style={[styles.section, styles.filterBar]}>
              {classicFilterRowEl}
            </View>
          )}

          {isClassicLayout && classicMealsSectionEnabled ? (
            <FoodHomeUnder250Section
              title={classicMealsTitle}
              items={classicFilteredMealsItems}
              loading={
                (classicMealsQuery.isLoading || classicGroupedStoresQuery.isLoading) &&
                classicFilteredMealsItems.length === 0
              }
              alwaysVisible
              priceSort="asc"
              onPressSeeAll={() => handleMealsUnderPricePress()}
              onPressItem={(item) => {
                openClassicItemSheet(item);
              }}
              onWarmItem={warmClassicItemConfig}
              onPressAdd={(item) => {
                openClassicItemInStore(item);
              }}
              onIncrement={incrementClassicItem}
              onDecrement={decrementClassicItem}
            />
          ) : null}

          {isClassicLayout && classicPopularFeaturedStores.length > 0 ? (
            <ClassicFeaturedStoreRail
              stores={classicPopularFeaturedStores}
              merchantsById={classicMerchantsById}
              weatherDelayMinutes={weatherDelayMinutes}
              onPressStore={(id, merchant) => openMerchantPageGuarded(id, merchant)}
            />
          ) : null}

          {isClassicLayout ? (
            <View style={[styles.section, styles.filterBar, styles.classicFilterAfterPopular]}>
              {classicFilterRowEl}
            </View>
          ) : null}

          {/* Loved by Customers — horizontal rail: 2 full + 3rd peek */}
          {!isClassicLayout &&
          (showMerchantsSkeleton || lovedByCustomers.length > 0) &&
          (showLovedGrid || showLovedHorizontal) ? (
            <View style={styles.lovedSection}>
              <AppText
                style={[
                  styles.sectionHeading,
                  isClassicLayout && styles.classicSectionHeading,
                ]}
              >
                {lovedSectionTitle}
              </AppText>
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
            <AppText
              style={[
                styles.sectionHeading,
                isClassicLayout && styles.classicSectionHeading,
              ]}
            >
              {isClassicLayout ? "Featured Restaurants" : "RESTAURANTS NEAR YOU"}
            </AppText>
            {foodLocked ? (
              <View style={styles.preventBanner}>
                <Ionicons name="shield-outline" size={16} color="#B91C1C" />
                <AppText style={styles.preventBannerText}>
                  Food ordering is restricted for this delivery location. Change address to continue.
                </AppText>
              </View>
            ) : null}
            {!showClassicExploreSkeleton && !showMerchantsSkeleton ? (
              <AppText style={styles.restaurantOpenCount}>{openRestaurantCountLabel}</AppText>
            ) : null}
          </View>
          )}
            </>
          }
          ListEmptyComponent={
            showClassicExploreSkeleton ? (
              <ClassicExploreRestaurantsSkeleton count={2} />
            ) : showMerchantsSkeleton ? (
              <FoodHomeListingSkeleton
                dark={isDiscoveryLayout}
                slogan={vegOnly ? "Finding 100% veg restaurants nearby" : undefined}
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
            <View style={isVegEmptyState ? styles.footerDock : undefined}>
              <BrandingFooter
                compact
                variant={isDiscoveryLayout ? "discovery" : "default"}
              />
            </View>
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
            vegOnly={vegToggleOn}
            onVegChange={onVegChange}
            onOpenVegPopover={onOpenVegPopover}
            categories={useGridFirstCategoryTabs ? gridFirstCategoryTabsEl : null}
            filters={undefined}
            enableCategorySticky={useGridFirstCategoryTabs}
            enableFilterSticky={false}
            pinAtRest={pinChromeAtRest}
          />
        ) : null}

        {isClassicLayout ? (
          <ClassicStickyCategoryChrome
            scrollY={gridFirstScrollY}
            stickAt={classicCategoryStickAtSv}
            topInset={statusBarTopInset}
            onStickyChange={onClassicCategoryStickyChange}
          >
            {classicCategoryRailEl}
          </ClassicStickyCategoryChrome>
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
      <VegModePopover
        visible={vegPopoverAnchor != null}
        anchor={vegPopoverAnchor}
        onClose={() => setVegPopoverAnchor(null)}
        onApplied={() => flashVegMode("on")}
        onMoreSettings={() => {
          setVegPopoverAnchor(null);
          setVegSheetOpen(true);
        }}
      />
      <VegModeSettingsSheet
        visible={vegSheetOpen}
        onClose={() => setVegSheetOpen(false)}
        onApplied={() => flashVegMode("on")}
      />
      <VegModeTransitionOverlay kind={vegFlash} />
      {classicCustomizeItem && classicCustomizeStore ? (
        <AppErrorBoundary
          source="classic-item-customize"
          resetKey={`${classicCustomizeStore.id}:${classicCustomizeItem.id}:${classicCustomizeVisible ? "1" : "0"}`}
          fallback={(retry) => (
            <Modal
              visible
              transparent
              animationType="fade"
              statusBarTranslucent
              presentationStyle="overFullScreen"
              onRequestClose={() => {
                setClassicCustomizeVisible(false);
                setClassicCustomizeItem(null);
                setClassicCustomizeStore(null);
                retry();
              }}
            >
              <View style={styles.customizeErrorWrap} pointerEvents="box-none">
                <Pressable
                  style={StyleSheet.absoluteFillObject}
                  onPress={() => {
                    setClassicCustomizeVisible(false);
                    setClassicCustomizeItem(null);
                    setClassicCustomizeStore(null);
                    retry();
                  }}
                />
                <View style={styles.customizeErrorCard}>
                  <AppText style={styles.customizeErrorTitle}>Couldn’t open item options</AppText>
                  <AppText style={styles.customizeErrorBody}>
                    Something went wrong loading this dish. Your cart is safe.
                  </AppText>
                  <TouchableOpacity
                    style={styles.customizeErrorBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      setClassicCustomizeVisible(false);
                      setClassicCustomizeItem(null);
                      setClassicCustomizeStore(null);
                      retry();
                    }}
                  >
                    <AppText style={styles.customizeErrorBtnText}>Close</AppText>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        >
          <ItemCustomizationSheet
            visible={classicCustomizeVisible}
            onClose={() => {
              setClassicCustomizeVisible(false);
              setClassicCustomizeItem(null);
              setClassicCustomizeStore(null);
            }}
            storeId={classicCustomizeStore.id}
            item={classicCustomizeItem}
            merchantName={classicCustomizeStore.name}
            onAdd={handleClassicCustomizationAdd}
          />
        </AppErrorBoundary>
      ) : null}
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
  gridFirstHeaderOverlayPinned: {
    opacity: 0,
  },
  nonServiceableContainer: {
    backgroundColor: NON_SERVICEABLE_STATUS_BAR_BG,
  },
  contentWrap: {
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  listingBootShell: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  listingBootShellDark: {
    backgroundColor: DiscoveryColors.bg,
  },
  listingBootHeader: {
    backgroundColor: "#FFFFFF",
    zIndex: 2,
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
  classicCategoryRailSection: {
    paddingVertical: 2,
    marginBottom: 2,
    overflow: "visible",
    backgroundColor: GatiMitraColors.softBackground,
  },
  classicHeaderShell: {
    backgroundColor: GatiMitraColors.softBackground,
  },
  categoryGridSection: {
    paddingVertical: 8,
    marginBottom: SECTION_GAP_SM,
  },
  categoryTabsSection: {
    paddingTop: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
    paddingBottom: 0,
    marginBottom: 0,
    marginTop: 0,
    backgroundColor: GRID_FIRST_PAGE_BG,
    overflow: "hidden",
  },
  categoryTabsSectionTight: {
    // Keep the same search→category gap as sticky chrome (spacer only, no tabs).
    paddingTop: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
    paddingBottom: 0,
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
  /** Halka gap under Popular Stores zig-zag — not cramped, not a big drop. */
  classicFilterAfterPopular: {
    marginTop: 10,
  },
  filterBarGridFirst: {
    // Slightly tighter category → filter gap.
    marginTop: -4,
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
  classicSectionHeading: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#1E3A5F",
    textTransform: "none",
    marginBottom: 10,
  },
  classicMealsPromoCard: {
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 10,
    backgroundColor: "#0F766E",
  },
  classicMealsPromoShade: {
    ...StyleSheet.absoluteFillObject,
  },
  classicMealsPromoTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
    marginBottom: 8,
    zIndex: 1,
  },
  classicMealsPromoCta: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 1,
  },
  classicMealsPromoCtaText: {
    color: "#0F766E",
    fontSize: 11,
    fontWeight: "800",
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
  customizeErrorWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.52)",
    paddingHorizontal: 28,
    zIndex: 200,
  },
  customizeErrorCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    backgroundColor: "#fff",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 10,
    alignItems: "center",
  },
  customizeErrorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  customizeErrorBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
  },
  customizeErrorBtn: {
    alignSelf: "stretch",
    marginTop: 8,
    backgroundColor: "#1B7A3D",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
  },
  customizeErrorBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
