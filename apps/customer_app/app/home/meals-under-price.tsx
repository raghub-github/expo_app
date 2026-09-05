import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Share, StatusBar as RNStatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FoodHomeCategoryTabs } from "@/components/home/FoodHomeCategoryTabs";
import { MealsUnderPriceStoreBlock } from "@/components/meals-under-price/MealsUnderPriceStoreBlock";
import {
  MEALS_UNDER_PRICE_FILTER_BAR_HEIGHT,
  MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT,
  MealsUnderPriceFilterRow,
  type MealsUnderPriceSortMode,
} from "@/components/meals-under-price/MealsUnderPriceFilterRow";
import { MealsUnderPriceSortSheet } from "@/components/meals-under-price/MealsUnderPriceSortSheet";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { getSellingPrice } from "@/components/store/storeMenuUtils";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useFoodHomeLayout } from "@/hooks/useFoodHomeLayout";
import {
  DEFAULT_GRID_FIRST_UNDER_250,
  parseGridFirstUnder250ImageUrl,
  parseDiscoveryDealsAtMaxPrice,
  resolveDiscoveryDealsAtMaxPrice,
} from "@/lib/foodHomeLayout";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { getSyncFoodHomeLayoutFromQueryClient } from "@/lib/foodHomeLayoutCache";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import {
  applyMenuPricesToStores,
  loadStoreMenuPriceMaps,
} from "@/lib/mealsUnderPriceMenuSync";
import {
  buildMealsUnderPriceShareMessage,
  buildMealsUnderPriceShareUrl,
} from "@/lib/mealsUnderPriceShare";
import { FOOD_HOME_FALLBACK, safeRouterBack } from "@/lib/safeRouterBack";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";
import {
  fetchUserAppCategoriesWithCache,
  readSyncUserAppCategories,
  getUserAppCategoriesCachedAt,
  seedUserAppCategoriesQueryIfCached,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";
import { merchantService, type MenuItem, type MerchantSummary } from "@/services/merchant.service";
import {
  fetchFoodItemsUnderPriceGrouped,
  type FoodItemUnderPrice,
  type StoreFoodItemsUnderPrice,
} from "@/services/foodHomeItemsUnderPrice.service";
import { addressService } from "@/services/address.service";
import { useActiveLocation } from "@/hooks/useAddresses";
import { type UserAppCategoryItem } from "@/services/userAppCategory.service";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useCartStore } from "@/store/cartStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { tryOpenFoodCheckoutSheet } from "@/lib/cartCheckoutGate";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";
import { MealsUnderPriceLoadingSkeleton } from "@/components/meals-under-price/MealsUnderPriceLoadingSkeleton";
import { MerchantDarkPalette, MerchantUiThemeProvider } from "@/features/merchant-detail/merchantUiTheme";
import { DiscoveryWaveDivider } from "@/features/discovery-home/DiscoveryWaveDivider";
import { filterVegSafeCategories, isMerchantPureVeg, textLooksNonVeg } from "@/lib/pureVegFilter";
import { textIncludes } from "@/lib/safe-text";

const STORE_TYPE = "FOOD";
const PAD = 16;
const FOOD_PAGE_STORE_TYPES = new Set([
  "FOOD",
  "RESTAURANT",
  "CLOUD_KITCHEN",
  "BAKERY",
  "CAFE",
]);

function isFoodPageStoreType(storeType: string | null | undefined): boolean {
  const st = String(storeType ?? "").trim().toUpperCase();
  if (!st) return true;
  return FOOD_PAGE_STORE_TYPES.has(st);
}

function dedupeCategories(rows: UserAppCategoryItem[]): UserAppCategoryItem[] {
  const byId = new Map<number, UserAppCategoryItem>();
  for (const r of rows) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
}

type SortMode = MealsUnderPriceSortMode;

function parseDeliveryMinutes(deliveryTime: string | null | undefined): number {
  if (!deliveryTime) return 9999;
  const match = deliveryTime.match(/(\d+)/);
  return match ? Number(match[1]) : 9999;
}

const MEALS_CARDS_PER_STORE = 8;
const MEALS_ITEMS_FETCH_PER_STORE = 8;

