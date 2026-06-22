/**
 * Premium Restaurant Details & Menu – GatiMitra.
 * Smart header, offers, filters, sectioned menu, floating nav, persistent cart.
 * Data from merchant_menu_items via GET /v1/merchants/:id/menu.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Share,
  Alert,
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type View as RNView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { merchantService, type MenuItem, type MerchantSummary, setMenuItemBookmark } from "@/services/merchant.service";
import { previewEtaRange, formatEtaRange } from "@/lib/etaPreview";
import {
  buildStoreOpenStatusLabel,
} from "@/lib/storeOpenStatusLabel";
import { formatNextOpenTime, toTimestamp } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { offersService, type MerchantOfferItem, type PlatformOfferItem } from "@/services/offers.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import { getRoute } from "@/services/distance.service";
import { useStoreDeliveryQuote } from "@/hooks/useStoreDeliveryQuote";
import { useMenuItemBookmarks, useMenuItemBookmarkMutations } from "@/hooks/useMenuItemBookmarks";
import { addressService } from "@/services/address.service";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { useCartStore } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import { MerchantDetailSkeleton } from "@/components/ShimmerSkeleton";
import { GroupOrderStartSheet } from "@/components/GroupOrderStartSheet";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import {
  prefetchMenuItemFullConfig,
  prefetchMenuItemFullConfigsForMenu,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { StoreInfoCard, StoreHeroLogo } from "@/components/store/StoreInfoCard";
import { StoreFilterBar, type StoreFilterId } from "@/components/store/StoreFilterBar";
import {
  StoreFilterSheet,
  DEFAULT_STORE_MENU_FILTERS,
  type StoreMenuFilterState,
} from "@/components/store/StoreFilterSheet";
import { StorePastOrdersSection } from "@/components/store/StorePastOrdersSection";
import { StoreComboSection } from "@/components/store/StoreComboSection";
import {
  buildHighlyReorderedIds,
  mapOrderedTogetherPairsToCombos,
  buildOfferPriceTiers,
  filterMenuItems,
  hasActiveAdvancedFilters,
} from "@/components/store/storeMenuUtils";
import { StoreSectionHeader } from "@/components/store/StoreSectionHeader";
import { StoreFooterSection } from "@/components/store/StoreFooterSection";
import { StoreMenuFab } from "@/components/store/StoreMenuFab";
import {
  StoreMenuSheet,
  type MenuSheetScrollTarget,
  type StoreMenuSheetSection,
} from "@/components/store/StoreMenuSheet";
import { StoreOffersSheet } from "@/components/store/StoreOffersSheet";
import { StoreScheduleSheet } from "@/components/store/StoreScheduleSheet";
import type { PastOrderItem } from "@/components/store/StorePastOrderRow";
import { orderService } from "@/services/order.service";
import { billingService } from "@/services/billing.service";
import { cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import { CouponAvailableBottomSheet } from "@/components/checkout/CouponAvailableBottomSheet";
import {
  useCouponAvailablePrompt,
  type CouponAvailablePrompt,
} from "@/hooks/useCouponAvailablePrompt";
import { useCheckoutOfferStore } from "@/store/checkoutOfferStore";

/** Stable SectionList row id when the same dish appears in more than one section (RN keyExtractor is only (item, index)). */
type MenuListRow = MenuItem & { listRowKey: string };

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_IMAGE_HEIGHT = 196;
const HEADER_COLLAPSED_THRESHOLD = 100;
const FILTER_BAR_HEIGHT = 52;
const CART_BAR_HEIGHT = 64;
const MENU_FAB_HEIGHT = 48;

/**
 * Root `app/_layout.tsx` already draws the status bar strip above the stack — do not add
 * `insets.top` again. Hero + sticky rows use `MERCHANT_HEADER_TOP_GUTTER` only (0 = flush).
 */
const MERCHANT_HEADER_TOP_GUTTER = 0;
/** Sticky search row (controls + search pill) approximate height; keep in sync with styles. */
const MERCHANT_STICKY_HEADER_ROW_APPROX = 48;
/** `stickyHeaderBar` paddingBottom (10) + row + top gutter. */
const MERCHANT_STICKY_FILTER_TOP =
  MERCHANT_HEADER_TOP_GUTTER + MERCHANT_STICKY_HEADER_ROW_APPROX + 10;
const MENU_SCROLL_STICKY_OFFSET = MERCHANT_STICKY_FILTER_TOP + FILTER_BAR_HEIGHT + 6;
/** Approximate ListHeaderComponent height before first menu section. */
const MENU_LIST_HEADER_BEFORE_SECTIONS =
  HEADER_IMAGE_HEIGHT + 248 + FILTER_BAR_HEIGHT;
/** Scroll offset where the floating filter bar fades in (in-list filter has scrolled away). */
const STICKY_FILTER_SHOW_Y = HEADER_IMAGE_HEIGHT + 200;

/** Group menu by category_id / categoryName from DB. Section title = categoryName or fallback. */
function groupMenuByCategory(menu: MenuItem[]): { title: string; data: MenuItem[] }[] {
  const byKey = new Map<string, { title: string; data: MenuItem[] }>();
  menu.forEach((item) => {
    const name = (item.categoryName ?? item.category ?? "").trim() || "Other";
    const key = item.categoryId != null ? `id:${item.categoryId}` : `name:${name}`;
    if (!byKey.has(key)) byKey.set(key, { title: name, data: [] });
    byKey.get(key)!.data.push(item);
  });
  const sections = Array.from(byKey.values()).filter((s) => s.data.length > 0);
  if (sections.length === 0 && menu.length > 0) return [{ title: "Menu", data: menu }];
  return sections;
}

/** Build menu sections: smart sections (Recommended, Best in category) first, then DB categories. All from API/DB. */
function buildMenuSections(menu: MenuItem[]): { title: string; data: MenuItem[]; isSmart?: boolean }[] {
  const out: { title: string; data: MenuItem[]; isSmart?: boolean }[] = [];
  const recommended = menu.filter((m) => m.isRecommended);
  const popular = menu.filter((m) => m.isPopular);
  if (recommended.length > 0) {
    out.push({ title: "Recommended for you", data: recommended, isSmart: true });
  }
  if (popular.length > 0) {
    out.push({ title: "Best in category", data: popular, isSmart: true });
  }
  const categorySections = groupMenuByCategory(menu);
  categorySections.forEach((s) => out.push({ ...s, isSmart: false }));
  return out;
}

type MenuSection = { title: string; data: MenuItem[]; isSmart?: boolean };

