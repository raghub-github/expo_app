/**
 * Premium Restaurant Details & Menu – GatiMitra.
 * Smart header, offers, filters, sectioned menu, floating nav, persistent cart.
 * Data from merchant_menu_items via GET /v1/merchants/:id/menu.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Platform, Modal, Pressable, TextInput, Share, Alert, InteractionManager, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets, initialWindowMetrics } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSharedValue } from "react-native-reanimated";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { merchantService, type MenuItem, type MerchantSummary, type OrderedTogetherPair, setMenuItemBookmark } from "@/services/merchant.service";
import { previewEtaRange, formatEtaRange } from "@/lib/etaPreview";
import { offersService, type MerchantOfferItem, type PlatformOfferItem } from "@/services/offers.service";
import { buildItemOfferDisplayMap, offerPriority, offerTargetsItem, isItemSurface } from "@/lib/itemOfferDisplay";
import { computeIsDiscountEligible } from "@/lib/cartDiscountEligibility";
import { getSellingPrice } from "@/components/store/storeMenuUtils";
import {
  STORE_OFFERS_STALE_MS,
  buildStoreOffersQueryKey,
  filterOffersForStoreSheet,
  countStoreOffersForBadge,
  getSyncStoreOffers,
  offerTextsFromStoreOffers,
  prefetchStoreOffersFromLocationStore,
  syncStoreOffersInBackground,
} from "@/lib/prefetchStoreOffers";
import { getStoreOffersCachedAt, writePersistedStoreOffers } from "@/lib/storeOffersCache";
import {
  getMyOrdersCachedAt,
  readSyncMyOrders,
  seedMyOrdersStoreQueryIfCached,
  writeCachedMyOrders,
} from "@/lib/myOrdersCache";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getRoute } from "@/services/distance.service";
import { useStoreDeliveryQuote } from "@/hooks/useStoreDeliveryQuote";
import { useMenuItemBookmarks, useMenuItemBookmarkMutations } from "@/hooks/useMenuItemBookmarks";
import { addressService, type Address } from "@/services/address.service";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { useCartStore } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { useAuthStore } from "@/store/authStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import {
  getMerchantDetailPlaceholder,
  prefetchMerchantDetail,
  findMerchantSummaryInCache,
} from "@/lib/prefetchMerchantDetail";
import {
  fetchMerchantByIdWithCache,
  getMerchantMenuCachedAt,
  MERCHANT_DETAIL_GC_MS,
  MERCHANT_DETAIL_QUERY_KEY,
  MERCHANT_DETAIL_STALE_MS,
  readSyncMerchantMenu,
  seedMerchantMenuQueryIfCached,
} from "@/lib/merchantMenuCache";
import { syncMerchantMenuInBackground } from "@/lib/merchantMenuSync";
import { useStoreDetailLiveStatus } from "@/hooks/useStoreDetailLiveStatus";
import { useMerchantMenuRealtime } from "@/hooks/useMerchantMenuRealtime";
import { useStoreOffersRealtime } from "@/hooks/useStoreOffersRealtime";
import { prefetchMenuItemImagesForMenu } from "@/lib/prefetchMenuItemImages";
import { resolveMerchantLiveStatus } from "@/lib/merchantListing";
import { GroupOrderStartSheet } from "@/components/GroupOrderStartSheet";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { StoreMenuItemDetailSheet } from "@/components/store/StoreMenuItemDetailSheet";
import {
  prefetchMenuItemFullConfig,
  prefetchMenuItemFullConfigsForMenu,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreTheme } from "@/constants/storeTheme";
import type { StoreFilterId } from "@/components/store/StoreFilterBar";
import {
  StoreFilterSheet,
  DEFAULT_STORE_MENU_FILTERS,
  type StoreMenuFilterState,
} from "@/components/store/StoreFilterSheet";
import {
  buildHighlyReorderedIds,
  mapOrderedTogetherPairsToCombos,
  buildOfferPriceTiers,
  filterMenuItems,
  hasActiveAdvancedFilters,
  resolvePairingCompanionsForAnchor,
} from "@/components/store/storeMenuUtils";
import {
  MerchantDetailFlashList,
  type MerchantScrollListHandle,
} from "@/features/merchant-detail/components/MerchantDetailFlashList";
import { MerchantStickyChrome } from "@/features/merchant-detail/components/MerchantStickyChrome";
import { MerchantFloatingFab } from "@/features/merchant-detail/components/MerchantFloatingFab";
import {
  buildFlashListData,
  findFlatIndexForScrollTarget,
} from "@/features/merchant-detail/lib/buildFlashListData";
import {
  attachListRowKeys,
  buildMenuSections,
  buildSortedMenuSection,
  lowestAvailableMenuPrice,
} from "@/features/merchant-detail/lib/menuSections";
import {
  scrollFlashListToFlatIndex,
  scrollFlashListToOffset,
} from "@/features/merchant-detail/lib/flashListScroll";
import { useMerchantScrollAnimation } from "@/features/merchant-detail/hooks/useMerchantScrollAnimation";
import { useMerchantScrollChromeState } from "@/features/merchant-detail/hooks/useMerchantScrollChromeState";
import {
  DEFAULT_STATUS_BAR_HEIGHT,
  resolveTabBarBottomInset,
} from "@/constants/layout";
import { resolveStoreContinueBarHeight } from "@/components/store/MerchantMenuCartSheet";
import { MerchantCartDock } from "@/components/store/MerchantCartDock";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { findCartLinePrefillForMenuItem } from "@/lib/cart-line-identity";
import { useRenderCount } from "@/hooks/useRenderCount";
import {
  MENU_FAB_HEIGHT,
  HEADER_IMAGE_HEIGHT,
  SCREEN_WIDTH_EXPORT,
  FILTER_BAR_HEIGHT,
  STICKY_SEARCH_ROW_HEIGHT,
  merchantHeaderTopGutter,
  merchantHeroActionsTopPad,
  menuScrollStickyOffset,
} from "@/features/merchant-detail/constants/layout";
import type { MerchantFlashListItem, MenuSection } from "@/features/merchant-detail/types";
import {
  StoreMenuSheet,
  type MenuSheetScrollTarget,
  type StoreMenuSheetSection,
  type StoreMenuSheetOfferRow,
} from "@/components/store/StoreMenuSheet";
import { StoreOffersSheet } from "@/components/store/StoreOffersSheet";
import { StoreScheduleSheet } from "@/components/store/StoreScheduleSheet";
import { MerchantRatingExplainerSheet } from "@/components/store/MerchantRatingExplainerSheet";
import type { PastOrderItem } from "@/components/store/StorePastOrderRow";
import { orderService, type OrderSummary } from "@/services/order.service";
import { FOOD_HOME_FALLBACK, safeRouterBack } from "@/lib/safeRouterBack";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";
import { MERCHANT_NAV_SHUTTER_SLIDE_MS } from "@/components/MerchantNavTransitionShutter";
import { tryNavigateToFoodCheckout } from "@/lib/cartCheckoutGate";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const MENU_SEARCH_DEBOUNCE_MS = 200;

/**
 * Only latch the "late insert" suppression once the user has scrolled beyond this
 * offset (px) — i.e. past where "Your Orders" / combos render. Below it, inserting
 * the section causes no meaningful jump, so a valid section must always be shown.
 */
const LATE_SECTION_SUPPRESS_SCROLL_Y = 320;

/**
 * Stable empty-object reference — `orderedTogetherRecs?.byAnchorItemId ?? {}` would
 * otherwise allocate a NEW object every render while the query hasn't resolved, which
 * invalidated pairingCompanionItems (and, downstream, the whole flashListData memo) on
 * every single render regardless of any actual cart/menu change.
 */
const EMPTY_CO_PURCHASE_MAP: Record<string, OrderedTogetherPair[]> = {};
/**
 * Same rationale as EMPTY_CO_PURCHASE_MAP: `useQuery`'s destructuring default
 * (`data: x = []`) allocates a NEW array every render while the query hasn't resolved,
 * which invalidates every memo that depends on it (highlyReorderedIds -> sections ->
 * flashListData, or filteredSimilarMerchants) on every single render during that window.
 */
const EMPTY_ADDRESSES: Address[] = [];
const EMPTY_MY_ORDERS: OrderSummary[] = [];
const EMPTY_SIMILAR_MERCHANTS: MerchantSummary[] = [];

/** Stable bottom inset — seed from launch metrics so Continue doesn't jump after ~1 min. */
const CART_DOCK_BOTTOM_INSET_SEED = initialWindowMetrics?.insets.bottom ?? 0;
/** Stable top inset — never trust a transient 0 while immersive (status-bar overlap). */
const SAFE_TOP_SEED = Math.max(
  initialWindowMetrics?.insets.top ?? 0,
  Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  DEFAULT_STATUS_BAR_HEIGHT
);