function resolveMenuItemForCart(
  item: FoodItemUnderPrice,
  menuByStore: Map<string, Map<string, MenuItem>> | undefined
): MenuItem {
  const fromMenu = menuByStore?.get(item.storePublicId)?.get(item.itemId);
  if (fromMenu) return fromMenu;
  return {
    id: item.itemId,
    menuItemId: item.menuItemPk,
    name: item.name,
    price: item.price,
    basePrice: item.basePrice ?? undefined,
    discountPercentage: item.discountPercentage ?? undefined,
    isVeg: item.isVeg,
    imageUrl: item.imageUrl ?? undefined,
  };
}

export default function MealsUnderPriceScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    tileId?: string | string[];
    maxPrice?: string | string[];
    title?: string | string[];
  }>();
  const paramTileId = Array.isArray(routeParams.tileId) ? routeParams.tileId[0] : routeParams.tileId;
  const paramMaxPriceRaw = Array.isArray(routeParams.maxPrice)
    ? routeParams.maxPrice[0]
    : routeParams.maxPrice;
  const paramTitle = Array.isArray(routeParams.title) ? routeParams.title[0] : routeParams.title;
  const queryClient = useQueryClient();
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const debouncedCoords = useDebouncedCoords(coords, 400);
  /** Match food home: selected pin instant, GPS debounced. */
  const listingCoords = useMemo(() => {
    if (locationSource === "selected" && coords) return coords;
    return debouncedCoords;
  }, [locationSource, coords, debouncedCoords]);
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60 * 1000,
  });
  const { data: activeLocation } = useActiveLocation();

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

  const {
    layoutKey,
    cachedLayoutKey,
    gridFirstUnder250MaxPrice,
    gridFirstUnder250Title,
    gridFirstUnder250HeroImageUrl,
    discoveryDealsAtMaxPrice,
    discoveryDealsAtHeroImageUrl,
    discoveryCtaTiles,
  } = useFoodHomeLayout(address, merchantsAnchorCoords);

  const isDiscoveryDark = (layoutKey ?? cachedLayoutKey) === "discovery";

  const mealsTile = useMemo(() => {
    if (!paramTileId) return null;
    return discoveryCtaTiles.find((tile) => tile.id === paramTileId && tile.action === "meals") ?? null;
  }, [discoveryCtaTiles, paramTileId]);

  const under250Price = gridFirstUnder250MaxPrice || DEFAULT_GRID_FIRST_UNDER_250.maxPrice;
  const maxPrice =
    parseDiscoveryDealsAtMaxPrice(paramMaxPriceRaw) ??
    mealsTile?.maxPrice ??
    (layoutKey === "discovery"
      ? resolveDiscoveryDealsAtMaxPrice(discoveryDealsAtMaxPrice, under250Price)
      : under250Price);
  const pageTitle =
    paramTitle?.trim() ||
    mealsTile?.label?.trim() ||
    (layoutKey === "discovery"
      ? `Deals at ₹${maxPrice}`
      : gridFirstUnder250Title?.trim() || DEFAULT_GRID_FIRST_UNDER_250.title);
  const layoutHints = useMemo(
    () => extractCustomerGeoHints(address, merchantsAnchorCoords),
    [address, merchantsAnchorCoords]
  );

  const syncLayout = useMemo(
    () => getSyncFoodHomeLayoutFromQueryClient(queryClient, layoutHints),
    [queryClient, layoutHints]
  );

  const heroImageUri = useMemo(() => {
    if (isDiscoveryDark) {
      const raw =
        mealsTile?.heroImageUrl?.trim() ||
        discoveryDealsAtHeroImageUrl?.trim() ||
        parseGridFirstUnder250ImageUrl(syncLayout?.discoveryDealsAtHeroImageUrl)?.trim() ||
        "";
      if (!raw) return null;
      return toAbsoluteImageUrl(raw) ?? raw;
    }
    const raw =
      gridFirstUnder250HeroImageUrl?.trim() ||
      parseGridFirstUnder250ImageUrl(syncLayout?.gridFirstUnder250HeroImageUrl)?.trim();
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [
    isDiscoveryDark,
    mealsTile?.heroImageUrl,
    discoveryDealsAtHeroImageUrl,
    gridFirstUnder250HeroImageUrl,
    syncLayout?.discoveryDealsAtHeroImageUrl,
    syncLayout?.gridFirstUnder250HeroImageUrl,
  ]);

  const heroTabImageUri = useMemo(() => {
    if (isDiscoveryDark) return null;
    const raw = parseGridFirstUnder250ImageUrl(syncLayout?.gridFirstUnder250TabImageUrl)?.trim();
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [isDiscoveryDark, syncLayout?.gridFirstUnder250TabImageUrl]);

  const heroImageHeight = Math.round(windowWidth / 1.55);
  const statusBarInset = Math.max(
    insets.top,
    Platform.OS === "android"
      ? (RNStatusBar.currentHeight ?? DEFAULT_STATUS_BAR_HEIGHT)
      : DEFAULT_STATUS_BAR_HEIGHT
  );
  // Hero bleeds up by `statusBarInset` (negative margin), so absolute `top` needs
  // 2× inset + gap to land below the status bar on screen.
  const heroTopBarOffset = statusBarInset * 2 + 14;

  const [scrollY, setScrollY] = useState(0);
  const [filterAnchorY, setFilterAnchorY] = useState(0);
  const stickyTitleTop = insets.top;
  const filterStickAt = Math.max(
    0,
    filterAnchorY - stickyTitleTop - MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT
  );
  const stickyFiltersVisible = filterAnchorY > 0 && scrollY >= filterStickAt - 1;
  const statusBarIconsLight =
    isDiscoveryDark || (Boolean(heroImageUri) && !stickyFiltersVisible);

  useLayoutEffect(() => {
    prefetchMealsUnder250HeroMedia(syncLayout);
    if (heroImageUri) {
      void Image.prefetch(heroImageUri, { cachePolicy: "memory-disk" });
    }
  }, [syncLayout, heroImageUri]);

  const checkoutSheetVisible = useCheckoutSheetStore((s) => s.visible);

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        RNStatusBar.setTranslucent(true);
        RNStatusBar.setBackgroundColor("transparent", true);
      }
      useScreenChromeStore.setState({
        hideStatusBarSpacer: true,
      });
      // Meals-under owns in-card View cart → checkout sheet; never the global dock.
      useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(true);
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
        // Only clear suppress if checkout sheet / gate is not open (View cart flow).
        const sheetOpen = useCheckoutSheetStore.getState().visible;
        const gateOpen = useCartCheckoutGateStore.getState().outsideRangeVisible;
        if (!sheetOpen && !gateOpen) {
          useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
        }
      };
    }, [])
  );

  useEffect(() => {
    RNStatusBar.setHidden(false, "none");
    if (Platform.OS === "android") {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor("transparent", true);
      RNStatusBar.setBarStyle(statusBarIconsLight ? "light-content" : "dark-content", true);
    }
    useScreenChromeStore.setState({
      statusBarBackground: isDiscoveryDark && !heroImageUri ? MerchantDarkPalette.bg : "transparent",
      statusBarStyle: statusBarIconsLight ? "light" : "dark",
      hideStatusBarSpacer: true,
    });
  }, [heroImageUri, isDiscoveryDark, statusBarIconsLight, checkoutSheetVisible]);

  const [categoryTabId, setCategoryTabId] = useState("all");
  const [sortBy, setSortBy] = useState<SortMode>("relevance");
  const [nearFast, setNearFast] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<MenuItem | null>(null);
  const [customizationStore, setCustomizationStore] = useState<StoreFoodItemsUnderPrice | null>(null);
  const [customizationVisible, setCustomizationVisible] = useState(false);

  useLayoutEffect(() => {
    seedUserAppCategoriesQueryIfCached(queryClient, STORE_TYPE);
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      seedUserAppCategoriesQueryIfCached(queryClient, STORE_TYPE);
    }, [queryClient])
  );

  const addItem = useCartStore((s) => s.addItem);

  const { data: categoriesResponse } = useQuery({
    queryKey: userAppCategoriesQueryKey(STORE_TYPE),
    queryFn: () => fetchUserAppCategoriesWithCache(STORE_TYPE),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
    initialData: () => readSyncUserAppCategories(STORE_TYPE),
    initialDataUpdatedAt: () => getUserAppCategoriesCachedAt(STORE_TYPE),
    placeholderData: (previousData) => previousData,
  });

  const resolvedCategoriesResponse =
    categoriesResponse ?? readSyncUserAppCategories(STORE_TYPE);

  const categoryItems = useMemo(() => {
    return filterVegSafeCategories(dedupeCategories(resolvedCategoriesResponse?.items ?? []), vegOnly).map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [resolvedCategoriesResponse?.items, vegOnly]);

  useEffect(() => {
    if (categoryTabId === "all") return;
    if (!categoryItems.some((c) => c.id === categoryTabId)) {
      setCategoryTabId("all");
    }
  }, [categoryItems, categoryTabId]);

  const allTab = resolvedCategoriesResponse?.allTab ?? { label: "All", imageUrl: null };

  const selectedCategoryName = useMemo(() => {
    if (categoryTabId === "all") return null;
    return categoryItems.find((c) => c.id === categoryTabId)?.name?.trim() ?? null;
  }, [categoryTabId, categoryItems]);

  const {
    data: groupedStores = [],
    isFetching,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      "meals-under-price-grouped",
      "food-only",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      maxPrice,
      vegOnly,
    ],
    queryFn: () =>
      fetchFoodItemsUnderPriceGrouped({
        lat: merchantsAnchorCoords!.latitude,
        lng: merchantsAnchorCoords!.longitude,
        maxPrice,
        vegOnly,
        maxStores: 15,
        itemsPerStore: MEALS_ITEMS_FETCH_PER_STORE,
      }),
    enabled: merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (previousData, previousQuery) => {
      const prevVeg = previousQuery?.queryKey?.[4];
      if (prevVeg !== vegOnly) return undefined;
      return previousData;
    },
    refetchOnMount: true,
  });

  const { data: merchantsData } = useQuery({
    queryKey: [
      "merchants-meals-under-price",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      vegOnly,
    ],
    queryFn: () =>
      merchantService.getMerchants({
        limit: 40,
        lat: merchantsAnchorCoords!.latitude,
        lng: merchantsAnchorCoords!.longitude,
        vegOnly,
        distanceMode: "road",
        storeType: "FOOD",
      }),
    enabled: merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    staleTime: 60_000,
  });

  useLayoutEffect(() => {
    const list = merchantsData ?? [];
    if (list.length > 0) {
      prefetchMerchantCardImages(list);
      prefetchMerchantBanners(list);
    }
  }, [merchantsData]);

  const merchantById = useMemo(() => {
    const map = new Map<string, MerchantSummary>();
    for (const m of merchantsData ?? []) map.set(m.id, m);
    return map;
  }, [merchantsData]);

  const enrichedStores = useMemo((): StoreFoodItemsUnderPrice[] => {
    return groupedStores.map((store) => {
      const merchant = merchantById.get(store.storePublicId);
      if (!merchant) return store;
      const deliveryTime =
        merchant.etaMinMinutes != null && merchant.etaMaxMinutes != null
          ? `${Math.round(merchant.etaMinMinutes)}-${Math.round(merchant.etaMaxMinutes)} mins`
          : store.deliveryTime;
      return {
        ...store,
        avgRating: merchant.avgRating ?? store.avgRating,
        totalReviews: merchant.totalReviews ?? store.totalReviews,
        deliveryTime: deliveryTime ?? merchant.deliveryTime ?? store.deliveryTime,
        distanceKm: merchant.distanceKm ?? store.distanceKm,
      };
    });
  }, [groupedStores, merchantById]);

  const filteredStores = useMemo(() => {
    const foodMerchantIds = new Set(
      (merchantsData ?? [])
        .filter((m) => isFoodPageStoreType(m.storeType))
        .map((m) => m.id)
    );
    let list = enrichedStores.filter((store) => {
      const merchant = merchantById.get(store.storePublicId);
      const st = String(merchant?.storeType ?? "").trim().toUpperCase();
      if (st === "GROCERY") return false;
      if (merchant && !isFoodPageStoreType(merchant.storeType)) return false;
      if (foodMerchantIds.size > 0 && !foodMerchantIds.has(store.storePublicId)) return false;
      return true;
    });
    if (vegOnly) {
      list = list.filter((store) => {
        const merchant = merchantById.get(store.storePublicId);
        if (merchant) return isMerchantPureVeg(merchant);
        return !textLooksNonVeg(store.storeName);
      });
    }
    if (selectedCategoryName) {
      const needle = selectedCategoryName.toLowerCase();
      list = list.filter((store) => {
        const merchant = merchantById.get(store.storePublicId);
        const cuisines = merchant?.cuisines?.map((c) => c.toLowerCase()) ?? [];
        if (cuisines.some((c) => c.includes(needle) || needle.includes(c))) return true;
        return store.items.some((item) => textIncludes(item.name, needle));
      });
    }
    if (nearFast) {
      list = [...list].sort(
        (a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)
      );
    } else if (sortBy === "distance") {
      list = [...list].sort(
        (a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)
      );
    } else if (sortBy === "rating") {
      list = [...list].sort(
        (a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0)
      );
    } else if (sortBy === "delivery_time") {
      list = [...list].sort(
        (a, b) =>
          parseDeliveryMinutes(a.deliveryTime) - parseDeliveryMinutes(b.deliveryTime)
      );
    }
    return list;
  }, [
    enrichedStores,
    selectedCategoryName,
    merchantById,
    merchantsData,
    nearFast,
    sortBy,
    vegOnly,
  ]);

  const storeIdsKey = useMemo(
    () => enrichedStores.map((s) => s.storePublicId).join("|"),
    [enrichedStores]
  );

  const { data: menuPriceMaps } = useQuery({
    queryKey: ["meals-under-price-menu-prices", storeIdsKey],
    queryFn: () => loadStoreMenuPriceMaps(enrichedStores.map((s) => s.storePublicId)),
    enabled: enrichedStores.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  const priceSyncedStores = useMemo(() => {
    const synced = applyMenuPricesToStores(filteredStores, menuPriceMaps ?? new Map());
    return synced
      .map((store) => ({
        ...store,
        items: store.items.slice(0, MEALS_CARDS_PER_STORE),
      }))
      .filter((store) => store.items.length > 0);
  }, [filteredStores, menuPriceMaps]);

  const handleBack = useCallback(() => {
    useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
    safeRouterBack(router, FOOD_HOME_FALLBACK);
  }, [router]);
  const handleShare = useCallback(async () => {
    try {
      const url = buildMealsUnderPriceShareUrl(maxPrice);
      const message = buildMealsUnderPriceShareMessage(pageTitle, url);
      await Share.share({ message, url, title: pageTitle });
    } catch {
      // user dismissed
    }
  }, [maxPrice, pageTitle]);

  const openCheckout = useCallback(() => {
    // Never show GlobalFloatingCart while leaving meals-under via View cart.
    useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(true);
    void tryOpenFoodCheckoutSheet(router, queryClient)
      .then((ok) => {
        if (ok) useCheckoutSheetStore.getState().show();
      })
      .catch(() => {
        useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
      });
  }, [queryClient, router]);

  const addMenuItemToCart = useCallback(
    (store: StoreFoodItemsUnderPrice, menuItem: MenuItem, quantity = 1) => {
      addItem(
        store.storePublicId,
        store.storeName,
        {
          menuItemId: String(menuItem.menuItemId ?? menuItem.id),
          name: menuItem.name,
          price: getSellingPrice(menuItem),
          isVeg: menuItem.isVeg,
          imageUrl: menuItem.imageUrl ?? null,
        },
        quantity
      );
    },
    [addItem]
  );

  const handleViewCart = useCallback(
    (item: FoodItemUnderPrice, store: StoreFoodItemsUnderPrice) => {
      const menuItem = resolveMenuItemForCart(item, menuPriceMaps);
      const needsCustomization = !!(
        menuItem.hasVariants ||
        menuItem.hasAddons ||
        menuItem.hasCustomizations
      );
      if (needsCustomization) {
        setCustomizationStore(store);
        setCustomizationItem(menuItem);
        setCustomizationVisible(true);
        return;
      }
      useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(true);
      addMenuItemToCart(store, menuItem, 1);
      requestAnimationFrame(() => {
        openCheckout();
      });
    },
    [addMenuItemToCart, menuPriceMaps, openCheckout]
  );

  const handleCustomizationAdd = useCallback(
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
      addons?: Array<{
        addonId: string;
        customizationId?: string;
        addonName: string;
        addonPrice: number;
        quantity: number;
        addonSizeValue?: string | null;
        addonSizeUnit?: string | null;
      }>;
      imageUrl?: string | null;
      specialInstructions?: string | null;
    }) => {
      if (!customizationStore) return;
      addItem(
        customizationStore.storePublicId,
        customizationStore.storeName,
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
          addons: params.addons,
          imageUrl: params.imageUrl ?? customizationItem?.imageUrl ?? null,
          specialInstructions: params.specialInstructions ?? null,
        },
        params.quantity
      );
      setCustomizationVisible(false);
      setCustomizationItem(null);
      setCustomizationStore(null);
      useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(true);
      openCheckout();
    },
    [addItem, customizationItem?.imageUrl, customizationStore, openCheckout]
  );

  const openStore = useCallback(
    (storePublicId: string) => {
      navigateToMerchant(router, queryClient, storePublicId);
    },
    [router, queryClient]
  );

  const hasAnchor =
    merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null;
  const showListLoading =
    hasAnchor && priceSyncedStores.length === 0 && (isPending || isFetching) && !isError;
  const showEmpty =
    hasAnchor && !isPending && !isFetching && priceSyncedStores.length === 0;

  const stickyChromeHeight =
    stickyTitleTop + MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT + MEALS_UNDER_PRICE_FILTER_BAR_HEIGHT;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const filterRowProps = {
    sortBy,
    nearFast,
    onPressSort: () => setSortSheetVisible(true),
    onToggleNearFast: () => setNearFast((v) => !v),
  };

  return (
    <MerchantUiThemeProvider dark={isDiscoveryDark}>
    <View style={[styles.screen, isDiscoveryDark && styles.screenDark]}>
      <StatusBar
        hidden={false}
        style={statusBarIconsLight ? "light" : "dark"}
        translucent
      />

      {stickyFiltersVisible ? (
        <View
          style={[
            styles.stickyHeader,
            isDiscoveryDark && styles.stickyHeaderDark,
            { height: stickyChromeHeight },
          ]}
        >
          <View style={[styles.stickyTitleBar, { paddingTop: stickyTitleTop }]}>
            <TouchableOpacity
              style={styles.stickyIconBtn}
              onPress={handleBack}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={isDiscoveryDark ? "#FFFFFF" : "#0F172A"} />
            </TouchableOpacity>
            <AppText style={[styles.stickyTitle, isDiscoveryDark && styles.stickyTitleDark]} numberOfLines={1}>
              {pageTitle}
            </AppText>
            <TouchableOpacity
              style={styles.stickyIconBtn}
              onPress={() => void handleShare()}
              accessibilityLabel="Share"
            >
              <Ionicons
                name="share-social-outline"
                size={20}
                color={isDiscoveryDark ? "#FFFFFF" : "#0F172A"}
              />
            </TouchableOpacity>
          </View>
          <MealsUnderPriceFilterRow {...filterRowProps} />
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View
          style={[
            styles.heroSection,
            isDiscoveryDark && styles.heroSectionDark,
            heroImageUri ? { marginTop: -statusBarInset } : null,
          ]}
        >
          {heroImageUri ? (
            <View style={[styles.heroBannerWrap, isDiscoveryDark && styles.heroBannerWrapDark]}>
              <Image
                source={{ uri: heroImageUri }}
                placeholder={heroTabImageUri ? { uri: heroTabImageUri } : undefined}
                style={[
                  styles.heroBanner,
                  { width: windowWidth, height: heroImageHeight + statusBarInset },
                ]}
                contentFit="cover"
                contentPosition="top"
                placeholderContentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
                recyclingKey="meals-under-price-hero"
              />
              {isDiscoveryDark ? (
                <View style={styles.heroWaveOverlay} pointerEvents="none">
                  <DiscoveryWaveDivider
                    width={windowWidth}
                    color={MerchantDarkPalette.bg}
                    fromBottom
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[styles.heroPlaceholder, isDiscoveryDark && styles.heroPlaceholderDark, { height: statusBarInset + 52 }]} />
          )}
          <View style={[styles.topBarOverlay, { top: heroTopBarOffset }]}>
            <TouchableOpacity
              style={styles.iconBtnOverlay}
              onPress={handleBack}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtnOverlay}
              onPress={() => void handleShare()}
              accessibilityLabel="Share"
            >
              <Ionicons name="share-social-outline" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={isDiscoveryDark ? { backgroundColor: MerchantDarkPalette.bg } : undefined}>
        <FoodHomeCategoryTabs
          items={categoryItems}
          allTabLabel={allTab.label}
          allTabImageUrl={allTab.imageUrl}
          activeId={categoryTabId}
          onActiveIdChange={setCategoryTabId}
          onSelect={(id) => setCategoryTabId(id)}
          showUnderPriceTab={false}
        />
        </View>

        <View style={styles.categoryTabsSpacer} />

        <View
          onLayout={(e) => {
            setFilterAnchorY(e.nativeEvent.layout.y);
          }}
        >
          <MealsUnderPriceFilterRow {...filterRowProps} />
        </View>

        {showListLoading ? (
          <MealsUnderPriceLoadingSkeleton listOnly />
        ) : showEmpty ? (
          <View style={styles.emptyWrap}>
            <AppText style={[styles.emptyTitle, isDiscoveryDark && styles.emptyTitleDark]}>
              {isError ? "Couldn’t load meals" : "No meals found nearby"}
            </AppText>
            <AppText style={[styles.emptySub, isDiscoveryDark && styles.emptySubDark]}>
              {isError
                ? "Check your connection and try again."
                : "Try another category or check back when more restaurants are open."}
            </AppText>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()}>
              <AppText style={styles.retryBtnText}>Refresh</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          priceSyncedStores.map((store) => (
            <MealsUnderPriceStoreBlock
              key={store.storePublicId}
              store={store}
              onPressItem={(storeId) => openStore(storeId)}
              onPressViewMenu={openStore}
              onPressViewCart={handleViewCart}
            />
          ))
        )}
      </ScrollView>

      <MealsUnderPriceSortSheet
        visible={sortSheetVisible}
        sortBy={sortBy}
        onClose={() => setSortSheetVisible(false)}
        onApply={setSortBy}
      />

      {customizationItem && customizationStore ? (
        <ItemCustomizationSheet
          visible={customizationVisible}
          onClose={() => {
            setCustomizationVisible(false);
            setCustomizationItem(null);
            setCustomizationStore(null);
          }}
          storeId={customizationStore.storePublicId}
          item={customizationItem}
          merchantName={customizationStore.storeName}
          storeMenu={
            menuPriceMaps?.get(customizationStore.storePublicId)
              ? [...menuPriceMaps.get(customizationStore.storePublicId)!.values()]
              : undefined
          }
          onAdd={handleCustomizationAdd}
        />
      ) : null}
    </View>
    </MerchantUiThemeProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  screenDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  heroSection: {
    position: "relative",
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  heroSectionDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  heroBannerWrap: {
    width: "100%",
    overflow: "hidden",
    paddingBottom: 0,
    backgroundColor: "#FFFFFF",
  },
  heroBannerWrapDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  heroWaveOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBanner: {
    alignSelf: "center",
  },
  heroPlaceholder: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  heroPlaceholderDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  topBarOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    zIndex: 10,
  },
  iconBtnOverlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryTabsSpacer: {
    height: 4,
  },
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  stickyHeaderDark: {
    backgroundColor: MerchantDarkPalette.bg,
    borderBottomColor: MerchantDarkPalette.border,
    shadowColor: "#000000",
  },
  stickyTitleBar: {
    height: MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
  },
  stickyIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginHorizontal: 8,
  },
  stickyTitleDark: {
    color: MerchantDarkPalette.text,
  },
  emptyWrap: {
    paddingHorizontal: PAD,
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyTitleDark: {
    color: MerchantDarkPalette.text,
  },
  emptySub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  emptySubDark: {
    color: MerchantDarkPalette.textMuted,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