/** Lowest priced in-stock menu item (falls back to next available if cheapest is OOS). */
function lowestAvailableMenuPrice(menu: MenuItem[]): number | null {
  const prices = menu
    .filter((m) => m.inStock !== false)
    .map((m) => m.price)
    .filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

function findSectionIndexForScrollTarget(
  secList: MenuSection[],
  target: MenuSheetScrollTarget
): { sectionIndex: number; itemIndex: number } | null {
  switch (target.kind) {
    case "past-orders":
    case "starting-at":
      return null;
    case "section-title": {
      const want = target.title.trim().toLowerCase();
      const idx = secList.findIndex((s) => s.title.trim().toLowerCase() === want);
      return idx >= 0 ? { sectionIndex: idx, itemIndex: 0 } : null;
    }
    case "category": {
      const normName = target.categoryName?.trim().toLowerCase();
      let idx = secList.findIndex(
        (s) => !s.isSmart && normName && s.title.trim().toLowerCase() === normName
      );
      if (idx < 0 && target.categoryId != null) {
        idx = secList.findIndex(
          (s) =>
            !s.isSmart && s.data.some((item) => item.categoryId === target.categoryId)
        );
      }
      if (idx < 0 && normName) {
        idx = secList.findIndex((s) => s.title.trim().toLowerCase() === normName);
      }
      return idx >= 0 ? { sectionIndex: idx, itemIndex: 0 } : null;
    }
    case "menu-item": {
      for (let s = 0; s < secList.length; s++) {
        const idx = secList[s].data.findIndex(
          (item) =>
            item.id === target.itemId ||
            (target.menuItemId != null && item.menuItemId === target.menuItemId)
        );
        if (idx >= 0) return { sectionIndex: s, itemIndex: idx };
      }
      return null;
    }
    default:
      return null;
  }
}

/** Animated SectionList refs may not expose scrollToOffset — use scroll responder fallback. */
function scrollSectionListToOffset(
  ref: React.RefObject<SectionList<MenuListRow> | null>,
  offset: number,
  animated = true
) {
  const list = ref.current as (SectionList<MenuListRow> & {
    scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
    getScrollResponder?: () => { scrollTo?: (opts: { y: number; animated?: boolean }) => void } | null;
  }) | null;
  if (!list) return;
  if (typeof list.scrollToOffset === "function") {
    list.scrollToOffset({ offset, animated });
    return;
  }
  const responder = list.getScrollResponder?.();
  if (responder && typeof responder.scrollTo === "function") {
    responder.scrollTo({ y: offset, animated });
    return;
  }
  list.scrollToLocation?.({
    sectionIndex: 0,
    itemIndex: 0,
    animated,
    viewOffset: 0,
  });
}

/** Measure anchor Y within the list header root (scroll offset for SectionList). */
function measureHeaderAnchor(
  anchorRef: React.RefObject<RNView | null>,
  rootRef: React.RefObject<RNView | null>,
  cb: (y: number) => void
) {
  const anchor = anchorRef.current;
  const root = rootRef.current;
  if (!anchor || !root) return;
  anchor.measureLayout(
    root,
    (_x, y) => cb(y),
    () => cb(0)
  );
}

function scheduleMenuScroll(run: () => void) {
  InteractionManager.runAfterInteractions(() => {
    run();
    setTimeout(run, 120);
    setTimeout(run, 360);
    setTimeout(run, 640);
  });
}

export default function MerchantDetailScreen() {
  const { id, openCart, focusItemId } = useLocalSearchParams<{
    id: string;
    openCart?: string;
    focusItemId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const merchantId = id ?? "";
  const sectionListRef = useRef<SectionList>(null);
  const headerRootRef = useRef<RNView>(null);
  const pastOrdersAnchorRef = useRef<RNView>(null);
  const startingAtAnchorRef = useRef<RNView>(null);
  const [filter, setFilter] = useState<StoreFilterId>("all");
  const [advancedFilters, setAdvancedFilters] = useState<StoreMenuFilterState>(DEFAULT_STORE_MENU_FILTERS);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [groupOrderSheetVisible, setGroupOrderSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [customizationSheetVisible, setCustomizationSheetVisible] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<MenuItem | null>(null);
  const focusItemHandledRef = useRef<string | null>(null);
  const pendingMenuNavRef = useRef<StoreMenuSheetSection | null>(null);
  const [highlightedMenuItemKey, setHighlightedMenuItemKey] = useState<string | null>(null);
  const [offersSheetVisible, setOffersSheetVisible] = useState(false);
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false);
  const [scheduledSlotLabel, setScheduledSlotLabel] = useState<string | null>(null);
  const [headerSearchExpanded, setHeaderSearchExpanded] = useState(false);
  const headerSearchExpandedSv = useSharedValue(false);
  const headerSearchInputRef = useRef<TextInput>(null);
  useEffect(() => {
    headerSearchExpandedSv.value = headerSearchExpanded;
  }, [headerSearchExpanded, headerSearchExpandedSv]);
  const openMerchantSearch = useCallback(() => {
    const y = useMerchantScrollStore.getState().scrollY;
    if (y > 48) {
      scrollSectionListToOffset(sectionListRef, 0, true);
    }
    setHeaderSearchExpanded(true);
    const delay = y > 48 ? 340 : 80;
    setTimeout(() => headerSearchInputRef.current?.focus(), delay);
  }, []);
  const closeMerchantSearch = useCallback(() => {
    setHeaderSearchExpanded(false);
    setMenuSearchQuery("");
  }, []);
  const scrollY = useSharedValue(0);

  const queryClient = useQueryClient();
  const { bookmarkMenuItemIdSet } = useMenuItemBookmarks(merchantId);
  const { syncMenuItemBookmark } = useMenuItemBookmarkMutations();
  const { data: merchant, isLoading, isError, refetch } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId),
    enabled: !!merchantId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!merchantId || !merchant?.menu?.length) return;
    prefetchMenuItemFullConfigsForMenu(queryClient, merchantId, merchant.menu);
  }, [merchantId, merchant?.menu, queryClient]);

  /** List screen often has displayImage already; detail payload can miss URLs — reuse for header banner. */
  const listCachedBanner = useMemo(() => {
    const entries = queryClient.getQueriesData<MerchantSummary[]>({ queryKey: ["merchants"] });
    for (const [, list] of entries) {
      if (!Array.isArray(list)) continue;
      const m = list.find((x) => x.id === merchantId);
      const u = m?.displayImage ?? m?.banner_url;
      if (u) return toAbsoluteImageUrl(u);
    }
    return null;
  }, [merchantId, queryClient]);

  /** Persisted on cart for floating / sheet hero (banner > list cache). */
  const cartMerchantBannerUrl = useMemo(() => {
    if (!merchant) return listCachedBanner;
    const m = merchant as MerchantSummary & { imageUrl?: string | null };
    const raw = m.displayImage ?? m.banner_url ?? m.imageUrl ?? null;
    if (raw) return toAbsoluteImageUrl(raw) ?? raw;
    return listCachedBanner;
  }, [merchant, listCachedBanner]);

  /** Header hero: primary banner only (never treated as “gallery” for looping). */
  const merchantBannerHeroUri = useMemo(() => {
    if (!merchant) return null;
    const raw =
      merchant.imageUrl ?? merchant.displayImage ?? merchant.banner_url ?? listCachedBanner ?? null;
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return (toAbsoluteImageUrl(t) ?? t).trim();
  }, [merchant, listCachedBanner]);

  /** Gallery URLs excluding the hero so “banner only” stays static; when non-empty, carousel loops. */
  const merchantGalleryBannerUris = useMemo(() => {
    if (!merchant) return [];
    const list = merchant.bannerImages ?? [];
    const hero = (merchantBannerHeroUri ?? "").trim();
    const trimmed = list
      .map((u) => {
        if (typeof u !== "string") return "";
        const x = u.trim();
        if (!x) return "";
        return (toAbsoluteImageUrl(x) ?? x).trim();
      })
      .filter(Boolean);
    if (!hero) return trimmed;
    return trimmed.filter((u) => u !== hero);
  }, [merchant?.id, merchant?.bannerImages, merchantBannerHeroUri]);

  /** Distance from the list API (already backend-computed). Used as a fast fallback while route loads. */
  const listCachedDistanceKm = useMemo(() => {
    const entries = queryClient.getQueriesData<MerchantSummary[]>({ queryKey: ["merchants"] });
    for (const [, list] of entries) {
      if (!Array.isArray(list)) continue;
      const m = list.find((x) => x.id === merchantId);
      const km = (m as { distanceKm?: number | null } | undefined)?.distanceKm ?? null;
      if (km != null && Number.isFinite(km)) return km;
    }
    return null;
  }, [merchantId, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (!merchantId) return;
      const updatedAt =
        queryClient.getQueryState({ queryKey: ["merchant", merchantId] })?.dataUpdatedAt ?? 0;
      if (Date.now() - updatedAt > 2 * 60 * 1000) {
        void queryClient.invalidateQueries({ queryKey: ["merchant", merchantId] });
      }
    }, [merchantId, queryClient])
  );

  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const locationAddress = useLocationStore((s) => s.address);
  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60 * 1000,
  });

  const deliveryCoords = useMemo(() => {
    // If user explicitly selected a location (saved/map pin), that is the delivery point for distance labels.
    if (coords && locationSource === "selected") {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    // Otherwise prefer backend "active location" (saved delivery address) over device GPS drift.
    if (activeLocation?.latitude != null && activeLocation.longitude != null) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }
    // Final fallback: whatever the current global coords are.
    return coords;
  }, [activeLocation?.latitude, activeLocation?.longitude, coords?.latitude, coords?.longitude, locationSource]);

  /**
   * Same drop coordinates as checkout/billing: when the map pin is "selected", snap to the saved
   * address within 250m (then active-location / default rules) so route km matches the bill.
   */
  const routingDropCoords = useMemo(() => {
    if (addresses.length === 0) return deliveryCoords;
    if (locationSource === "selected") {
      const resolved = resolveCheckoutDeliveryAddress(
        addresses,
        coords,
        locationSource,
        activeLocation
      );
      if (resolved) {
        return { latitude: resolved.latitude, longitude: resolved.longitude };
      }
    }
    return deliveryCoords;
  }, [
    addresses,
    coords?.latitude,
    coords?.longitude,
    locationSource,
    activeLocation?.latitude,
    activeLocation?.longitude,
    deliveryCoords?.latitude,
    deliveryCoords?.longitude,
  ]);

  /**
   * Canonical delivery-address id (snapped from pin/active location to saved address when possible).
   * Passing this to the backend makes distance_km + delivery_fee identical across every page
   * (home, search, store details, cart, checkout, order details, tracking).
   */
  const resolvedDeliveryAddress = useMemo(() => {
    return resolveCheckoutDeliveryAddress(addresses, coords, locationSource, activeLocation);
  }, [
    addresses,
    coords?.latitude,
    coords?.longitude,
    locationSource,
    activeLocation?.latitude,
    activeLocation?.longitude,
  ]);

  const { data: storeQuote } = useStoreDeliveryQuote({
    storeId: merchantId ?? "",
    addressId: resolvedDeliveryAddress?.id ?? null,
    drop:
      resolvedDeliveryAddress == null && routingDropCoords
        ? { lat: routingDropCoords.latitude, lng: routingDropCoords.longitude }
        : null,
    enabled: !!merchantId && (!!resolvedDeliveryAddress || !!routingDropCoords),
  });

  const pincode = locationAddress?.pincode ?? undefined;
  const state = locationAddress?.state ?? undefined;
  const city = locationAddress?.city ?? undefined;
  const offerLat = coords?.latitude ?? undefined;
  const offerLng = coords?.longitude ?? undefined;
  const { data: storeOffersData } = useQuery({
    queryKey: ["store-offers", merchantId, pincode, state, offerLat, offerLng],
    queryFn: () =>
      offersService.getStoreOffers({
        storeId: merchantId,
        pincode,
        state,
        city,
        lat: offerLat,
        lng: offerLng,
        serviceType: "FOOD",
      }),
    enabled: !!merchantId,
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
  const liveOffers: (MerchantOfferItem | PlatformOfferItem)[] = [
    ...(storeOffersData?.merchant_offers ?? []),
    ...(storeOffersData?.platform_offers ?? []),
  ];

  /** Inner page: full offer list (no free-delivery-only promos in the strip). */
  const visibleOffers = useMemo(
    () =>
      liveOffers.filter((o) => {
        const blob = `${o.label ?? ""} ${o.sub_label ?? ""}`.toLowerCase();
        return !/\bfree\s*delivery\b/.test(blob) && !/\bfree\s*del\b/.test(blob);
      }),
    [liveOffers]
  );

  const { data: myOrders = [] } = useQuery({
    queryKey: ["my-orders-store", merchantId],
    queryFn: () => orderService.getMyOrders({ limit: 40 }),
    enabled: !!merchantId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: similarMerchants = [] } = useQuery({
    queryKey: ["similar-merchants", merchantId, coords?.latitude, coords?.longitude],
    queryFn: () =>
      merchantService.getMerchants({
        lat: coords?.latitude,
        lng: coords?.longitude,
        limit: 8,
      }),
    enabled: !!merchantId && coords != null,
    staleTime: 5 * 60 * 1000,
  });

  const filteredSimilarMerchants = useMemo(
    () => similarMerchants.filter((m) => m.id !== merchantId).slice(0, 4),
    [similarMerchants, merchantId]
  );

  const pastOrderItems = useMemo((): PastOrderItem[] => {
    const menu = merchant?.menu;
    if (!menu?.length || !myOrders.length) return [];
    const menuByName = new Map(menu.map((m) => [(m.name ?? "").toLowerCase().trim(), m]));
    const storeName = (merchant?.name ?? "").toLowerCase().trim();
    const seen = new Set<string>();
    const out: PastOrderItem[] = [];
    for (const order of myOrders) {
      const storeMatch =
        order.merchantPublicStoreId === merchantId ||
        (order.merchantStoreId != null && String(order.merchantStoreId) === merchantId) ||
        (order.merchantName ?? "").toLowerCase().includes(storeName.slice(0, Math.min(8, storeName.length)));
      if (!storeMatch) continue;
      for (const line of order.items ?? []) {
        const key = (line.name ?? "").toLowerCase().trim();
        const menuItem = menuByName.get(key);
        if (!menuItem || seen.has(menuItem.id)) continue;
        seen.add(menuItem.id);
        out.push({ menuItem, orderedAt: order.createdAt });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [myOrders, merchant?.menu, merchant?.name, merchantId]);

  const { data: orderedTogetherRecs } = useQuery({
    queryKey: ["merchant", merchantId, "ordered-together-recs"],
    queryFn: () => merchantService.getOrderedTogetherRecommendations(merchantId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  });

  const comboPairs = useMemo(
    () => mapOrderedTogetherPairsToCombos(merchant?.menu ?? [], orderedTogetherRecs?.pairs ?? []),
    [merchant?.menu, orderedTogetherRecs?.pairs]
  );

  const coPurchaseByAnchorId = orderedTogetherRecs?.byAnchorItemId ?? {};

  const goesWithNameByItemId = useMemo(() => {
    const menu = merchant?.menu ?? [];
    if (!menu.length) return {} as Record<string, string>;
    const byPublicId = new Map(menu.map((m) => [m.id, m]));
    const byPk = new Map(menu.filter((m) => m.menuItemId != null).map((m) => [m.menuItemId!, m]));
    const out: Record<string, string> = {};
    for (const [anchorId, pairs] of Object.entries(coPurchaseByAnchorId)) {
      const pair = pairs[0];
      if (!pair) continue;
      const companion =
        byPublicId.get(pair.item2Id) ??
        byPk.get(pair.item2MenuItemPk) ??
        menu.find((m) => String(m.menuItemId) === String(pair.item2MenuItemPk));
      if (companion?.name) out[anchorId] = companion.name;
    }
    return out;
  }, [merchant?.menu, coPurchaseByAnchorId]);

  const highlyReorderedIds = useMemo(
    () =>
      buildHighlyReorderedIds(
        merchant?.menu ?? [],
        myOrders,
        merchantId,
        merchant?.name ?? ""
      ),
    [merchant?.menu, myOrders, merchantId, merchant?.name]
  );

  const showHighlyReorderedChip = highlyReorderedIds.size > 0;

  const offerPriceTiers = useMemo(
    () => buildOfferPriceTiers(merchant?.menu ?? []),
    [merchant?.menu]
  );

  const filtersActive = hasActiveAdvancedFilters(advancedFilters);

  const countForFilters = useCallback(
    (f: StoreMenuFilterState) =>
      filterMenuItems(merchant?.menu ?? [], {
        searchQuery: menuSearchQuery,
        highlyReorderedIds,
        advanced: f,
      }).length,
    [merchant?.menu, menuSearchQuery, highlyReorderedIds]
  );

  const handleFilterChange = useCallback((id: StoreFilterId) => {
    setFilter((prev) => (prev === id ? "all" : id));
  }, []);

  const merchantLogoUri = useMemo(() => {
    const m = merchant as { logo_url?: string | null; logoUrl?: string | null } | undefined;
    const raw = m?.logo_url ?? m?.logoUrl ?? null;
    return raw ? (toAbsoluteImageUrl(raw) ?? raw) : null;
  }, [merchant]);

  const offerTickerTexts = useMemo(() => {
    const fromApi = visibleOffers
      .map((o) => {
        const label = (o.label ?? "").trim();
        const sub = (o.sub_label ?? "").trim();
        if (!label) return null;
        return sub ? `${label} · ${sub}` : label;
      })
      .filter((x): x is string => !!x);
    if (fromApi.length > 0) return fromApi;
    const fallback = (merchant?.offerText ?? "").trim();
    return fallback ? [fallback] : [];
  }, [visibleOffers, merchant?.offerText]);

  // Kept for legacy fields (polyline for map) while we migrate to canonical quote.
  void getRoute;
  const routeResult = useMemo(
    () =>
      storeQuote
        ? {
            distanceKm: storeQuote.distance_km,
            etaMinutes: storeQuote.duration_min,
          }
        : null,
    [storeQuote]
  );
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items) ?? [];
  const cartMerchantId = useCartStore((s) => s.merchantId);
  const syncCartPrices = useCartStore((s) => s.syncPricesFromMap);

  const cartSubtotalForOffers = useMemo(() => {
    if (cartMerchantId !== merchantId) return 0;
    return (cartItems ?? []).reduce((s, i) => {
      const base = cartLineBaseUnitPrice(i);
      const line = base * i.quantity;
      const addonLine = (i.addons ?? []).reduce(
        (a, ad) => a + ad.addonPrice * ad.quantity * i.quantity,
        0
      );
      return s + line + addonLine;
    }, 0);
  }, [cartItems, cartMerchantId, merchantId]);

  const checkoutOffersQuery = useQuery({
    queryKey: [
      "billing-checkout-offers",
      merchantId,
      resolvedDeliveryAddress?.id,
      cartSubtotalForOffers,
      pincode,
      state,
    ],
    queryFn: () =>
      billingService.getCheckoutOffers({
        merchantId: merchantId!,
        addressId: String(resolvedDeliveryAddress!.id),
        cartSubtotal: cartSubtotalForOffers,
        serviceType: "FOOD",
        pincode,
        state,
        city,
      }),
    enabled:
      !!merchantId &&
      !!resolvedDeliveryAddress &&
      cartMerchantId === merchantId &&
      cartItems.length > 0,
    staleTime: 60 * 1000,
  });

  const setPendingCheckoutOffer = useCheckoutOfferStore((s) => s.setPending);

  const couponAvailablePrompt = useCouponAvailablePrompt({
    offersData: checkoutOffersQuery.data,
    offersFetching: checkoutOffersQuery.isFetching,
    cartSubtotal: cartSubtotalForOffers,
    hasAppliedOffer: false,
    blocked: offersSheetVisible || customizationSheetVisible,
  });

  const handleCouponAvailableApply = useCallback(
    (p: CouponAvailablePrompt) => {
      couponAvailablePrompt.dismiss(p.key);
      if (p.applyType === "coupon") {
        setPendingCheckoutOffer({
          type: "coupon",
          couponCode: p.couponCode,
          couponLabel: p.description ?? p.couponCode,
        });
      } else if (p.applyType === "merchant" && p.merchantOfferId != null) {
        setPendingCheckoutOffer({
          type: "merchant",
          merchantOfferId: p.merchantOfferId,
          couponCode: p.couponCode,
          couponLabel: p.merchantOfferTitle ?? p.couponCode,
        });
      } else if (p.applyType === "platform" && p.platformOfferId != null) {
        setPendingCheckoutOffer({
          type: "platform",
          platformOfferId: p.platformOfferId,
        });
      }
    },
    [couponAvailablePrompt, setPendingCheckoutOffer]
  );

  // Keep the floating-cart total in sync with the live menu — if commission
  // changed since the user added an item, the cart price for those items
  // updates as soon as the menu fetch returns fresh values.
  useEffect(() => {
    if (!merchant?.menu || cartItems.length === 0 || cartMerchantId !== merchantId) return;
    const priceById: Record<string, number> = {};
    for (const m of merchant.menu) {
      if (typeof m.price === "number" && Number.isFinite(m.price)) {
        priceById[m.id] = m.price;
      }
    }
    if (Object.keys(priceById).length > 0) syncCartPrices(priceById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.menu, syncCartPrices, cartMerchantId, merchantId]);

  const getQty = useCallback(
    (itemId: string, menuItemId?: number) => {
      if (cartMerchantId !== merchantId) return 0;
      const numId = menuItemId != null ? String(menuItemId) : null;
      return cartItems.reduce((sum, i) => {
        if (i.menuItemId === itemId || i.menuItemId.startsWith(itemId + "_")) return sum + i.quantity;
        if (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_"))) return sum + i.quantity;
        return sum;
      }, 0);
    },
    [cartMerchantId, merchantId, cartItems]
  );

  const handleAddItem = useCallback(
    (item: MenuItem) => {
      if (!merchant) return;
      const needsCustomization = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
      if (needsCustomization) {
        void prefetchMenuItemFullConfig(
          queryClient,
          merchantId,
          resolveFullConfigItemId(item)
        );
        setCustomizationItem(item);
        setCustomizationSheetVisible(true);
      } else {
        addItem(merchantId, merchant.name, {
          menuItemId: String(item.menuItemId != null ? item.menuItemId : item.id),
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
          imageUrl: item.imageUrl ?? null,
        }, 1, cartMerchantBannerUrl);
      }
    },
    [merchantId, merchant?.name, merchant, addItem, cartMerchantBannerUrl, queryClient]
  );

  const handleAddCombo = useCallback(
    (combo: { item1: MenuItem; item2: MenuItem }) => {
      handleAddItem(combo.item1);
      handleAddItem(combo.item2);
    },
    [handleAddItem]
  );

  const resolveMenuItemPk = useCallback((item: MenuItem): number | null => {
    if (item.menuItemId != null && Number.isFinite(item.menuItemId)) return item.menuItemId;
    const parsed = Number(item.id);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, []);

  const handleShareMenuItem = useCallback(
    (item: MenuItem) => {
      const storeName = merchant?.name ?? "Restaurant";
      const message = `${item.name} – ₹${Math.round(item.price)} at ${storeName}\nOrder on GatiMitra`;
      void Share.share({
        message,
        title: item.name,
      }).catch(() => {
        Alert.alert("Share dish", message);
      });
    },
    [merchant?.name]
  );

  const handleBookmarkMenuItem = useCallback(
    (item: MenuItem) => {
      const menuItemPk = resolveMenuItemPk(item);
      if (!merchantId || menuItemPk == null) return;

      const nextSaved = !bookmarkMenuItemIdSet.has(menuItemPk);
      const payload = {
        storeId: merchantId,
        menuItemId: menuItemPk,
        itemId: item.id,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        price: item.price,
        isVeg: item.isVeg,
        storeName: merchant?.name ?? "Restaurant",
      };

      syncMenuItemBookmark(payload, nextSaved);
      void (async () => {
        try {
          const result = await setMenuItemBookmark(merchantId, menuItemPk, nextSaved);
          if (result.saved !== nextSaved) {
            syncMenuItemBookmark(payload, !nextSaved);
          }
        } catch {
          syncMenuItemBookmark(payload, !nextSaved);
          Alert.alert("Could not save", "Please try again.");
        }
      })();
    },
    [bookmarkMenuItemIdSet, merchant?.name, merchantId, resolveMenuItemPk, syncMenuItemBookmark]
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
    }) => {
      if (!merchant) return;
      addItem(merchantId, merchant.name, {
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
      }, params.quantity, cartMerchantBannerUrl);
      setCustomizationSheetVisible(false);
      setCustomizationItem(null);
    },
    [merchantId, merchant, addItem, customizationItem, cartMerchantBannerUrl]
  );
  const getCartLineIdForItem = useCallback(
    (itemId: string, menuItemId?: number): string | null => {
      if (cartMerchantId !== merchantId) return null;
      const numId = menuItemId != null ? String(menuItemId) : null;
      const line = cartItems.find(
        (i) =>
          i.menuItemId === itemId ||
          i.menuItemId.startsWith(itemId + "_") ||
          (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_")))
      );
      return line?.menuItemId ?? null;
    },
    [cartMerchantId, merchantId, cartItems]
  );

  const handleIncrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      if (lineId) updateQuantity(lineId, 1);
    },
    [getCartLineIdForItem, updateQuantity]
  );
  const handleDecrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      if (lineId) updateQuantity(lineId, -1);
    },
    [getCartLineIdForItem, updateQuantity]
  );

  const sections = useMemo(() => {
    const menu = merchant?.menu;
    if (!menu || !Array.isArray(menu) || menu.length === 0) return [];
    const list = filterMenuItems(menu, {
      searchQuery: menuSearchQuery,
      quickFilter: filter,
      advanced: advancedFilters,
      highlyReorderedIds,
    });
    const raw = buildMenuSections(list);
    return raw.map((sec, sIdx) => ({
      ...sec,
      data: sec.data.map(
        (item, iIdx): MenuListRow => ({
          ...item,
          listRowKey: `${sIdx}-${String(item.menuItemId != null ? item.menuItemId : item.id)}-${iIdx}`,
        })
      ),
    }));
  }, [merchant?.menu, filter, menuSearchQuery, advancedFilters, highlyReorderedIds]);

  const totalMenuRows = useMemo(
    () => sections.reduce((sum, sec) => sum + sec.data.length, 0),
    [sections]
  );

  /** Wider render window + no clipping — avoids blank gaps while scrolling the menu. */
  const menuListVirtualization = useMemo(() => {
    const total = totalMenuRows;
    const renderAll = total > 0 && total <= 120;
    return {
      removeClippedSubviews: false as const,
      initialNumToRender: renderAll ? total : Math.min(Math.max(total, 28), 56),
      maxToRenderPerBatch: renderAll ? total : 28,
      windowSize: renderAll ? Math.max(21, Math.ceil(total / 6)) : 17,
      updateCellsBatchingPeriod: 16,
    };
  }, [totalMenuRows]);

  /** Full menu sections (no search/filters) — used by menu sheet index for exact scroll targets. */
  const catalogSections = useMemo((): MenuSection[] => {
    const menu = merchant?.menu;
    if (!menu || !Array.isArray(menu) || menu.length === 0) return [];
    return buildMenuSections(menu);
  }, [merchant?.menu]);

  const sectionStartingPrice = useMemo(
    () => lowestAvailableMenuPrice(merchant?.menu ?? []),
    [merchant?.menu]
  );

  const scrollToMenuTarget = useCallback(
    (target: MenuSheetScrollTarget, highlightItemId?: string | null) => {
      const stickyPad = MENU_SCROLL_STICKY_OFFSET;

      if (target.kind === "past-orders") {
        measureHeaderAnchor(pastOrdersAnchorRef, headerRootRef, (y) => {
          scrollSectionListToOffset(
            sectionListRef,
            Math.max(0, y - stickyPad),
            true
          );
        });
        return;
      }
      if (target.kind === "starting-at") {
        measureHeaderAnchor(startingAtAnchorRef, headerRootRef, (y) => {
          scrollSectionListToOffset(
            sectionListRef,
            Math.max(0, y - stickyPad),
            true
          );
        });
        return;
      }

      const secList = sections;
      const loc = findSectionIndexForScrollTarget(secList, target);
      if (!loc) return;

      if (highlightItemId) {
        setHighlightedMenuItemKey(highlightItemId);
        setTimeout(() => setHighlightedMenuItemKey(null), 2600);
      }

      const runScroll = () => {
        sectionListRef.current?.scrollToLocation({
          sectionIndex: loc.sectionIndex,
          itemIndex: loc.itemIndex,
          viewPosition: 0,
          animated: true,
          viewOffset: stickyPad,
        });
      };
      scheduleMenuScroll(runScroll);
    },
    [sections]
  );

  useEffect(() => {
    const pending = pendingMenuNavRef.current;
    if (!pending) return;
    if (filter !== "all" || menuSearchQuery.trim()) return;
    if (hasActiveAdvancedFilters(advancedFilters)) return;
    if (sections.length === 0) return;

    pendingMenuNavRef.current = null;
    scheduleMenuScroll(() => scrollToMenuTarget(pending.scrollTarget));
  }, [sections, filter, menuSearchQuery, advancedFilters, scrollToMenuTarget]);

  useEffect(() => {
    focusItemHandledRef.current = null;
    setHighlightedMenuItemKey(null);
    pendingMenuNavRef.current = null;
  }, [merchantId]);

  useEffect(() => {
    const target = focusItemId?.trim();
    if (!target) return;
    setFilter("all");
    setMenuSearchQuery("");
    setAdvancedFilters(DEFAULT_STORE_MENU_FILTERS);
  }, [focusItemId]);

  useEffect(() => {
    const target = focusItemId?.trim();
    if (!target || focusItemHandledRef.current === target) return;
    const sec = Array.isArray(sections) ? sections : [];
    if (sec.length === 0) return;

    let sectionIndex = -1;
    let itemIndex = -1;
    for (let s = 0; s < sec.length; s++) {
      const idx = sec[s].data.findIndex(
        (item) =>
          item.id === target ||
          (item.menuItemId != null && String(item.menuItemId) === target)
      );
      if (idx >= 0) {
        sectionIndex = s;
        itemIndex = idx;
        break;
      }
    }
    if (sectionIndex < 0) return;

    focusItemHandledRef.current = target;
    setHighlightedMenuItemKey(target);

    const scrollToItem = () => {
      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex,
        viewPosition: 0,
        animated: true,
        viewOffset: MENU_SCROLL_STICKY_OFFSET,
      });
    };

    const t1 = setTimeout(scrollToItem, 400);
    const t2 = setTimeout(scrollToItem, 720);
    const clearHighlight = setTimeout(() => setHighlightedMenuItemKey(null), 2600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(clearHighlight);
    };
  }, [focusItemId, sections]);

  useEffect(() => {
    const sec = Array.isArray(sections) ? sections : [];
    if (openCart !== "1" || !merchantId || cartMerchantId !== merchantId || sec.length === 0) return;
    const t = setTimeout(() => {
      const lastSection = sec.length - 1;
      if (lastSection < 0) return;
      sectionListRef.current?.scrollToLocation({
        sectionIndex: lastSection,
        itemIndex: 0,
        viewPosition: 1,
        viewOffset: 0,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [openCart, merchantId, cartMerchantId, sections.length]);

  const stickySearchHint = useMemo(() => {
    const n = (merchant?.name ?? "menu").trim();
    return n.length > 0 ? `Search in ${n}` : "Search menu";
  }, [merchant?.name]);

  const setMerchantScrollY = useMerchantScrollStore((s) => s.setScrollY);
  useEffect(() => () => setMerchantScrollY(0), [setMerchantScrollY]);

  // Update shared scrollY on the JS thread — avoids Reanimated SectionList onScroll object crash on RN 0.81.
  const handleMenuScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = e.nativeEvent.contentOffset.y;
    },
    [scrollY]
  );

  const commitMenuScrollY = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollY.value = y;
      setMerchantScrollY(y);
    },
    [scrollY, setMerchantScrollY]
  );

  /** In-list filters only near top of menu — never peek under sticky header while scrolling up. */
  const inListFilterVisibilityStyle = useAnimatedStyle(() => {
    if (headerSearchExpandedSv.value) {
      return { opacity: 1, maxHeight: FILTER_BAR_HEIGHT };
    }
    if (scrollY.value <= STICKY_FILTER_SHOW_Y - 36) {
      return { opacity: 1, maxHeight: FILTER_BAR_HEIGHT };
    }
    return { opacity: 0, maxHeight: 0, overflow: "hidden" as const };
  });

  const stickyHeaderVisible = useAnimatedStyle(() => {
    if (headerSearchExpandedSv.value) {
      return { opacity: 1 };
    }
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_COLLAPSED_THRESHOLD - 20, HEADER_COLLAPSED_THRESHOLD],
      [0, 0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const stickyHeaderBgOpacity = useAnimatedStyle(() => {
    if (headerSearchExpandedSv.value) {
      return { opacity: 1 };
    }
    const opacity = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD, HEADER_COLLAPSED_THRESHOLD + 30],
      [0.88, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const totalInCart = (cartItems ?? []).reduce((n, i) => n + i.quantity, 0);
  const cartTotal = (cartItems ?? []).reduce((n, i) => n + i.price * i.quantity, 0);

  const listContentContainerStyle = useMemo(
    () => ({
      paddingBottom:
        totalInCart > 0
          ? 56 + MENU_FAB_HEIGHT + 40 + insets.bottom + 14
          : MENU_FAB_HEIGHT + 88 + insets.bottom,
    }),
    [totalInCart, insets.bottom]
  );

  const openOffersSheet = useCallback(() => setOffersSheetVisible(true), []);
  const closeOffersSheet = useCallback(() => setOffersSheetVisible(false), []);
  const openScheduleSheet = useCallback(() => setScheduleSheetVisible(true), []);
  const closeScheduleSheet = useCallback(() => setScheduleSheetVisible(false), []);
  const openOptionsSheet = useCallback(() => setOptionsSheetVisible(true), []);
  const closeOptionsSheet = useCallback(() => setOptionsSheetVisible(false), []);
  const openReportSheet = useCallback(() => {
    setOptionsSheetVisible(false);
    setReportSheetVisible(true);
  }, []);
  const closeReportSheet = useCallback(() => setReportSheetVisible(false), []);

  const liveStatusFromStore = useStoreStatusStore((s) => s.statusMap[merchantId] ?? null);

  const merchantNextOpenAt =
    (merchant as { nextOpenAt?: string | number | null } | undefined)?.nextOpenAt ?? null;
  const merchantNextCloseAt =
    (merchant as { nextCloseAt?: string | number | null } | undefined)?.nextCloseAt ?? null;
  const scheduleTickEnabled =
    toTimestamp(merchantNextOpenAt) != null || toTimestamp(merchantNextCloseAt) != null;
  const scheduleNow = useScheduleTick(scheduleTickEnabled);

  const merchantLiveStatus = (merchant as { liveStatus?: "OPEN" | "CLOSED" } | undefined)?.liveStatus;
  const isStoreClosedForStatus =
    merchant != null &&
    (liveStatusFromStore ?? merchantLiveStatus ?? "CLOSED") === "CLOSED";

  const openStatusLabel = useMemo(
    () =>
      buildStoreOpenStatusLabel({
        isOpen: merchant != null && !isStoreClosedForStatus,
        nextOpenAt: merchantNextOpenAt,
        nextCloseAt: merchantNextCloseAt,
        nowMs: scheduleNow,
      }),
    [
      merchant,
      isStoreClosedForStatus,
      merchantNextOpenAt,
      merchantNextCloseAt,
      scheduleNow,
    ]
  );

  useEffect(() => {
    if (merchant?.id != null && (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus != null) {
      useStoreStatusStore.getState().setStatusFromApi(
        merchant.id,
        (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus === "OPEN",
        (merchant as { liveStatus?: "OPEN" | "CLOSED" }).liveStatus
      );
    }
  }, [merchant?.id, (merchant as { liveStatus?: "OPEN" | "CLOSED" })?.liveStatus]);

  const handleShareRestaurant = useCallback(async () => {
    closeOptionsSheet();
    try {
      await Share.share({
        message: `${merchant?.name ?? "Restaurant"} – order on GatiMitra`,
        title: merchant?.name ?? "Restaurant",
      });
    } catch (_) {}
  }, [merchant?.name, closeOptionsSheet]);

  const handleReportSubmit = useCallback(
    async (reportType: string) => {
      if (!merchantId) return;
      setReportSubmitting(true);
      try {
        await merchantService.reportRestaurant(merchantId, { report_type: reportType });
        closeReportSheet();
        Alert.alert("Thank you", "Your report has been submitted.");
      } catch {
        Alert.alert("Error", "Could not submit report. Try again.");
      } finally {
        setReportSubmitting(false);
      }
    },
    [merchantId, closeReportSheet]
  );

  const REPORT_OPTIONS = [
    { id: "inaccurate_photos", label: "Inaccurate photos or descriptions" },
    { id: "pricing_issues", label: "Pricing related issues" },
    { id: "items_missing", label: "Items are missing in the menu" },
    { id: "other", label: "I have some other issue" },
  ] as const;

  const menuSheetSections = useMemo((): StoreMenuSheetSection[] => {
    const rows: StoreMenuSheetSection[] = [];
    if (pastOrderItems.length > 0) {
      rows.push({
        id: "past-orders",
        title: "Your Orders and Collections",
        count: pastOrderItems.length,
        scrollTarget: { kind: "past-orders" },
      });
    }
    if (sectionStartingPrice != null) {
      const menu = merchant?.menu ?? [];
      const atOrBelow = menu.filter(
        (m) =>
          m.inStock !== false &&
          Math.round(m.price) <= Math.round(sectionStartingPrice)
      ).length;
      rows.push({
        id: "starting-at",
        title: `Items starting at ₹${Math.round(sectionStartingPrice)}`,
        count: atOrBelow || menu.length,
        scrollTarget: { kind: "starting-at" },
      });
    }
    catalogSections.forEach((sec, idx) => {
      if (/large order/i.test(sec.title)) return;
      const categoryId = sec.data[0]?.categoryId ?? null;
      rows.push({
        id: sec.isSmart ? `smart-${idx}` : `cat-${categoryId ?? sec.title}`,
        title: sec.title,
        count: sec.data.length,
        showPlus: !sec.isSmart,
        scrollTarget: sec.isSmart
          ? { kind: "section-title", title: sec.title }
          : { kind: "category", categoryId, categoryName: sec.title },
      });
    });
    return rows;
  }, [pastOrderItems.length, sectionStartingPrice, merchant?.menu, catalogSections]);

  const menuSheetLargeOrder = useMemo((): StoreMenuSheetSection | null => {
    const sec = catalogSections.find((s) => /large order/i.test(s.title));
    if (!sec) return null;
    return {
      id: "large-order",
      title: "LARGE ORDER MENU",
      count: sec.data.length,
      scrollTarget: { kind: "section-title", title: sec.title },
    };
  }, [catalogSections]);

  const handleMenuSheetSelect = useCallback(
    (section: StoreMenuSheetSection) => {
      setMenuSheetVisible(false);

      const needsFilterReset =
        filter !== "all" ||
        menuSearchQuery.trim().length > 0 ||
        hasActiveAdvancedFilters(advancedFilters);

      if (needsFilterReset) {
        pendingMenuNavRef.current = section;
        setFilter("all");
        setMenuSearchQuery("");
        setAdvancedFilters(DEFAULT_STORE_MENU_FILTERS);
        return;
      }

      pendingMenuNavRef.current = null;
      scheduleMenuScroll(() => scrollToMenuTarget(section.scrollTarget));
    },
    [filter, menuSearchQuery, advancedFilters, scrollToMenuTarget]
  );

  const renderMenuSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
      </View>
    ),
    []
  );

  const renderMenuRow = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: MenuListRow;
      index: number;
      section: { data: MenuListRow[] };
    }) => {
      const sectionData = section.data;
      const isLast = index === sectionData.length - 1;
      const menuItemPk = resolveMenuItemPk(item);
      return (
        <StoreMenuItemRow
          item={item}
          merchantId={merchantId}
          goesWithName={goesWithNameByItemId[item.id] ?? null}
          onAdd={handleAddItem}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          isStoreClosed={isStoreClosedForStatus}
          showDivider={!isLast}
          isHighlyReordered={highlyReorderedIds.has(item.id)}
          isBookmarked={menuItemPk != null && bookmarkMenuItemIdSet.has(menuItemPk)}
          highlighted={
            highlightedMenuItemKey != null &&
            (item.id === highlightedMenuItemKey ||
              (item.menuItemId != null && String(item.menuItemId) === highlightedMenuItemKey))
          }
          onBookmark={handleBookmarkMenuItem}
          onShare={handleShareMenuItem}
        />
      );
    },
    [
      merchantId,
      handleAddItem,
      handleIncrement,
      handleDecrement,
      isStoreClosedForStatus,
      highlyReorderedIds,
      bookmarkMenuItemIdSet,
      highlightedMenuItemKey,
      handleBookmarkMenuItem,
      handleShareMenuItem,
      goesWithNameByItemId,
      resolveMenuItemPk,
    ]
  );

  const distanceKm = routeResult?.distanceKm ?? listCachedDistanceKm ?? null;
  const storeEtaLabel = useMemo(() => {
    if (storeQuote?.duration_min != null && Number.isFinite(storeQuote.duration_min)) {
      const mins = Math.round(storeQuote.duration_min);
      const impact = storeQuote.weather_show_impact ? " · Weather Impact" : "";
      return `${mins} mins${impact}`;
    }
    if (!merchant) return formatEtaRange(previewEtaRange({ distanceKm: null, prepMinutes: null }));
    const range = previewEtaRange({
      distanceKm,
      prepMinutes: merchant.avgPreparationTimeMinutes ?? null,
    });
    const delay = storeQuote?.weather_delay_minutes ?? 0;
    if (delay > 0) {
      return formatEtaRange({
        etaMinMinutes: range.etaMinMinutes + delay,
        etaMaxMinutes: range.etaMaxMinutes + delay,
      });
    }
    return formatEtaRange(range);
  }, [merchant, distanceKm, storeQuote]);

  const closedBannerMessage = useMemo(() => {
    if (!merchant || !isStoreClosedForStatus) return null;
    if (openStatusLabel.label === "Open soon" && openStatusLabel.sub) {
      return `Opening soon — browse the menu. ${openStatusLabel.sub} remaining.`;
    }
    if (merchantNextOpenAt) {
      return `Closed for now — browse the menu. ${formatNextOpenTime(toTimestamp(merchantNextOpenAt)!)}.`;
    }
    return "Closed for now — you can still browse the menu. Ordering resumes when we open.";
  }, [merchant, isStoreClosedForStatus, openStatusLabel, merchantNextOpenAt]);

  const menuListHeader = useMemo(() => {
    if (!merchant) return null;
    return (
      <View ref={headerRootRef} collapsable={false}>
        <View style={styles.headerImageWrap}>
          <StoreBannerCarousel
            bannerUri={merchantBannerHeroUri}
            galleryUris={merchantGalleryBannerUris}
            width={SCREEN_WIDTH}
            height={HEADER_IMAGE_HEIGHT}
            initialBannerHoldMs={4000}
            slideIntervalMs={5200}
            slideDurationMs={750}
            showDots={false}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <StoreHeroLogo logoUrl={merchantLogoUri} name={merchant.name} />
          <View style={styles.headerIcons} pointerEvents="box-none">
            <TouchableOpacity onPress={() => router.back()} style={styles.heroCircleBtnDark} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerIconsRight}>
              <TouchableOpacity style={styles.heroSearchPill} onPress={openMerchantSearch} hitSlop={8}>
                <Ionicons name="search" size={16} color="#fff" />
                <Text style={styles.heroSearchPillText}>Search</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroCircleBtnDark}
                onPress={() => setGroupOrderSheetVisible(true)}
                hitSlop={8}
              >
                <Ionicons name="people-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroCircleBtnDark} onPress={openOptionsSheet} hitSlop={8}>
                <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <StoreInfoCard
          name={merchant.name}
          logoUrl={merchantLogoUri}
          avgRating={merchant.avgRating}
          totalReviews={merchant.totalReviews}
          distanceKm={distanceKm}
          areaLabel={merchant.city ?? merchant.address ?? undefined}
          etaLabel={storeEtaLabel}
          scheduledLabel={scheduledSlotLabel}
          offerTexts={offerTickerTexts}
          offerCount={visibleOffers.length}
          isFrequentlyReordered={(merchant.completedOrderCount ?? 0) > 50}
          onInfoPress={() => router.push(`/home/merchant/about/${merchantId}`)}
          onOffersPress={openOffersSheet}
          onSchedulePress={openScheduleSheet}
        />

        {isStoreClosedForStatus && closedBannerMessage ? (
          <View style={styles.closedBanner}>
            <View style={styles.closedBannerIconWrap}>
              <Ionicons name="time-outline" size={18} color="#fff" />
            </View>
            <Text style={styles.closedBannerText}>{closedBannerMessage}</Text>
          </View>
        ) : null}

        <View style={styles.filterBarInList}>
          <Animated.View style={inListFilterVisibilityStyle}>
            <StoreFilterBar
              active={filter}
              onChange={handleFilterChange}
              onOpenFilters={() => setFiltersSheetVisible(true)}
              showHighlyReordered={showHighlyReorderedChip}
              filtersActive={filtersActive}
            />
          </Animated.View>
        </View>

        <View ref={pastOrdersAnchorRef} collapsable={false}>
          <StorePastOrdersSection
            items={pastOrderItems}
            getQty={getQty}
            onAdd={handleAddItem}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            isStoreClosed={isStoreClosedForStatus}
          />
        </View>

        <StoreComboSection
          combos={comboPairs}
          onAddCombo={handleAddCombo}
          isStoreClosed={isStoreClosedForStatus}
        />

        {sections.length > 0 && sectionStartingPrice != null ? (
          <View ref={startingAtAnchorRef} collapsable={false}>
            <StoreSectionHeader
              title={`Items starting at ₹${Math.round(sectionStartingPrice)}`}
              couponLink={visibleOffers.length > 0}
              onCouponPress={openOffersSheet}
            />
          </View>
        ) : null}
      </View>
    );
  }, [
    merchant,
    merchantBannerHeroUri,
    merchantGalleryBannerUris,
    merchantLogoUri,
    distanceKm,
    storeEtaLabel,
    scheduledSlotLabel,
    offerTickerTexts,
    visibleOffers.length,
    isStoreClosedForStatus,
    closedBannerMessage,
    filter,
    handleFilterChange,
    showHighlyReorderedChip,
    filtersActive,
    pastOrderItems,
    getQty,
    handleAddItem,
    handleIncrement,
    handleDecrement,
    comboPairs,
    handleAddCombo,
    sections.length,
    sectionStartingPrice,
    merchantId,
    openMerchantSearch,
    openOptionsSheet,
    openOffersSheet,
    openScheduleSheet,
    router,
  ]);

  if (!merchantId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Invalid merchant</Text>
      </View>
    );
  }

  if (isLoading && !merchant) {
    return (
      <View style={styles.container}>
        <MerchantDetailSkeleton menuRowCount={5} />
      </View>
    );
  }

  if ((isError || !merchant) && !isLoading) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={GatiMitraColors.textSecondary} />
        <Text style={[styles.centeredText, { marginTop: 12, textAlign: "center", paddingHorizontal: 24 }]}>
          Could not load this restaurant. Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void refetch()}
          activeOpacity={0.85}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }} activeOpacity={0.7}>
          <Text style={styles.retryLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!merchant) {
    return (
      <View style={styles.container}>
        <MerchantDetailSkeleton menuRowCount={5} />
      </View>
    );
  }

  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.stickyHeaderBarWrap, stickyHeaderVisible]}
        pointerEvents={headerSearchExpanded ? "auto" : "box-none"}
      >
        <Animated.View
          style={[styles.stickyHeaderBar, { paddingTop: MERCHANT_HEADER_TOP_GUTTER }]}
          pointerEvents="box-none"
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.stickyHeaderBarBg, stickyHeaderBgOpacity]} />
          <Animated.View style={styles.stickyHeaderRowWrap} pointerEvents="box-none">
          <View style={styles.stickyHeaderRow}>
            <TouchableOpacity
              onPress={() => {
                if (headerSearchExpanded) closeMerchantSearch();
                else router.back();
              }}
              style={styles.heroCircleBtnLight}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={StoreTheme.textPrimary} />
            </TouchableOpacity>
            {headerSearchExpanded ? (
              <View style={[styles.stickySearchWrap, { flex: 1 }]}>
                <Ionicons name="search" size={18} color={StoreTheme.searchIcon} />
                <TextInput
                  ref={headerSearchInputRef}
                  style={styles.stickySearchInput}
                  placeholder={stickySearchHint}
                  placeholderTextColor={StoreTheme.textSecondary}
                  value={menuSearchQuery}
                  onChangeText={setMenuSearchQuery}
                  returnKeyType="search"
                  autoFocus
                  selectionColor={StoreTheme.accentMint}
                  multiline={false}
                  scrollEnabled={false}
                  {...Platform.select({
                    android: {
                      includeFontPadding: false,
                      textAlignVertical: "center" as const,
                    },
                    ios: {},
                  })}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.stickySearchWrap, { flex: 1 }]}
                onPress={openMerchantSearch}
                activeOpacity={0.88}
                accessibilityRole="search"
                accessibilityLabel={stickySearchHint}
              >
                <Ionicons name="search" size={18} color={StoreTheme.searchIcon} />
                <Text
                  style={[
                    styles.stickySearchHintText,
                    menuSearchQuery.trim().length > 0 && styles.stickySearchHintTextFilled,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {menuSearchQuery.trim().length > 0 ? menuSearchQuery : stickySearchHint}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openOptionsSheet} style={styles.heroCircleBtnLight} hitSlop={8}>
              <Ionicons name="ellipsis-vertical" size={20} color={StoreTheme.textPrimary} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        </Animated.View>
      </Animated.View>

      <SectionList
        ref={sectionListRef}
        style={styles.sectionList}
        sections={safeSections}
        keyExtractor={(item) =>
          item?.listRowKey ?? `row-${String(item?.menuItemId != null ? item.menuItemId : item?.id ?? "x")}`
        }
        extraData={highlightedMenuItemKey}
        stickySectionHeadersEnabled={Platform.OS === "ios"}
        contentInsetAdjustmentBehavior="never"
        onScroll={handleMenuScroll}
        onScrollEndDrag={commitMenuScrollY}
        onMomentumScrollEnd={commitMenuScrollY}
        scrollEventThrottle={16}
        scrollEnabled
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator
        {...(Platform.OS === "android" ? { overScrollMode: "never" as const } : {})}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            sectionListRef.current?.scrollToLocation({
              sectionIndex: info.sectionIndex,
              itemIndex: Math.min(info.index, 0),
              viewPosition: 0,
              animated: true,
              viewOffset: MENU_SCROLL_STICKY_OFFSET,
            });
          }, 120);
        }}
        contentContainerStyle={listContentContainerStyle}
        {...menuListVirtualization}
        ListHeaderComponent={menuListHeader}
        renderSectionHeader={renderMenuSectionHeader}
        renderItem={renderMenuRow}
        ListFooterComponent={
          <View style={styles.footerListGap}>
            <StoreFooterSection similarMerchants={filteredSimilarMerchants} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyMenu}>
            <Text style={styles.emptyMenuText}>No items match the selected filters.</Text>
          </View>
        }
      />

      <CouponAvailableBottomSheet
        visible={couponAvailablePrompt.visible}
        prompt={couponAvailablePrompt.prompt}
        bottomInset={insets.bottom}
        onClose={couponAvailablePrompt.dismiss}
        onApply={handleCouponAvailableApply}
      />

      <StoreOffersSheet
        visible={offersSheetVisible}
        onClose={closeOffersSheet}
        storeName={merchant.name}
        offers={visibleOffers}
      />

      <StoreFilterSheet
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
        filters={advancedFilters}
        onApply={setAdvancedFilters}
        offerPriceTiers={offerPriceTiers}
        countForFilters={countForFilters}
        showHighlyReordered={showHighlyReorderedChip}
      />

      <StoreScheduleSheet
        visible={scheduleSheetVisible}
        onClose={closeScheduleSheet}
        storeName={merchant.name}
        onConfirm={(label) => setScheduledSlotLabel(label)}
      />

      <StoreMenuFab
        bottom={totalInCart > 0 ? CART_BAR_HEIGHT + 16 + insets.bottom : 24 + insets.bottom / 2}
        onPress={() => setMenuSheetVisible(true)}
      />

      <StoreMenuSheet
        visible={menuSheetVisible}
        onClose={() => setMenuSheetVisible(false)}
        sections={menuSheetSections}
        onSelectSection={handleMenuSheetSelect}
        largeOrderSection={menuSheetLargeOrder}
      />

      <Modal visible={optionsSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeOptionsSheet}>
          <Pressable style={[styles.optionsSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.optionsSheetTitle}>{merchant.name}</Text>
            <TouchableOpacity style={styles.optionRow} onPress={() => { closeOptionsSheet(); /* Add to Collection */ }}>
              <Ionicons name="bookmark-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Add to Collection</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); setGroupOrderSheetVisible(true); }}
            >
              <Ionicons name="people-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Group Order</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); router.push(`/home/merchant/about/${merchantId}`); }}
            >
              <Ionicons name="information-circle-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>See more about this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={handleShareRestaurant}>
              <Ionicons name="share-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Share this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={closeOptionsSheet}>
              <Ionicons name="eye-off-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Hide this restaurant</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={openReportSheet}>
              <Ionicons name="warning-outline" size={22} color={GatiMitraColors.textPrimary} />
              <Text style={styles.optionRowText}>Report fraud or bad practices</Text>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.optionSheetFooter}>
              Menu items, prices, photos and descriptions are set by the restaurant. Report incorrect information.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <GroupOrderStartSheet
        visible={groupOrderSheetVisible}
        onClose={() => setGroupOrderSheetVisible(false)}
        storeId={merchantId}
        storeName={merchant?.name ?? ""}
        onStarted={() => setGroupOrderSheetVisible(false)}
      />

      {customizationItem && (
        <ItemCustomizationSheet
          visible={customizationSheetVisible}
          onClose={() => { setCustomizationSheetVisible(false); setCustomizationItem(null); }}
          storeId={merchantId}
          item={customizationItem}
          merchantName={merchant?.name ?? ""}
          isStoreClosed={isStoreClosedForStatus}
          storeMenu={merchant?.menu ?? []}
          onAddCompanionItem={handleAddItem}
          onAdd={handleCustomizationAdd}
        />
      )}

      <Modal visible={reportSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeReportSheet}>
          <Pressable style={[styles.reportSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.reportSheetTitle}>Report an issue with the menu</Text>
            <Text style={styles.reportSheetSub}>This feedback will be shared directly with the restaurant.</Text>
            {REPORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.reportOptionRow}
                onPress={() => handleReportSubmit(opt.id)}
                disabled={reportSubmitting}
              >
                <Text style={styles.reportOptionText}>{opt.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: StoreTheme.background,
  },
  sectionList: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centeredText: {
    fontSize: 16,
    color: GatiMitraColors.textSecondary,
  },
  retryBtn: {
    marginTop: 18,
    backgroundColor: GatiMitraColors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  retryLinkText: {
    color: GatiMitraColors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  loadingBg: {
    backgroundColor: GatiMitraColors.background,
  },
  stickyHeaderBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
  },
  stickyHeaderBar: {
    position: "relative",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...GatiMitraColors.elevationShadow,
  },
  stickyHeaderBarBg: {
    backgroundColor: "#fff",
    borderRadius: 0,
  },
  stickyHeaderRowWrap: {
    zIndex: 1,
  },
  stickyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stickyBackBtn: { padding: 6 },
  stickySearchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: StoreTheme.searchBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    minHeight: 44,
  },
  stickySearchHintText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    color: StoreTheme.textSecondary,
    fontWeight: "500",
  },
  stickySearchHintTextFilled: {
    color: StoreTheme.textPrimary,
    fontWeight: "600",
  },
  stickySearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    color: StoreTheme.textPrimary,
    fontWeight: "500",
    paddingVertical: Platform.OS === "android" ? 0 : 2,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: "center" as const },
      ios: {},
    }),
  },
  heroCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: StoreTheme.searchBg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCircleBtnLight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: StoreTheme.searchBg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCircleBtnDark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: StoreTheme.headerBtnBg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSearchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: StoreTheme.headerBtnBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  heroSearchPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  stickyMenuBtn: { padding: 6 },
  optionsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "80%",
  },
  optionsSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  optionRowText: { flex: 1, fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  optionSheetFooter: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 16,
    lineHeight: 18,
  },
  reportSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "70%",
  },
  reportSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 6,
  },
  reportSheetSub: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    marginBottom: 16,
  },
  reportOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  reportOptionText: { fontSize: 16, fontWeight: "500", color: GatiMitraColors.textPrimary },
  headerImageWrap: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH,
    overflow: "hidden",
  },
  headerImage: {
    width: SCREEN_WIDTH,
    height: HEADER_IMAGE_HEIGHT,
  },
  bannerPreload: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
  },
  headerIcons: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 4,
  },
  headerIconsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerGroupOrderWrap: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerGroupOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  headerGroupOrderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  headerInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    zIndex: 2,
  },
  headerName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerOfferChip: {
    position: "absolute",
    bottom: 88,
    left: 14,
    right: 14,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(37, 99, 235, 0.94)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  headerOfferChipIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerOfferChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  headerCityText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.88)",
    marginTop: 4,
    fontWeight: "500",
  },
  headerProfileCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 6,
  },
  headerProfileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingCapsuleNew: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  ratingCapsuleText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  ratingReviewCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
  },
  headerCuisineLine: {
    flex: 1,
    minWidth: 80,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    flexShrink: 1,
    maxWidth: "58%",
  },
  headerStatusPillOpen: {
    backgroundColor: GatiMitraColors.emerald,
  },
  headerStatusPillOpenSoon: {
    backgroundColor: "rgba(22, 163, 74, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  headerStatusPillClosingSoon: {
    backgroundColor: GatiMitraColors.closedRed,
  },
  headerStatusPillClosed: {
    backgroundColor: GatiMitraColors.closedRed,
  },
  headerStatusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    flexShrink: 1,
  },
  offersSection: {
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: GatiMitraColors.softBackground,
  },
  offersSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  offersSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  offersScroll: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  offerCard: {
    backgroundColor: "#f0fdf4",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#bbf7d0",
    borderStyle: "dashed",
    minWidth: 160,
    maxWidth: 200,
  },
  offerCardLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#15803d",
  },
  offerCardSub: {
    fontSize: 11,
    color: "#166534",
    marginTop: 2,
  },
  filterBarInList: {
    justifyContent: "center",
    backgroundColor: StoreTheme.background,
    overflow: "hidden",
  },
  filterBar: {
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: GatiMitraColors.softBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
  },
  stickyFilterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: 0,
    maxHeight: FILTER_BAR_HEIGHT,
    justifyContent: "center",
    backgroundColor: StoreTheme.background,
    zIndex: 9,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.18)",
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  filterPillTextActive: {
    color: "#fff",
  },
  recommendSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  recommendTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  recommendSub: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  footerListGap: {
    marginTop: 20,
  },
  itemCard: {
    backgroundColor: GatiMitraColors.cardBg,
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.18)",
  },
  itemCardInner: {
    flexDirection: "row",
    padding: 16,
    alignItems: "flex-start",
    gap: 4,
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 12,
    justifyContent: "space-between",
  },
  itemCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vegDot: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: GatiMitraColors.primaryMint,
    backgroundColor: "transparent",
  },
  nonVegDot: {
    borderColor: "#c2410c",
    backgroundColor: "#c2410c",
  },
  itemName: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  itemDesc: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 5,
    lineHeight: 19,
    letterSpacing: 0.1,
  },
  itemTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  itemTag: {
    backgroundColor: GatiMitraColors.mintSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  itemTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraColors.primaryMint,
    letterSpacing: 0.2,
  },
  discountTag: {
    backgroundColor: "#fef9c3",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  discountTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b45309",
  },
  prepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  prepText: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  itemPriceEmphasis: {
    fontSize: 19,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.4,
  },
  itemImageClosedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 16,
  },
  itemActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.surfaceWarm,
  },
  itemCardRight: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  itemCardRightCol: {
    width: 108,
    alignItems: "stretch",
  },
  itemImageWrap: {
    width: 108,
    height: 108,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.12)",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  menuImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBannerPlaceholderInner: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnWrap: {
    marginTop: 10,
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "stretch",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#16a34a",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
    minHeight: 40,
  },
  addBtnPressed: {
    opacity: 0.9,
  },
  addBtnDisabled: {
    opacity: 0.85,
  },
  addBtnClosed: {
    backgroundColor: "#9ca3af",
  },
  addBtnTextDisabled: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.6,
  },
  quantityWrap: {
    marginTop: 10,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 40,
    alignSelf: "stretch",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#16a34a",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
        }
      : { elevation: 3 }),
  },
  quantityWrapDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.95,
  },
  qtyBtn: {
    padding: 2,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  customisableText: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraColors.primaryMint,
    marginRight: 2,
    letterSpacing: 0.2,
  },
  customiseDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingTop: 2,
  },
  emptyMenu: {
    padding: 32,
    alignItems: "center",
  },
  emptyMenuText: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
  },
  menuFab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
    ...GatiMitraColors.elevationShadow,
  },
  menuFabText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    zIndex: 8,
  },
  cartBarCapsule: {
    borderRadius: 28,
    overflow: "hidden",
    ...GatiMitraColors.cardShadowSoft,
  },
  cartBarGlass: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
  },
  cartBarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  cartBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBarCount: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  cartBarTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  cartBarCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cartBarCtaText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  cartBarCtaDisabled: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  cartBarCtaTextDisabled: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
  },
  closedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#374151",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  closedBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#fff",
    lineHeight: 19,
    fontWeight: "500",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: GatiMitraColors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "65%",
    ...GatiMitraColors.elevationShadow,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
    marginRight: 12,
  },
  sheetBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sheetBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  sheetList: {
    maxHeight: 340,
    marginBottom: 52,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(229,231,235,0.9)",
  },
  sheetRowPressed: {
    backgroundColor: GatiMitraColors.mintSoft,
  },
  sheetRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    minWidth: 0,
  },
  sheetRowText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    flex: 1,
  },
  sheetRowTag: {
    marginLeft: 6,
  },
  sheetRowCount: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  sheetCloseBtn: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  sheetCloseText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
});