export default function MerchantDetailScreen() {
  useRenderCount("MerchantDetailScreen");
  const { id, openCart, focusItemId } = useLocalSearchParams<{
    id: string;
    openCart?: string;
    focusItemId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // OS nav inset only (no 48dp Android fallback) — locked to max(seed, live) so it
  // never shrinks to 0 later (top overlap) or grows from 0 (bottom gap).
  const cartDockBottomInset = resolveTabBarBottomInset(
    Math.max(insets.bottom, CART_DOCK_BOTTOM_INSET_SEED)
  );
  // Prefer root spacer; if immersive left it off, pad locally so buttons never hit the status bar.
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const safeTopWhenImmersive = Math.max(insets.top, SAFE_TOP_SEED);
  const topPad = hideStatusBarSpacer ? safeTopWhenImmersive : 0;
  const headerTopGutter = merchantHeaderTopGutter(topPad);
  const scrollStickyOffset = menuScrollStickyOffset(topPad);
  const heroActionsTopPad = merchantHeroActionsTopPad(topPad);
  const merchantId = id ?? "";
  const hasMerchantCartItems = useCartStore(
    (s) =>
      merchantCartMatchesRoute(s.merchantId, merchantId) &&
      s.items.some((cartItem) => cartItem.quantity > 0)
  );
  // Capture once at mount so shutter + page share the same sentence after hide().
  // When nav shutter didn't run, pick a fresh sentence for this store entry.
  const [loadingMessageIndex] = useState(() =>
    useMerchantNavTransitionStore
      .getState()
      .consumeLoadingMessageIndex(id ?? "")
  );
  const scrollListRef = useRef<MerchantScrollListHandle>(null);
  const menuScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [filter, setFilter] = useState<StoreFilterId>("all");
  const [advancedFilters, setAdvancedFilters] = useState<StoreMenuFilterState>(DEFAULT_STORE_MENU_FILTERS);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [menuSheetVisible, setMenuSheetVisible] = useState(false);
  const [selectedMenuOfferId, setSelectedMenuOfferId] = useState<string | null>(null);
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const debouncedMenuSearchQuery = useDebouncedValue(menuSearchQuery, MENU_SEARCH_DEBOUNCE_MS);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [groupOrderSheetVisible, setGroupOrderSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [customizationSheetVisible, setCustomizationSheetVisible] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<MenuItem | null>(null);
  const [customizationInitialSelection, setCustomizationInitialSelection] = useState<{
    variantId?: string | null;
    variantName?: string | null;
    addons?: Array<{ addonId: string }>;
    specialInstructions?: string | null;
    quantity?: number;
  } | null>(null);
  const [customizationEditLineId, setCustomizationEditLineId] = useState<string | null>(null);
  const [customizationSiblingLineIds, setCustomizationSiblingLineIds] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailInitialSelection, setDetailInitialSelection] = useState<{
    specialInstructions?: string | null;
    quantity?: number;
  } | null>(null);
  const [detailEditLineId, setDetailEditLineId] = useState<string | null>(null);
  const [detailSiblingLineIds, setDetailSiblingLineIds] = useState<string[]>([]);
  const focusItemHandledRef = useRef<string | null>(null);
  const pendingMenuNavRef = useRef<{
    scrollTarget: MenuSheetScrollTarget;
    highlightItemId?: string | null;
    offerKey?: string | null;
  } | null>(null);
  const [highlightedMenuItemKey, setHighlightedMenuItemKey] = useState<string | null>(null);
  /** Last menu row that received an add — pairing strip renders directly below it. */
  const [pairingAnchorKey, setPairingAnchorKey] = useState<string | null>(null);
  const [offersSheetVisible, setOffersSheetVisible] = useState(false);
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false);
  const [ratingSheetVisible, setRatingSheetVisible] = useState(false);
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
      scrollFlashListToOffset(scrollListRef, 0, true);
    }
    setHeaderSearchExpanded(true);
    const delay = y > 48 ? 340 : 80;
    setTimeout(() => headerSearchInputRef.current?.focus(), delay);
  }, []);
  const closeMerchantSearch = useCallback(() => {
    setHeaderSearchExpanded(false);
    setMenuSearchQuery("");
  }, []);

  const setStoreScrollOffset = useMerchantScrollStore((s) => s.setStoreScrollOffset);
  const setScrollY = useMerchantScrollStore((s) => s.setScrollY);
  const didRestoreScrollRef = useRef(false);
  /** Snapshot of saved offset at merchant open — never re-read after user scrolls. */
  const restoreOffsetRef = useRef(0);
  const userInterruptedRestoreRef = useRef(false);
  const scrollRestoreTaskRef = useRef<{ cancel: () => void } | null>(null);
  /** Late-loading "Your Orders" / combo above the fold must not insert after the user scrolls. */
  const suppressLatePastOrdersRef = useRef(false);
  const suppressLateComboRef = useRef(false);
  const pastOrderCountRef = useRef(0);
  const comboCountRef = useRef(0);
  const userMenuScrollStarted = useSharedValue(false);

  // Reset scroll-restore + late-insert gates only when the store changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const initial = useMerchantScrollStore.getState().getStoreScrollOffset(merchantId);
    restoreOffsetRef.current = initial;
    userInterruptedRestoreRef.current = false;
    suppressLatePastOrdersRef.current = false;
    suppressLateComboRef.current = false;
    didRestoreScrollRef.current = false;
    scrollRestoreTaskRef.current?.cancel();
    scrollRestoreTaskRef.current = null;
    userMenuScrollStarted.value = initial > 0;
    useMerchantScrollStore.getState().setScrollY(0);
  }, [merchantId]);

  const cancelScheduledMenuScroll = useCallback(() => {
    for (const timer of menuScrollTimersRef.current) {
      clearTimeout(timer);
    }
    menuScrollTimersRef.current = [];
    scrollListRef.current?.cancelPendingScroll();
  }, []);

  const onUserTakeOverMenuScroll = useCallback(() => {
    userInterruptedRestoreRef.current = true;
    scrollRestoreTaskRef.current?.cancel();
    scrollRestoreTaskRef.current = null;
    // Only suppress a late "Your Orders" / combo insert when the user has already
    // scrolled PAST where it would appear (deep enough that inserting above would
    // jump the viewport). A shallow top-of-list drag must NEVER permanently hide a
    // valid section — that was the root cause of "Your Orders" not appearing:
    // real users start dragging before the orders fetch resolves, which latched
    // the section off for the whole visit with no way to recover but leaving.
    const y = useMerchantScrollStore.getState().scrollY;
    if (y > LATE_SECTION_SUPPRESS_SCROLL_Y) {
      if (pastOrderCountRef.current === 0) suppressLatePastOrdersRef.current = true;
      if (comboCountRef.current === 0) suppressLateComboRef.current = true;
      if (__DEV__ && (pastOrderCountRef.current === 0 || comboCountRef.current === 0)) {
        // eslint-disable-next-line no-console
        console.log("[your-orders] late-insert suppressed (scrolled past insert point)", {
          scrollY: Math.round(y),
          pastOrdersLoaded: pastOrderCountRef.current,
          combosLoaded: comboCountRef.current,
        });
      }
    }
    cancelScheduledMenuScroll();
  }, [cancelScheduledMenuScroll]);

  useEffect(() => () => cancelScheduledMenuScroll(), [cancelScheduledMenuScroll]);

  const {
    scrollY,
    scrollHandler,
    stickySearchStyle,
    stickySearchBgStyle,
    fabStyle,
  } = useMerchantScrollAnimation({
    headerSearchExpandedSv,
    userMenuScrollStarted,
    onBeginDrag: onUserTakeOverMenuScroll,
    onScrollEnd: (y) => {
      setStoreScrollOffset(merchantId, y);
      setScrollY(y);
    },
  });

  const heroBannerHeight = HEADER_IMAGE_HEIGHT;

  const {
    stickySearchActive,
    heroActionsVisible,
  } = useMerchantScrollChromeState({
    scrollY,
    userMenuScrollStarted,
    heroBannerHeight,
  });

  useLayoutEffect(() => {
    useScreenChromeStore.setState({
      statusBarBackground: "#FFFFFF",
      statusBarStyle: "dark",
      hideStatusBarSpacer: false,
      bootstrapActive: false,
    });
    StatusBar.setHidden(false, "none");
    if (Platform.OS === "android") {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor("#FFFFFF", true);
      StatusBar.setBarStyle("dark-content", true);
    }
  }, [merchantId]);

  // Declared BEFORE the focus effect below — that effect reads queryClient in its
  // callback and dependency array, so a later `const` here was a temporal-dead-zone
  // ReferenceError ("Cannot access 'queryClient' before initialization") that
  // crashed the screen on render.
  const queryClient = useQueryClient();

  const navShutterActive = useMerchantNavTransitionStore((s) => s.active);

  const assertMerchantStatusBarChrome = useCallback(() => {
    StatusBar.setHidden(false, "none");
    if (Platform.OS === "android") {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor("#FFFFFF", true);
      StatusBar.setBarStyle("dark-content", true);
    }
    useScreenChromeStore.setState({
      statusBarBackground: "#FFFFFF",
      statusBarStyle: "dark",
      hideStatusBarSpacer: false,
      bootstrapActive: false,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      assertMerchantStatusBarChrome();
      // Same freshness strategy as Food Home cards: refetch offers on focus (silent).
      if (merchantId) {
        void syncStoreOffersInBackground(queryClient, merchantId);
      }
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [assertMerchantStatusBarChrome, merchantId, queryClient])
  );

  // Focus/layout can run while the nav shutter Modal is still up — re-assert when it drops.
  useEffect(() => {
    if (navShutterActive) return;
    assertMerchantStatusBarChrome();
  }, [navShutterActive, assertMerchantStatusBarChrome]);

  useMerchantMenuRealtime(merchantId, queryClient);
  useStoreOffersRealtime(merchantId, queryClient);

  const { bookmarkMenuItemIdSet } = useMenuItemBookmarks(merchantId);
  const { syncMenuItemBookmark } = useMenuItemBookmarkMutations();

  useLayoutEffect(() => {
    if (!merchantId) return;
    seedMerchantMenuQueryIfCached(queryClient, merchantId);
    seedMyOrdersStoreQueryIfCached(queryClient, merchantId);
  }, [merchantId, queryClient]);

  useEffect(() => {
    if (!merchantId) return;
    prefetchMerchantDetail(queryClient, merchantId);
  }, [merchantId, queryClient]);

  const { data: liveStatusSnapshot } = useStoreDetailLiveStatus(merchantId);

  const [secondaryQueriesReady, setSecondaryQueriesReady] = useState(
    () => !!readSyncMerchantMenu(merchantId)?.menu?.length
  );
  useEffect(() => {
    const warm = !!readSyncMerchantMenu(merchantId)?.menu?.length;
    setSecondaryQueriesReady(warm);
    if (warm) return;
    // Cache miss: unlock secondary work on next frame (don't wait for InteractionManager).
    const id = requestAnimationFrame(() => setSecondaryQueriesReady(true));
    return () => cancelAnimationFrame(id);
  }, [merchantId]);

  const { data: merchant, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: MERCHANT_DETAIL_QUERY_KEY(merchantId),
    queryFn: () => fetchMerchantByIdWithCache(merchantId),
    enabled: !!merchantId && !readSyncMerchantMenu(merchantId)?.menu?.length,
    staleTime: MERCHANT_DETAIL_STALE_MS,
    gcTime: MERCHANT_DETAIL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    networkMode: "offlineFirst",
    initialData: () => readSyncMerchantMenu(merchantId),
    initialDataUpdatedAt: () => getMerchantMenuCachedAt(merchantId),
    placeholderData: (previous) =>
      previous ?? getMerchantDetailPlaceholder(queryClient, merchantId),
  });

  const hasCachedMenu = (merchant?.menu?.length ?? 0) > 0;
  const menuPending = !hasCachedMenu && (isPending || isFetching);

  // Warm revisit: treat list as laid out immediately so shutter can hide without waiting onLayout.
  const [listLaidOut, setListLaidOut] = useState(() => hasCachedMenu);

  useLayoutEffect(() => {
    if (hasCachedMenu) {
      setListLaidOut(true);
      return;
    }
    setListLaidOut(false);
  }, [merchantId, hasCachedMenu]);

  useEffect(() => {
    if (listLaidOut || !merchant || menuPending) return;
    const fallback = setTimeout(() => setListLaidOut(true), 120);
    return () => clearTimeout(fallback);
  }, [merchant, menuPending, listLaidOut]);

  const handleListLayout = useCallback(() => {
    setListLaidOut(true);
  }, []);

  /**
   * Drop the nav shutter as soon as the store shell can paint (list-card placeholder
   * is enough). Waiting on full menu fetch kept the shutter up for the whole API
   * timeout (~30s) and blocked back.
   */
  const contentReady = !!merchant;

  useEffect(() => {
    if (!contentReady) return;
    const nav = useMerchantNavTransitionStore.getState();
    if (!nav.active) return;
    if (nav.merchantId && nav.merchantId !== merchantId) return;
    // Keep shutter up for the slide window so the Modal is actually visible.
    const elapsed = Date.now() - (nav.shownAt || Date.now());
    const wait = Math.max(0, MERCHANT_NAV_SHUTTER_SLIDE_MS + 40 - elapsed);
    let raf1: number | null = null;
    let raf2: number | null = null;
    const t = setTimeout(() => {
      // The elapsed-time wait alone can fire before the native stack push has actually
      // become the frontmost view (Modal dismissal and router.push are two independent
      // native operations, not synchronized in JS — most visible on Android). Confirm
      // this screen has committed at least one more frame, and that any in-flight
      // interactions (the push transition) have settled, before dropping the shutter.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          InteractionManager.runAfterInteractions(() => {
            useMerchantNavTransitionStore.getState().hide();
          });
        });
      });
    }, wait);
    return () => {
      clearTimeout(t);
      if (raf1 != null) cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
    };
  }, [contentReady, merchantId]);

  // Hard cap — never leave the shutter covering the UI (or trapping back).
  useEffect(() => {
    if (!merchantId) return;
    const t = setTimeout(() => {
      const nav = useMerchantNavTransitionStore.getState();
      if (nav.active && (!nav.merchantId || nav.merchantId === merchantId)) {
        nav.hide();
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId) return;
    if ((isError || !merchant) && !isPending && !isFetching) {
      useMerchantNavTransitionStore.getState().hide();
    }
  }, [merchantId, isError, merchant, isPending, isFetching]);

  useEffect(() => {
    if (!merchantId) return;
    void syncMerchantMenuInBackground(queryClient, merchantId);
  }, [merchantId, queryClient]);

  useEffect(() => {
    if (!merchantId || !hasCachedMenu || didRestoreScrollRef.current) return;
    const offset = restoreOffsetRef.current;
    if (offset <= 0) {
      didRestoreScrollRef.current = true;
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      if (userInterruptedRestoreRef.current || didRestoreScrollRef.current) return;
      // User already moved the list — never yank them back to the saved offset
      // (often "Your Orders"), which felt like a redirect after scroll-stop.
      if (scrollY.value > 24 && Math.abs(scrollY.value - offset) > 40) {
        didRestoreScrollRef.current = true;
        return;
      }
      userMenuScrollStarted.value = true;
      scrollFlashListToOffset(scrollListRef, offset, false);
      scrollY.value = offset;
      setScrollY(offset);
      didRestoreScrollRef.current = true;
    });
    scrollRestoreTaskRef.current = task;
    return () => {
      task.cancel();
      if (scrollRestoreTaskRef.current === task) scrollRestoreTaskRef.current = null;
    };
  }, [merchantId, hasCachedMenu, scrollY, setScrollY, userMenuScrollStarted]);

  useEffect(() => {
    if (!merchantId || !merchant?.menu?.length) return;
    void prefetchMenuItemImagesForMenu(merchant.menu);
    const task = InteractionManager.runAfterInteractions(() => {
      prefetchMenuItemFullConfigsForMenu(queryClient, merchantId, merchant.menu);
    });
    return () => task.cancel();
  }, [merchantId, merchant?.menu, queryClient]);

  /** List cards often carry rating before the menu payload resolves — reuse on inner page. */
  const displayMerchant = useMemo(() => {
    if (!merchant) return undefined;
    const summary = findMerchantSummaryInCache(queryClient, merchantId);
    if (!summary) return merchant;
    return {
      ...merchant,
      avgRating: merchant.avgRating ?? summary.avgRating ?? null,
      totalReviews: merchant.totalReviews ?? summary.totalReviews ?? null,
      forYouRating: merchant.forYouRating ?? summary.forYouRating ?? null,
      userHasRatedStore: merchant.userHasRatedStore ?? summary.userHasRatedStore ?? false,
    };
  }, [merchant, merchantId, queryClient]);

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

  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const locationAddress = useLocationStore((s) => s.address);

  // Deep link / cold open: validate backend active location before quotes.
  useEffect(() => {
    if (!useAuthStore.getState().session) return;
    void (async () => {
      const { ensureActiveLocationValidated } = await import(
        "@/lib/ensureActiveLocationValidated"
      );
      await ensureActiveLocationValidated(queryClient, {
        allowRemoteSessionPreserve: true,
      });
    })();
  }, [queryClient, merchantId]);

  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
  });

  const { data: addresses = EMPTY_ADDRESSES } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60 * 1000,
  });

  const deliveryCoords = useMemo(() => {
    // Explicit user pin for this session.
    if (coords && locationSource === "selected") {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    // Live GPS — never prefer stale server active-location over device coords.
    return coords;
  }, [coords?.latitude, coords?.longitude, locationSource]);

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
  const offerGeo = useMemo(
    () => ({
      pincode,
      state,
      city,
      lat: offerLat,
      lng: offerLng,
    }),
    [pincode, state, city, offerLat, offerLng]
  );

  const storeOffersQueryKey = useMemo(
    () => buildStoreOffersQueryKey(merchantId, offerGeo),
    [merchantId, offerGeo]
  );

  const syncStoreOffers = useMemo(
    () => getSyncStoreOffers(queryClient, merchantId, offerGeo),
    [queryClient, merchantId, offerGeo]
  );

  useLayoutEffect(() => {
    if (!merchantId) return;
    prefetchStoreOffersFromLocationStore(queryClient, merchantId, { force: true });
  }, [merchantId, queryClient]);

  const {
    data: storeOffersData,
    isPending: storeOffersPending,
  } = useQuery({
    queryKey: storeOffersQueryKey,
    queryFn: async () => {
      const data = await offersService.getStoreOffers({
        storeId: merchantId,
        pincode,
        state,
        city,
        lat: offerLat,
        lng: offerLng,
        serviceType: "FOOD",
      });
      void writePersistedStoreOffers(merchantId, data, offerGeo);
      return data;
    },
    enabled: !!merchantId,
    staleTime: STORE_OFFERS_STALE_MS,
    retry: 1,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
    initialData: syncStoreOffers,
    // Mirror Food Home merchants list: disk/RQ seed is immediately stale so network refresh runs.
    initialDataUpdatedAt: syncStoreOffers
      ? (getStoreOffersCachedAt(merchantId) ?? Date.now() - STORE_OFFERS_STALE_MS)
      : undefined,
  });

  const sheetOffers = useMemo(
    () => filterOffersForStoreSheet(storeOffersData),
    [storeOffersData]
  ) as (MerchantOfferItem | PlatformOfferItem)[];

  const storeOffersBadgeCount = useMemo(
    () => countStoreOffersForBadge(storeOffersData),
    [storeOffersData]
  );

  const itemOfferById = useMemo(() => {
    const merchantOffers = storeOffersData?.merchant_offers ?? [];
    const catalog = (merchant?.menu ?? []).map((m) => ({
      id: m.id,
      menuItemId: m.menuItemId ?? null,
      price: getSellingPrice(m),
    }));
    return buildItemOfferDisplayMap(merchantOffers, catalog);
  }, [storeOffersData?.merchant_offers, merchant?.menu]);

  const cachedMyOrders = useMemo(
    () => readSyncMyOrders() as OrderSummary[] | undefined,
    [merchantId]
  );

  const { data: myOrders = EMPTY_MY_ORDERS } = useQuery({
    queryKey: ["my-orders-store", merchantId],
    queryFn: async () => {
      const orders = await orderService.getMyOrders({ limit: 40 });
      void writeCachedMyOrders(orders);
      return orders;
    },
    // "Your Orders & Collections" is core to this screen, not a secondary query:
    // fetch immediately on mount (don't gate behind secondaryQueriesReady) so past
    // orders are present BEFORE the user can scroll. A late arrival is otherwise
    // suppressed for the whole session (suppressLatePastOrdersRef) to avoid a
    // layout jump, which is the root cause of the section "sometimes" not showing.
    // Cache initialData keeps warm revisits instant; the fetch reconciles in place.
    enabled: !!merchantId,
    staleTime: 2 * 60 * 1000,
    initialData: cachedMyOrders,
    initialDataUpdatedAt: getMyOrdersCachedAt(),
    placeholderData: (previous) => previous ?? cachedMyOrders,
  });

  const { data: similarMerchants = EMPTY_SIMILAR_MERCHANTS } = useQuery({
    queryKey: ["similar-merchants", merchantId, coords?.latitude, coords?.longitude],
    queryFn: () =>
      merchantService.getMerchants({
        lat: coords?.latitude,
        lng: coords?.longitude,
        limit: 8,
      }),
    enabled: !!merchantId && coords != null && secondaryQueriesReady,
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

  pastOrderCountRef.current = pastOrderItems.length;

  /** Stable list input — empty if user scrolled before past orders arrived. */
  const pastOrdersForList = useMemo((): PastOrderItem[] => {
    if (suppressLatePastOrdersRef.current) return [];
    return pastOrderItems;
  }, [pastOrderItems]);

  // Diagnostic: state the EXACT reason "Your Orders and Collections" is shown/hidden.
  useEffect(() => {
    if (!__DEV__) return;
    const reason = !merchant?.menu?.length
      ? "menu_not_loaded"
      : myOrders.length === 0
        ? "no_order_history"
        : pastOrderItems.length === 0
          ? "no_orders_matched_this_store_or_menu_names"
          : suppressLatePastOrdersRef.current
            ? "suppressed_late_insert_after_deep_scroll"
            : "visible";
    // eslint-disable-next-line no-console
    console.log("[your-orders] visibility decision", {
      merchantId,
      shown: reason === "visible" && pastOrdersForList.length > 0,
      reason,
      ordersFetched: myOrders.length,
      matchedPastOrderItems: pastOrderItems.length,
      menuItems: merchant?.menu?.length ?? 0,
    });
  }, [merchantId, myOrders.length, pastOrderItems.length, pastOrdersForList.length, merchant?.menu?.length]);

  const ratingInsight = useMemo(() => {
    const ratingSource = displayMerchant ?? merchant;
    const storeName = (merchant?.name ?? "").toLowerCase().trim();
    const storeOrders = myOrders.filter((order) => {
      return (
        order.merchantPublicStoreId === merchantId ||
        (order.merchantStoreId != null && String(order.merchantStoreId) === merchantId) ||
        (order.merchantName ?? "").toLowerCase().includes(storeName.slice(0, Math.min(8, storeName.length)))
      );
    });
    const ratedOrders = storeOrders.filter(
      (order) => order.storeRatingSubmitted === true && order.storeRating != null && order.storeRating >= 1
    );
    const userHasRatedStore = ratingSource?.userHasRatedStore === true || ratedOrders.length > 0;
    const forYouRating =
      ratingSource?.forYouRating ??
      (ratedOrders[0]?.storeRating != null ? ratedOrders[0]!.storeRating! : null);

    return {
      userHasRatedStore,
      forYouRating: userHasRatedStore ? forYouRating : null,
    };
  }, [
    displayMerchant,
    merchant,
    merchantId,
    myOrders,
  ]);

  const { data: orderedTogetherRecs } = useQuery({
    queryKey: ["merchant", merchantId, "ordered-together-recs"],
    queryFn: () => merchantService.getOrderedTogetherRecommendations(merchantId),
    enabled: !!merchantId && secondaryQueriesReady,
    staleTime: 5 * 60 * 1000,
  });

  const comboPairs = useMemo(
    () => mapOrderedTogetherPairsToCombos(merchant?.menu ?? [], orderedTogetherRecs?.pairs ?? []),
    [merchant?.menu, orderedTogetherRecs?.pairs]
  );
  comboCountRef.current = comboPairs.length;
  const comboPairsForList = useMemo(() => {
    if (suppressLateComboRef.current) return [];
    return comboPairs;
  }, [comboPairs]);

  const coPurchaseByAnchorId = orderedTogetherRecs?.byAnchorItemId ?? EMPTY_CO_PURCHASE_MAP;

  const pairingCompanionItems = useMemo(() => {
    if (!pairingAnchorKey || !merchant?.menu?.length) return [];
    const menu = merchant.menu;
    const anchor =
      menu.find((m) => m.listRowKey === pairingAnchorKey) ??
      menu.find((m) => m.id === pairingAnchorKey) ??
      menu.find((m) => m.menuItemId != null && String(m.menuItemId) === pairingAnchorKey);
    if (!anchor) return [];
    return resolvePairingCompanionsForAnchor(
      menu,
      anchor,
      coPurchaseByAnchorId,
      orderedTogetherRecs?.pairs ?? []
    );
  }, [merchant?.menu, pairingAnchorKey, coPurchaseByAnchorId, orderedTogetherRecs?.pairs]);

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
        searchQuery: debouncedMenuSearchQuery,
        // Applying the sheet's diet pills clears the quick chip, so the preview count has
        // to be computed against that same post-apply state or Apply(N) lies.
        quickFilter: f.veg || f.egg || f.nonveg ? "all" : filter,
        highlyReorderedIds,
        advanced: f,
      }).length,
    [merchant?.menu, debouncedMenuSearchQuery, highlyReorderedIds, filter]
  );

  /**
   * The quick chips and the filter sheet's pills are two controls for one preference, and
   * they were ANDed together — chip "Non-veg" + sheet "Veg" could only ever match nothing.
   * Setting one now clears the other.
   */
  const handleFilterChange = useCallback((id: StoreFilterId) => {
    setFilter((prev) => (prev === id ? "all" : id));
    if (id === "veg" || id === "egg" || id === "nonveg") {
      setAdvancedFilters((prev) =>
        prev.veg || prev.egg || prev.nonveg
          ? { ...prev, veg: false, egg: false, nonveg: false }
          : prev
      );
    } else if (id === "highlyreordered") {
      setAdvancedFilters((prev) =>
        prev.highlyReordered ? { ...prev, highlyReordered: false } : prev
      );
    }
  }, []);

  const handleApplyAdvancedFilters = useCallback((next: StoreMenuFilterState) => {
    setAdvancedFilters(next);
    if (next.veg || next.egg || next.nonveg) setFilter("all");
    if (next.highlyReordered) {
      setFilter((prev) => (prev === "highlyreordered" ? "all" : prev));
    }
  }, []);

  const merchantLogoUri = useMemo(() => {
    const m = merchant as { logo_url?: string | null; logoUrl?: string | null } | undefined;
    const raw = m?.logo_url ?? m?.logoUrl ?? null;
    return raw ? (toAbsoluteImageUrl(raw) ?? raw) : null;
  }, [merchant]);

  const offerTickerTexts = useMemo(
    () => offerTextsFromStoreOffers(storeOffersData, merchant?.offerText),
    [storeOffersData, merchant?.offerText]
  );

  const reserveOfferRow = useMemo(
    () =>
      offerTickerTexts.length > 0 ||
      Boolean(merchant?.offerText?.trim()) ||
      Boolean(syncStoreOffers) ||
      (storeOffersPending && !storeOffersData),
    [offerTickerTexts.length, merchant?.offerText, syncStoreOffers, storeOffersPending, storeOffersData]
  );

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
  const replaceLine = useCartStore((s) => s.replaceLine);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  /**
   * Do NOT subscribe to cart line count / merchantId here. First-add used to flip
   * `cartLineCount` 0→1 and re-render this entire full-mount menu host before the
   * Continue dock could paint. Dock + per-row qty own their own store selectors.
   */

  const getQty = useCallback(
    (itemId: string, menuItemId?: number) => {
      const { items, merchantId: mid } = useCartStore.getState();
      if (!merchantCartMatchesRoute(mid, merchantId)) return 0;
      const numId = menuItemId != null ? String(menuItemId) : null;
      return items.reduce((sum, i) => {
        if (i.menuItemId === itemId || i.menuItemId.startsWith(itemId + "_")) return sum + i.quantity;
        if (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_"))) return sum + i.quantity;
        return sum;
      }, 0);
    },
    [merchantId]
  );

  const resolveCartPrefillForItem = useCallback(
    (item: MenuItem) => {
      const { items, merchantId: mid } = useCartStore.getState();
      if (!merchantCartMatchesRoute(mid, merchantId)) return null;
      return findCartLinePrefillForMenuItem({
        cartItems: items,
        menuItemId: String(item.id),
        menuItemNumericId: item.menuItemId ?? null,
      });
    },
    [merchantId]
  );

  const openCustomizationSheet = useCallback(
    (item: MenuItem) => {
      const prefill = resolveCartPrefillForItem(item);
      setCustomizationEditLineId(prefill?.lineId ?? null);
      setCustomizationSiblingLineIds(prefill?.siblingLineIds ?? []);
      setCustomizationInitialSelection(
        prefill
          ? {
              variantId: prefill.variantId,
              variantName: prefill.variantName,
              addons: prefill.addons,
              specialInstructions: prefill.specialInstructions,
              quantity: prefill.quantity,
            }
          : null
      );
      setCustomizationItem(item);
      setCustomizationSheetVisible(true);
      if (merchantId) {
        void prefetchMenuItemFullConfig(
          queryClient,
          merchantId,
          resolveFullConfigItemId(item)
        );
      }
    },
    [merchantId, queryClient, resolveCartPrefillForItem]
  );

  const handleAddItem = useCallback(
    (item: MenuItem, quantity = 1, specialInstructions?: string | null) => {
      // Never no-op after optimistic UI — menu rows only render when we have an id.
      const storeName = (merchant?.name ?? "Restaurant").trim() || "Restaurant";
      if (!merchantId) return;
      const needsCustomization = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
      if (needsCustomization) {
        openCustomizationSheet(item);
        return;
      }
      // Minimal sync cart write — eligibility / pairing deferred so UI stays snappy.
      addItem(
        merchantId,
        storeName,
        {
          menuItemId: String(item.menuItemId != null ? item.menuItemId : item.id),
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
          imageUrl: item.imageUrl ?? null,
          specialInstructions: specialInstructions ?? null,
        },
        Math.max(1, quantity),
        cartMerchantBannerUrl
      );
      const pairingKey = item.listRowKey ?? item.id;
      const offer =
        itemOfferById.get(item.id) ??
        (item.menuItemId != null ? itemOfferById.get(String(item.menuItemId)) : undefined) ??
        null;
      // Pairing strip rebuilds the full-mount menu — never on the ADD paint path.
      // ~1.2s idle delay so stepper + Continue stay instant.
      setTimeout(() => {
        setPairingAnchorKey(pairingKey);
      }, 1200);
      setTimeout(() => {
        useCartStore.getState().syncDiscountEligibility({
          [String(item.menuItemId != null ? item.menuItemId : item.id)]:
            computeIsDiscountEligible(item, offer),
        });
      }, 1400);
    },
    [
      merchantId,
      merchant?.name,
      addItem,
      cartMerchantBannerUrl,
      itemOfferById,
      openCustomizationSheet,
    ]
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
      specialInstructions?: string | null;
    }) => {
      if (!merchant) return;
      const offerKey = customizationItem?.id;
      const offer =
        (offerKey ? itemOfferById.get(offerKey) : null) ??
        (customizationItem?.menuItemId != null
          ? itemOfferById.get(String(customizationItem.menuItemId))
          : null) ??
        null;
      const lineInput = {
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
        isDiscountEligible: computeIsDiscountEligible(customizationItem, offer),
      };
      const qty = Math.max(1, params.quantity);
      const editLineId = customizationEditLineId;
      const siblings = customizationSiblingLineIds;
      // Editing an existing cart line: replace note/options on the SAME line and
      // drop duplicate siblings — never create a second row just because the note changed.
      if (editLineId) {
        for (const sid of siblings) {
          if (sid) removeItem(sid);
        }
        replaceLine(editLineId, lineInput, qty);
      } else {
        addItem(merchantId, merchant.name, lineInput, qty, cartMerchantBannerUrl);
      }
      setCustomizationSheetVisible(false);
      setCustomizationItem(null);
      setCustomizationInitialSelection(null);
      setCustomizationEditLineId(null);
      setCustomizationSiblingLineIds([]);
    },
    [
      merchantId,
      merchant,
      addItem,
      replaceLine,
      removeItem,
      customizationItem,
      customizationEditLineId,
      customizationSiblingLineIds,
      cartMerchantBannerUrl,
      itemOfferById,
    ]
  );
  const getCartLineIdForItem = useCallback(
    (itemId: string, menuItemId?: number): string | null => {
      const { items, merchantId: mid } = useCartStore.getState();
      if (!merchantCartMatchesRoute(mid, merchantId)) return null;
      const numId = menuItemId != null ? String(menuItemId) : null;
      const line = items.find(
        (i) =>
          i.menuItemId === itemId ||
          i.menuItemId.startsWith(itemId + "_") ||
          (numId != null && (i.menuItemId === numId || i.menuItemId.startsWith(numId + "_")))
      );
      return line?.lineId ?? null;
    },
    [merchantId]
  );

  const findMenuItemForCart = useCallback(
    (itemId: string, menuItemId?: number): MenuItem | null => {
      const menu = merchant?.menu;
      if (!menu?.length) return null;
      const numId = menuItemId != null ? String(menuItemId) : null;
      return (
        menu.find(
          (m) =>
            m.id === itemId ||
            m.listRowKey === itemId ||
            (numId != null &&
              ((m.menuItemId != null && String(m.menuItemId) === numId) || m.id === numId))
        ) ?? null
      );
    },
    [merchant?.menu]
  );

  const handleIncrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      // An increment only ever bumps an EXISTING line. If the line is gone (item was
      // removed), do nothing — never auto-add. Re-adding must be an explicit +Add /
      // Add Item tap (which routes through onAdd → handleAddItem, not onIncrement).
      // A "+" is only reachable while the stepper is shown, i.e. the line exists; the
      // add write for a brand-new item lands within a frame, so this never drops a tap.
      if (!lineId) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log("[cart-qty] increment_skipped_no_line", { itemId, menuItemId });
        }
        return;
      }
      updateQuantity(lineId, 1);
    },
    [getCartLineIdForItem, updateQuantity]
  );
  const handleDecrement = useCallback(
    (itemId: string, menuItemId?: number) => {
      const lineId = getCartLineIdForItem(itemId, menuItemId);
      if (!lineId) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log("[cart-qty] decrement_skipped_no_line", { itemId, menuItemId });
        }
        return;
      }
      updateQuantity(lineId, -1);
    },
    [getCartLineIdForItem, updateQuantity]
  );

  const handleOpenItemDetails = useCallback(
    (item: MenuItem) => {
      const needsCustomization = !!(
        item.hasVariants ||
        item.hasAddons ||
        item.hasCustomizations
      );
      if (needsCustomization) {
        openCustomizationSheet(item);
        return;
      }
      const prefill = resolveCartPrefillForItem(item);
      setDetailEditLineId(prefill?.lineId ?? null);
      setDetailSiblingLineIds(prefill?.siblingLineIds ?? []);
      setDetailInitialSelection(
        prefill
          ? {
              specialInstructions: prefill.specialInstructions,
              quantity: prefill.quantity,
            }
          : null
      );
      setDetailItem(item);
    },
    [openCustomizationSheet, resolveCartPrefillForItem]
  );

  const handleCloseItemDetails = useCallback(() => {
    setDetailItem(null);
    setDetailInitialSelection(null);
    setDetailEditLineId(null);
    setDetailSiblingLineIds([]);
  }, []);

  const handleAddFromItemDetails = useCallback(
    (item: MenuItem, quantity: number, specialInstructions?: string | null) => {
      const needsCustomization = !!(
        item.hasVariants ||
        item.hasAddons ||
        item.hasCustomizations
      );
      const editLineId = detailEditLineId;
      const siblings = detailSiblingLineIds;
      setDetailItem(null);
      setDetailInitialSelection(null);
      setDetailEditLineId(null);
      setDetailSiblingLineIds([]);
      if (needsCustomization) {
        setTimeout(() => handleAddItem(item), 180);
        return;
      }
      // Editing cooking note on an existing simple item: update that line in place
      // (replace note, keep qty unless the user changed the stepper). Do not add a
      // second cart row when the note text changes.
      if (editLineId) {
        for (const sid of siblings) {
          if (sid) removeItem(sid);
        }
        replaceLine(
          editLineId,
          {
            menuItemId: String(item.menuItemId != null ? item.menuItemId : item.id),
            name: item.name,
            price: item.price,
            isVeg: item.isVeg,
            imageUrl: item.imageUrl ?? null,
            specialInstructions: specialInstructions ?? null,
          },
          Math.max(1, quantity)
        );
        return;
      }
      handleAddItem(item, quantity, specialInstructions);
    },
    [handleAddItem, detailEditLineId, detailSiblingLineIds, replaceLine, removeItem]
  );

  const sections = useMemo(() => {
    const menu = merchant?.menu;
    if (!menu || !Array.isArray(menu) || menu.length === 0) return [];
    const list = filterMenuItems(menu, {
      searchQuery: debouncedMenuSearchQuery,
      quickFilter: filter,
      advanced: advancedFilters,
      highlyReorderedIds,
    });
    if (advancedFilters.sortBy !== "default") {
      const title =
        advancedFilters.sortBy === "price_asc" ? "Price: low to high" : "Price: high to low";
      return attachListRowKeys(buildSortedMenuSection(list, title));
    }
    return attachListRowKeys(buildMenuSections(list));
  }, [merchant?.menu, filter, debouncedMenuSearchQuery, advancedFilters, highlyReorderedIds]);

  const catalogSections = useMemo((): MenuSection[] => {
    const menu = merchant?.menu;
    if (!menu || !Array.isArray(menu) || menu.length === 0) return [];
    return attachListRowKeys(buildMenuSections(menu));
  }, [merchant?.menu]);

  const sectionStartingPrice = useMemo(
    () => lowestAvailableMenuPrice(merchant?.menu ?? []),
    [merchant?.menu]
  );

  useEffect(() => {
    focusItemHandledRef.current = null;
    setHighlightedMenuItemKey(null);
    setSelectedMenuOfferId(null);
    pendingMenuNavRef.current = null;
  }, [merchantId]);

  useEffect(() => {
    const target = focusItemId?.trim();
    if (!target) return;
    setFilter("all");
    setMenuSearchQuery("");
    setAdvancedFilters(DEFAULT_STORE_MENU_FILTERS);
  }, [focusItemId]);

  const stickySearchHint = useMemo(() => {
    const n = (merchant?.name ?? "menu").trim();
    return n.length > 0 ? `Search in ${n}` : "Search menu";
  }, [merchant?.name]);

  const openOffersSheet = useCallback(() => setOffersSheetVisible(true), []);
  const closeOffersSheet = useCallback(() => setOffersSheetVisible(false), []);
  const openScheduleSheet = useCallback(() => setScheduleSheetVisible(true), []);
  const closeScheduleSheet = useCallback(() => setScheduleSheetVisible(false), []);
  const openRatingSheet = useCallback(() => setRatingSheetVisible(true), []);
  const closeRatingSheet = useCallback(() => setRatingSheetVisible(false), []);
  const openOptionsSheet = useCallback(() => setOptionsSheetVisible(true), []);
  const closeOptionsSheet = useCallback(() => setOptionsSheetVisible(false), []);
  const openReportSheet = useCallback(() => {
    setOptionsSheetVisible(false);
    setReportSheetVisible(true);
  }, []);
  const closeReportSheet = useCallback(() => setReportSheetVisible(false), []);

  const liveStatusFromStore = useStoreStatusStore((s) => s.statusMap[merchantId] ?? null);

  const merchantNextOpenAt =
    liveStatusSnapshot?.nextOpenAt ??
    (merchant as { nextOpenAt?: string | number | null } | undefined)?.nextOpenAt ??
    null;
  const merchantNextCloseAt =
    liveStatusSnapshot?.nextCloseAt ??
    (merchant as { nextCloseAt?: string | number | null } | undefined)?.nextCloseAt ??
    null;

  const merchantLiveStatus =
    merchant != null ? resolveMerchantLiveStatus(merchant, {}) : "CLOSED";
  const effectiveLiveStatus =
    liveStatusSnapshot?.liveStatus ?? liveStatusFromStore ?? merchantLiveStatus ?? "CLOSED";
  const isStoreClosedForStatus =
    merchant != null && effectiveLiveStatus === "CLOSED";

  /** Clearance for Menu FAB / Continue bar — painted inside gray footer, not as white list pad. */
  const footerBottomPadding = useMemo(() => {
    const fabClearance = MENU_FAB_HEIGHT + 12;
    if (!hasMerchantCartItems) {
      return fabClearance + cartDockBottomInset;
    }
    return resolveStoreContinueBarHeight(true, cartDockBottomInset) + fabClearance;
  }, [cartDockBottomInset, hasMerchantCartItems]);

  const listContentContainerStyle = useMemo(() => ({ paddingBottom: 0 }), []);

  /** FAB sits above the reserved Continue dock slot (dock self-hides when cart empty). */
  const floatingFabBottom = useMemo(
    () =>
      hasMerchantCartItems
        ? resolveStoreContinueBarHeight(true, cartDockBottomInset) + 14
        : cartDockBottomInset + 14,
    [cartDockBottomInset, hasMerchantCartItems]
  );

  const handleStoreCartContinue = useCallback(() => {
    if (isStoreClosedForStatus) return;
    void tryNavigateToFoodCheckout(router, queryClient);
  }, [isStoreClosedForStatus, queryClient, router]);

  /**
   * Stable boolean, NOT a live countdown string — the closed banner's live "opens/closes
   * in Xm" text is computed inside MerchantClosedBanner itself (which owns its own 1s
   * tick). This used to be a ticking string threaded through buildFlashListData, which
   * invalidated the whole list's memo — and re-rendered every row — every second.
   */
  const showClosedBanner = merchant != null && isStoreClosedForStatus;
  const rushActiveFromLive = liveStatusSnapshot?.rushActive === true;
  const rushActiveFromMerchant = merchant?.rushActive === true;
  const rushActive = rushActiveFromLive || rushActiveFromMerchant;
  const rushEndsAt =
    liveStatusSnapshot?.rushEndsAt ?? merchant?.rushEndsAt ?? null;
  const rushRemainingMinutes =
    liveStatusSnapshot?.rushRemainingMinutes ?? merchant?.rushRemainingMinutes ?? null;
  const showRushBanner =
    merchant != null && !isStoreClosedForStatus && rushActive;

  const { data: flashListData, indexMap: flashIndexMap } = useMemo(
    () =>
      buildFlashListData({
        sections,
        pastOrderItems: pastOrdersForList,
        comboPairs: comboPairsForList,
        sectionStartingPrice,
        visibleOffersCount: storeOffersBadgeCount,
        showClosedBanner,
        showRushBanner,
        menuPending,
        pairingAnchorKey,
        pairingCompanionItems,
      }),
    [
      sections,
      pastOrdersForList,
      comboPairsForList,
      sectionStartingPrice,
      storeOffersBadgeCount,
      showClosedBanner,
      showRushBanner,
      menuPending,
      pairingAnchorKey,
      pairingCompanionItems,
    ]
  );

  const scrollToMenuTarget = useCallback(
    (target: MenuSheetScrollTarget, highlightItemId?: string | null) => {
      const flatIndex = findFlatIndexForScrollTarget(flashIndexMap, target);
      if (flatIndex == null) return;

      if (highlightItemId) {
        setHighlightedMenuItemKey(highlightItemId);
        setTimeout(() => setHighlightedMenuItemKey(null), 2600);
      }

      // Always scroll from Menu sheet / deep-link — do not gate on prior user scroll.
      cancelScheduledMenuScroll();
      requestAnimationFrame(() => {
        scrollFlashListToFlatIndex(scrollListRef, flatIndex, true, scrollStickyOffset);
      });
    },
    [flashIndexMap, cancelScheduledMenuScroll]
  );

  useEffect(() => {
    const pending = pendingMenuNavRef.current;
    if (!pending) return;
    if (filter !== "all" || menuSearchQuery.trim()) return;
    if (hasActiveAdvancedFilters(advancedFilters)) return;
    if (sections.length === 0) return;

    pendingMenuNavRef.current = null;
    if (pending.offerKey) setSelectedMenuOfferId(pending.offerKey);
    requestAnimationFrame(() =>
      scrollToMenuTarget(pending.scrollTarget, pending.highlightItemId ?? null)
    );
  }, [sections, filter, menuSearchQuery, advancedFilters, scrollToMenuTarget]);

  useEffect(() => {
    const target = focusItemId?.trim();
    if (!target || focusItemHandledRef.current === target) return;
    if (sections.length === 0) return;

    const flatIndex = flashIndexMap.menuItemByKey.get(target);
    if (flatIndex == null) return;

    focusItemHandledRef.current = target;
    setHighlightedMenuItemKey(target);

    const scrollToItem = () => {
      scrollFlashListToFlatIndex(scrollListRef, flatIndex, true, scrollStickyOffset);
    };

    // One frame — no InteractionManager / scroll-started gate (felt like multi-tap lag).
    const t1 = requestAnimationFrame(scrollToItem);
    const clearHighlight = setTimeout(() => setHighlightedMenuItemKey(null), 2600);

    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(clearHighlight);
    };
  }, [focusItemId, sections, flashIndexMap]);

  useEffect(() => {
    if (openCart !== "1" || !merchantId) return;
    const mid = useCartStore.getState().merchantId;
    if (!merchantCartMatchesRoute(mid, merchantId)) return;
    void tryNavigateToFoodCheckout(router, queryClient);
  }, [openCart, merchantId, queryClient, router]);

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

  const menuSheetOfferRows = useMemo((): StoreMenuSheetOfferRow[] => {
    const menu = merchant?.menu ?? [];
    // Menu modal is for jumping to offer items — Boost / BOGO only. Precision is checkout/sheet.
    const merchantOffers = (storeOffersData?.merchant_offers ?? []).filter((o) => {
      if (o.conditions_mode === "precision") return false;
      if (!isItemSurface(o)) return false;
      return !/\bfree\s*del(ivery)?\b/i.test(`${o.label ?? ""} ${o.sub_label ?? ""}`);
    });
    const sorted = [...merchantOffers].sort((a, b) => {
      const pd = offerPriority(b) - offerPriority(a);
      if (pd !== 0) return pd;
      const discA = Number(a.discount_percentage ?? a.discount_value ?? 0);
      const discB = Number(b.discount_percentage ?? b.discount_value ?? 0);
      return discB - discA;
    });

    const rows: StoreMenuSheetOfferRow[] = [];
    for (const offer of sorted) {
      const matched = menu.filter((m) => {
        if (m.inStock === false) return false;
        return offerTargetsItem(offer, {
          id: m.id,
          menuItemId: m.menuItemId ?? null,
          price: getSellingPrice(m),
        });
      });
      const first = matched[0] ?? null;
      if (!first) continue;
      rows.push({
        id: `mo-${offer.id}`,
        title: offer.label || offer.title || "Offer",
        subtitle: offer.sub_label || null,
        count: matched.length,
        scrollTarget: {
          kind: "menu-item",
          itemId: first.id,
          menuItemId: first.menuItemId ?? undefined,
        },
        highlightItemId: first.id,
      });
    }
    return rows;
  }, [storeOffersData?.merchant_offers, merchant?.menu]);

  const selectedMenuOfferNumericId = useMemo(() => {
    if (!selectedMenuOfferId?.startsWith("mo-")) return null;
    const n = Number(selectedMenuOfferId.slice(3));
    return Number.isFinite(n) ? n : null;
  }, [selectedMenuOfferId]);

  const handleMenuSheetSelect = useCallback(
    (section: StoreMenuSheetSection) => {
      setMenuSheetVisible(false);
      setSelectedMenuOfferId(null);

      const needsFilterReset =
        filter !== "all" ||
        menuSearchQuery.trim().length > 0 ||
        hasActiveAdvancedFilters(advancedFilters);

      if (needsFilterReset) {
        pendingMenuNavRef.current = { scrollTarget: section.scrollTarget };
        setFilter("all");
        setMenuSearchQuery("");
        setAdvancedFilters(DEFAULT_STORE_MENU_FILTERS);
        return;
      }

      pendingMenuNavRef.current = null;
      scrollToMenuTarget(section.scrollTarget);
    },
    [filter, menuSearchQuery, advancedFilters, scrollToMenuTarget]
  );

  const handleMenuSheetOfferSelect = useCallback(
    (offer: StoreMenuSheetOfferRow) => {
      setMenuSheetVisible(false);
      setSelectedMenuOfferId(offer.id);

      const needsFilterReset =
        filter !== "all" ||
        menuSearchQuery.trim().length > 0 ||
        hasActiveAdvancedFilters(advancedFilters);

      if (needsFilterReset) {
        pendingMenuNavRef.current = {
          scrollTarget: offer.scrollTarget,
          highlightItemId: offer.highlightItemId,
          offerKey: offer.id,
        };
        setFilter("all");
        setMenuSearchQuery("");
        setAdvancedFilters(DEFAULT_STORE_MENU_FILTERS);
        return;
      }

      pendingMenuNavRef.current = null;
      scrollToMenuTarget(offer.scrollTarget, offer.highlightItemId);
    },
    [filter, menuSearchQuery, advancedFilters, scrollToMenuTarget]
  );

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

  const goBackFromMerchant = useCallback(() => {
    useMerchantNavTransitionStore.getState().hide();
    useScreenChromeStore.getState().resetStatusBarBackground();
    safeRouterBack(router, FOOD_HOME_FALLBACK);
  }, [router]);

  const handleHeroBack = goBackFromMerchant;

  const handleHeroGroupOrder = useCallback(() => {
    setGroupOrderSheetVisible(true);
  }, []);

  const handleMerchantInfoPress = useCallback(() => {
    router.push(`/home/merchant/about/${merchantId}`);
  }, [router, merchantId]);

  const handleOpenFiltersSheet = useCallback(() => {
    setFiltersSheetVisible(true);
  }, []);

  const handleStickyBack = useCallback(() => {
    if (headerSearchExpanded) closeMerchantSearch();
    else goBackFromMerchant();
  }, [headerSearchExpanded, closeMerchantSearch, goBackFromMerchant]);

  const handleCloseFiltersSheet = useCallback(() => {
    setFiltersSheetVisible(false);
  }, []);

  /**
   * Stable hero-action handlers object — passed to the (now memoized) full-mount menu list.
   * An inline `{…}` literal here re-created a new object on every screen re-render, which
   * defeated MerchantDetailFlashList's React.memo and forced the whole mounted menu to
   * reconcile on every cart Add. All four handlers are already useCallback-stable.
   */
  const heroActions = useMemo(
    () => ({
      onBack: handleHeroBack,
      onSearch: openMerchantSearch,
      onGroupOrder: handleHeroGroupOrder,
      onOptions: openOptionsSheet,
    }),
    [handleHeroBack, openMerchantSearch, handleHeroGroupOrder, openOptionsSheet]
  );

  if (!merchantId) {
    return (
      <View style={styles.centered}>
        <AppText style={styles.centeredText}>Invalid merchant</AppText>
      </View>
    );
  }

  // Only full-screen skeleton when we have zero merchant shell (no list placeholder).
  // With a placeholder, paint the real page — menu rows load via menuPending in the list.
  const showInitialLoader = !merchant && (isPending || isFetching);

  if (showInitialLoader) {
    return (
      <View style={styles.container}>
        <MerchantMenuLoadingSkeleton
          merchantId={merchantId}
          startMessageIndex={loadingMessageIndex}
          edgeToEdge
        />
      </View>
    );
  }

  if ((isError || !merchant) && !isPending && !isFetching) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={GatiMitraColors.textSecondary} />
        <AppText style={[styles.centeredText, { marginTop: 12, textAlign: "center", paddingHorizontal: 24 }]}>
          Could not load this restaurant. Check your connection and try again.
        </AppText>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void refetch()}
          activeOpacity={0.85}
        >
          <AppText style={styles.retryBtnText}>Retry</AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }} activeOpacity={0.7}>
          <AppText style={styles.retryLinkText}>Go back</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!merchant) {
    return (
      <View style={styles.container}>
        <MerchantMenuLoadingSkeleton
          merchantId={merchantId}
          startMessageIndex={loadingMessageIndex}
          edgeToEdge
        />
      </View>
    );
  }

  const pageMerchant = displayMerchant ?? merchant;

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar
        hidden={false}
        translucent={false}
        backgroundColor="#FFFFFF"
        barStyle="dark-content"
      />
      <MerchantStickyChrome
        topGutter={headerTopGutter}
        stickySearchStyle={stickySearchStyle}
        stickySearchBgStyle={stickySearchBgStyle}
        pointerEvents={headerSearchExpanded ? "auto" : "box-none"}
        stickySearchActive={stickySearchActive}
        headerSearchExpanded={headerSearchExpanded}
        onBack={handleStickyBack}
        searchRow={
          <View style={styles.stickyHeaderRow}>
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
                <AppText
                  style={[
                    styles.stickySearchHintText,
                    menuSearchQuery.trim().length > 0 && styles.stickySearchHintTextFilled,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {menuSearchQuery.trim().length > 0 ? menuSearchQuery : stickySearchHint}
                </AppText>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openOptionsSheet} style={styles.heroCircleBtnLight} hitSlop={8}>
              <Ionicons name="ellipsis-vertical" size={20} color={StoreTheme.textPrimary} />
            </TouchableOpacity>
          </View>
        }
      />

      <MerchantDetailFlashList
        ref={scrollListRef}
        data={flashListData}
        scrollHandler={scrollHandler}
        contentContainerStyle={listContentContainerStyle}
        heroUri={merchantBannerHeroUri}
        merchantLogoUri={merchantLogoUri}
        merchant={pageMerchant}
        merchantId={merchantId}
        distanceKm={distanceKm}
        storeEtaLabel={storeEtaLabel}
        scheduledSlotLabel={scheduledSlotLabel}
        isStoreClosedForStatus={isStoreClosedForStatus}
        merchantNextOpenAt={merchantNextOpenAt}
        merchantNextCloseAt={merchantNextCloseAt}
        showRushBanner={showRushBanner}
        rushEndsAt={rushEndsAt}
        rushRemainingMinutes={rushRemainingMinutes}
        offerTickerTexts={offerTickerTexts}
        visibleOffersCount={storeOffersBadgeCount}
        reserveOfferRow={reserveOfferRow}
        loadingMessageIndex={loadingMessageIndex}
        onInfoPress={handleMerchantInfoPress}
        onOffersPress={openOffersSheet}
        onSchedulePress={openScheduleSheet}
        onRatingHintPress={openRatingSheet}
        filter={filter}
        onFilterChange={handleFilterChange}
        onOpenFilters={handleOpenFiltersSheet}
        showHighlyReordered={showHighlyReorderedChip}
        filtersActive={filtersActive}
        getQty={getQty}
        onAdd={handleAddItem}
        onItemPress={handleOpenItemDetails}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        isStoreClosed={isStoreClosedForStatus}
        onAddCombo={handleAddCombo}
        onCouponPress={openOffersSheet}
        similarMerchants={filteredSimilarMerchants}
        footerBottomPadding={footerBottomPadding}
        highlightedMenuItemKey={highlightedMenuItemKey}
        highlightedOfferId={selectedMenuOfferNumericId}
        highlyReorderedIds={highlyReorderedIds}
        bookmarkMenuItemIdSet={bookmarkMenuItemIdSet}
        onBookmark={handleBookmarkMenuItem}
        onShare={handleShareMenuItem}
        resolveMenuItemPk={resolveMenuItemPk}
        showHeroActions={heroActionsVisible}
        heroActionsTopPad={heroActionsTopPad}
        heroActions={heroActions}
        onListLayout={handleListLayout}
        itemOfferById={itemOfferById}
      />

      <StoreOffersSheet
        visible={offersSheetVisible}
        onClose={closeOffersSheet}
        storeName={merchant.name}
        offers={sheetOffers}
      />

      <StoreFilterSheet
        visible={filtersSheetVisible}
        onClose={handleCloseFiltersSheet}
        filters={advancedFilters}
        onApply={handleApplyAdvancedFilters}
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

      <MerchantRatingExplainerSheet
        visible={ratingSheetVisible}
        onClose={closeRatingSheet}
        storeName={pageMerchant.name}
        overallRating={pageMerchant.avgRating ?? null}
        totalReviews={pageMerchant.totalReviews ?? null}
        forYouRating={ratingInsight.forYouRating}
        userHasRatedStore={ratingInsight.userHasRatedStore}
      />

      <StoreMenuSheet
        visible={menuSheetVisible}
        onClose={() => setMenuSheetVisible(false)}
        sections={menuSheetSections}
        onSelectSection={handleMenuSheetSelect}
        offerRows={menuSheetOfferRows}
        onSelectOffer={handleMenuSheetOfferSelect}
        selectedOfferId={selectedMenuOfferId}
        largeOrderSection={menuSheetLargeOrder}
      />

      <Modal visible={optionsSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeOptionsSheet}>
          <Pressable style={[styles.optionsSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <AppText style={styles.optionsSheetTitle}>{merchant.name}</AppText>
            <TouchableOpacity style={styles.optionRow} onPress={() => { closeOptionsSheet(); /* Add to Collection */ }}>
              <Ionicons name="bookmark-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>Add to Collection</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); setGroupOrderSheetVisible(true); }}
            >
              <Ionicons name="people-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>Group Order</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { closeOptionsSheet(); router.push(`/home/merchant/about/${merchantId}`); }}
            >
              <Ionicons name="information-circle-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>See more about this restaurant</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={handleShareRestaurant}>
              <Ionicons name="share-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>Share this restaurant</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={closeOptionsSheet}>
              <Ionicons name="eye-off-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>Hide this restaurant</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={openReportSheet}>
              <Ionicons name="warning-outline" size={22} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.optionRowText}>Report fraud or bad practices</AppText>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <AppText style={styles.optionSheetFooter}>
              Menu items, prices, photos and descriptions are set by the restaurant. Report incorrect information.
            </AppText>
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

      <StoreMenuItemDetailSheet
        visible={detailItem != null}
        item={detailItem}
        initialSelection={detailInitialSelection}
        isStoreClosed={isStoreClosedForStatus}
        isBookmarked={
          detailItem != null &&
          (() => {
            const itemPk = resolveMenuItemPk(detailItem);
            return itemPk != null && bookmarkMenuItemIdSet.has(itemPk);
          })()
        }
        itemOffer={
          detailItem
            ? itemOfferById.get(detailItem.id) ??
              (detailItem.menuItemId != null
                ? itemOfferById.get(String(detailItem.menuItemId))
                : undefined) ??
              null
            : null
        }
        onClose={handleCloseItemDetails}
        onAdd={handleAddFromItemDetails}
        onBookmark={handleBookmarkMenuItem}
        onShare={handleShareMenuItem}
      />

      {customizationItem && (
        <ItemCustomizationSheet
          visible={customizationSheetVisible}
          onClose={() => {
            setCustomizationSheetVisible(false);
            setCustomizationItem(null);
            setCustomizationInitialSelection(null);
            setCustomizationEditLineId(null);
            setCustomizationSiblingLineIds([]);
          }}
          storeId={merchantId}
          item={customizationItem}
          merchantName={merchant?.name ?? ""}
          isStoreClosed={isStoreClosedForStatus}
          storeMenu={merchant?.menu ?? []}
          onAddCompanionItem={handleAddItem}
          initialSelection={customizationInitialSelection}
          itemOffer={
            itemOfferById.get(customizationItem.id) ??
            (customizationItem.menuItemId != null
              ? itemOfferById.get(String(customizationItem.menuItemId))
              : undefined) ??
            null
          }
          onAdd={handleCustomizationAdd}
        />
      )}

      <Modal visible={reportSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={closeReportSheet}>
          <Pressable style={[styles.reportSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <AppText style={styles.reportSheetTitle}>Report an issue with the menu</AppText>
            <AppText style={styles.reportSheetSub}>This feedback will be shared directly with the restaurant.</AppText>
            {REPORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.reportOptionRow}
                onPress={() => handleReportSubmit(opt.id)}
                disabled={reportSubmitting}
              >
                <AppText style={styles.reportOptionText}>{opt.label}</AppText>
                <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.cartDock} pointerEvents="box-none">
        <MerchantCartDock
          merchantId={merchantId}
          merchantMenu={merchant?.menu}
          resolvedDeliveryAddress={resolvedDeliveryAddress}
          pincode={pincode}
          state={state}
          city={city}
          isStoreClosedForStatus={isStoreClosedForStatus}
          onContinue={handleStoreCartContinue}
          bottomInset={cartDockBottomInset}
          reserveOfferStrip
        />
      </View>

      {!menuSheetVisible ? (
        <MerchantFloatingFab
          bottom={floatingFabBottom}
          onPress={() => setMenuSheetVisible(true)}
          animatedStyle={fabStyle}
        />
      ) : null}
    </GestureHandlerRootView>
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
    backgroundColor: GatiMitraColors.primaryMint,
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
    color: GatiMitraColors.primaryMint,
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
    paddingVertical: 0,
    gap: 8,
    height: STICKY_SEARCH_ROW_HEIGHT - 4,
    minHeight: STICKY_SEARCH_ROW_HEIGHT - 4,
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
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
  },
  headerImage: {
    width: SCREEN_WIDTH_EXPORT,
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
  cartDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    elevation: 28,
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
