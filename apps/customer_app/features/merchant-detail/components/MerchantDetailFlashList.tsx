import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { View, StyleSheet, Platform, ScrollView, RefreshControl } from "react-native";
import { AppText } from "@/components/AppText";
import Animated, {
  type ScrollHandlerProcessed,
  type SharedValue,
} from "react-native-reanimated";
import { StoreInfoCard } from "@/components/store/StoreInfoCard";
import { StoreFilterBar, type StoreFilterId } from "@/components/store/StoreFilterBar";
import { StorePastOrdersSection } from "@/components/store/StorePastOrdersSection";
import { StoreComboSection } from "@/components/store/StoreComboSection";
import { StoreSectionHeader } from "@/components/store/StoreSectionHeader";
import { StoreFooterSection } from "@/components/store/StoreFooterSection";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { StoreMenuPairingSection } from "@/components/store/StoreMenuPairingSection";
import { MerchantClosedBanner } from "./MerchantClosedBanner";
import { MerchantRushBanner } from "./MerchantRushBanner";
import { MerchantCategoryRail } from "./MerchantCategoryRail";
import { MerchantMenuMasonrySection } from "./MerchantMenuMasonrySection";
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "../merchantUiTheme";
import type { MerchantCategoryChip, MerchantFlashListItem } from "../types";
import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem, MerchantSummary } from "@/services/merchant.service";
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import {
  CATEGORY_RAIL_WIDTH,
  MENU_ITEM_ROW_HEIGHT,
  MENU_LOADING_FILL_MIN_HEIGHT,
  MERCHANT_HERO_ACTIONS_TOP_PAD,
} from "../constants/layout";
import { MerchantHeroBannerRow } from "./MerchantHeroBannerRow";
import {
  MerchantHeroTopBarContent,
  type MerchantHeroTopBarActions,
} from "./MerchantHeroTopBar";
import {
  markMerchantMenuScrollActive,
  markMerchantMenuScrollEnded,
} from "@/lib/merchantMenuScrollGuard";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

/**
 * Full-mount scroll list (not FlashList virtualization).
 * Fast fling must never show blank white gaps between menu rows.
 */
export type MerchantScrollListHandle = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  scrollToIndex: (params: { index: number; animated?: boolean; viewOffset?: number }) => void;
  cancelPendingScroll: () => void;
};

export type MerchantDetailFlashListProps = {
  data: MerchantFlashListItem[];
  heroUri: string | null;
  scrollHandler: ScrollHandlerProcessed;
  contentContainerStyle?: object;
  merchantLogoUri: string | null;
  merchant: MerchantSummary;
  merchantId: string;
  distanceKm: number | null;
  storeEtaLabel: string;
  scheduledSlotLabel: string | null;
  isStoreClosedForStatus: boolean;
  merchantNextOpenAt?: string | number | null;
  merchantNextCloseAt?: string | number | null;
  showRushBanner?: boolean;
  rushEndsAt?: string | number | null;
  rushRemainingMinutes?: number | null;
  offerTickerTexts: string[];
  visibleOffersCount: number;
  reserveOfferRow?: boolean;
  onInfoPress: () => void;
  onOffersPress: () => void;
  onSchedulePress: () => void;
  onRatingHintPress?: () => void;
  filter: StoreFilterId;
  onFilterChange: (id: StoreFilterId) => void;
  onOpenFilters: () => void;
  showHighlyReordered: boolean;
  filtersActive: boolean;
  getQty: (itemId: string, menuItemId?: number) => number;
  onAdd: (item: MenuItem) => void;
  onItemPress: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed: boolean;
  onAddCombo: (combo: ComboPair) => void;
  onCouponPress: () => void;
  similarMerchants: MerchantSummary[];
  /** FAB / cart dock clearance applied inside footer (gray), not as white list padding. */
  footerBottomPadding?: number;
  highlightedMenuItemKey: string | null;
  highlightedOfferId?: number | null;
  highlyReorderedIds: Set<string>;
  bookmarkMenuItemIdSet: Set<number>;
  onBookmark: (item: MenuItem) => void;
  onShare: (item: MenuItem) => void;
  resolveMenuItemPk: (item: MenuItem) => number | null;
  showHeroActions: boolean;
  /** Safe-area + gap above hero CTAs (merchant owns status-bar padding). */
  heroActionsTopPad?: number;
  heroActions: MerchantHeroTopBarActions;
  onListLayout?: () => void;
  itemOfferById?: Map<string, ItemOfferDisplay>;
  /** Shared visit sentence index so inline skeleton matches shutter / full-screen loader. */
  loadingMessageIndex?: number;
  categoryChips?: MerchantCategoryChip[];
  activeCategoryId?: string | null;
  onSelectCategory?: (chip: MerchantCategoryChip) => void;
  onVisibleCategoryChange?: (chipId: string | null) => void;
  scrollY?: SharedValue<number>;
  railStickyTop?: number;
  /** Persistent discovery header height — list/rail start below it. */
  chromeHeight?: number;
  /** Discovery only — vertical category rail beside the masonry menu. */
  showCategoryRail?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

const MerchantDetailFlashListInner = forwardRef<
  MerchantScrollListHandle,
  MerchantDetailFlashListProps
>(function MerchantDetailFlashList(props, ref) {
  const {
    data,
    heroUri,
    scrollHandler,
    contentContainerStyle,
    merchantLogoUri,
    merchant,
    merchantId,
    distanceKm,
    storeEtaLabel,
    scheduledSlotLabel,
    isStoreClosedForStatus,
    merchantNextOpenAt,
    merchantNextCloseAt,
    showRushBanner = false,
    rushEndsAt = null,
    rushRemainingMinutes = null,
    offerTickerTexts,
    visibleOffersCount,
    reserveOfferRow = false,
    onInfoPress,
    onOffersPress,
    onSchedulePress,
    onRatingHintPress,
    filter,
    onFilterChange,
    onOpenFilters,
    showHighlyReordered,
    filtersActive,
    getQty,
    onAdd,
    onItemPress,
    onIncrement,
    onDecrement,
    isStoreClosed,
    onAddCombo,
    onCouponPress,
    similarMerchants,
    footerBottomPadding = 0,
    highlightedMenuItemKey,
    highlightedOfferId = null,
    highlyReorderedIds,
    bookmarkMenuItemIdSet,
    onBookmark,
    onShare,
    resolveMenuItemPk,
    showHeroActions,
    heroActionsTopPad = MERCHANT_HERO_ACTIONS_TOP_PAD,
    heroActions,
    onListLayout,
    itemOfferById,
    loadingMessageIndex,
    categoryChips = [],
    activeCategoryId = null,
    onSelectCategory,
    onVisibleCategoryChange,
    chromeHeight = 0,
    showCategoryRail: showCategoryRailProp = false,
    refreshing = false,
    onRefresh,
  } = props;
  const dark = useMerchantUiDark();

  const showCategoryRail = showCategoryRailProp && categoryChips.length > 0;
  const railInset = 0;

  const scrollRef = useRef<ScrollView>(null);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  const rowOffsetsRef = useRef<Map<string, number>>(new Map());
  const scrollGenerationRef = useRef(0);
  const rebuildScheduledRef = useRef(false);

  const dataLayoutKey = useMemo(() => data.map((row) => row.key).join("\0"), [data]);

  const rebuildRowOffsets = useCallback(() => {
    rebuildScheduledRef.current = false;
    rowOffsetsRef.current.clear();
    let offset = 0;
    for (const row of data) {
      rowOffsetsRef.current.set(row.key, offset);
      const height = rowHeightsRef.current.get(row.key);
      if (height == null) break;
      offset += height;
    }
  }, [data]);

  /**
   * Drop heights for rows that left the list, but KEEP the ones that stayed. Clearing every
   * height on any data change (filter reset, pairing strip, banner toggle) lost the
   * measurements of rows that did not remount — and since those rows never fire onLayout
   * again, offsets were never rebuilt and scroll-to-category silently did nothing.
   */
  useEffect(() => {
    const liveKeys = new Set(data.map((row) => row.key));
    for (const key of Array.from(rowHeightsRef.current.keys())) {
      if (!liveKeys.has(key)) rowHeightsRef.current.delete(key);
    }
    rebuildRowOffsets();
  }, [dataLayoutKey, data, rebuildRowOffsets]);

  const scheduleRebuildRowOffsets = useCallback(() => {
    if (rebuildScheduledRef.current) return;
    rebuildScheduledRef.current = true;
    requestAnimationFrame(rebuildRowOffsets);
  }, [rebuildRowOffsets]);

  const cancelPendingScroll = useCallback(() => {
    scrollGenerationRef.current += 1;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      cancelPendingScroll,
      scrollToOffset: ({ offset, animated = true }) => {
        cancelPendingScroll();
        scrollRef.current?.scrollTo({ y: offset, animated });
      },
      scrollToIndex: ({ index, animated = true, viewOffset = 0 }) => {
        const generation = ++scrollGenerationRef.current;
        const attempt = (retriesLeft: number) => {
          if (generation !== scrollGenerationRef.current) return;
          const row = data[index];
          if (!row) return;
          let y = rowOffsetsRef.current.get(row.key);
          if (y == null) {
            // Rows below may have measured since the last rebuild.
            rebuildRowOffsets();
            y = rowOffsetsRef.current.get(row.key);
          }
          if (y != null) {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - viewOffset), animated });
            return;
          }
          if (retriesLeft > 0) {
            requestAnimationFrame(() => attempt(retriesLeft - 1));
          }
        };
        attempt(20);
      },
    }),
    [cancelPendingScroll, data, rebuildRowOffsets]
  );

  const recordRowLayout = useCallback(
    (key: string, height: number) => {
      if (height <= 0) return;
      const prev = rowHeightsRef.current.get(key);
      if (prev === height) return;
      rowHeightsRef.current.set(key, height);
      scheduleRebuildRowOffsets();
    },
    [scheduleRebuildRowOffsets]
  );

  const resolveVisibleCategoryId = useCallback(
    (scrollOffset: number) => {
      if (categoryChips.length === 0) return null;
      const probe = scrollOffset + 12;
      let current: string | null = categoryChips[0]?.id ?? null;
      for (const row of data) {
        if (row.type !== "menu_masonry") continue;
        const y = rowOffsetsRef.current.get(row.key);
        if (y == null || y > probe) break;
        const match = categoryChips.find(
          (chip) =>
            chip.id !== "cat-all" &&
            chip.scrollTarget.kind === "category" &&
            chip.scrollTarget.categoryName?.trim().toLowerCase() === row.title.trim().toLowerCase()
        );
        if (match) current = match.id;
      }
      return current;
    },
    [categoryChips, data]
  );

  const renderRow = (item: MerchantFlashListItem) => {
    switch (item.type) {
      case "hero":
        return (
          <View style={styles.heroCell} collapsable={false}>
            <MerchantHeroBannerRow uri={heroUri} merchantId={merchantId} />
            {showHeroActions ? (
              <View
                style={[
                  styles.heroActionsOverlay,
                  // `top` (not paddingTop) — absoluteFill + padding was still overlapping on Android.
                  { top: Math.max(8, heroActionsTopPad) },
                ]}
                pointerEvents="box-none"
                collapsable={false}
              >
                <MerchantHeroTopBarContent {...heroActions} />
              </View>
            ) : null}
          </View>
        );

      case "info":
        if (dark) return null;
        return (
          <StoreInfoCard
            name={merchant.name}
            logoUrl={merchantLogoUri}
            avgRating={merchant.avgRating}
            totalReviews={merchant.totalReviews}
            distanceKm={distanceKm}
            areaLabel={
              (merchant as { city?: string; address?: string }).city ??
              (merchant as { city?: string; address?: string }).address ??
              undefined
            }
            etaLabel={storeEtaLabel}
            scheduledLabel={scheduledSlotLabel}
            offerTexts={offerTickerTexts}
            offerCount={visibleOffersCount}
            reserveOfferRow={reserveOfferRow}
            isFrequentlyReordered={(merchant.completedOrderCount ?? 0) > 50}
            onInfoPress={onInfoPress}
            onOffersPress={onOffersPress}
            onSchedulePress={onSchedulePress}
            onRatingHintPress={onRatingHintPress}
          />
        );

      case "closed_banner":
        return (
          <MerchantClosedBanner
            merchantLoaded={!!merchant}
            isStoreClosedForStatus={isStoreClosedForStatus}
            nextOpenAt={merchantNextOpenAt}
            nextCloseAt={merchantNextCloseAt}
          />
        );

      case "rush_banner":
        return (
          <MerchantRushBanner
            visible={showRushBanner}
            rushEndsAt={rushEndsAt}
            rushRemainingMinutes={rushRemainingMinutes}
          />
        );

      case "filter_bar":
        return (
          <StoreFilterBar
            active={filter}
            onChange={onFilterChange}
            onOpenFilters={onOpenFilters}
            showHighlyReordered={showHighlyReordered}
            filtersActive={filtersActive}
          />
        );

      case "past_orders":
        return (
          <StorePastOrdersSection
            items={item.items}
            merchantId={merchantId}
            onAdd={onAdd}
            onItemPress={onItemPress}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
            itemOfferById={itemOfferById}
          />
        );

      case "combo_section":
        return (
          <StoreComboSection
            combos={item.combos}
            onAddCombo={onAddCombo}
            onItemPress={onItemPress}
            isStoreClosed={isStoreClosed}
          />
        );

      case "section_lead":
        return (
          <View style={railInset ? { paddingLeft: Math.max(0, railInset - 8) } : null}>
            <StoreSectionHeader
              title={item.title}
              couponLink={item.showCouponLink}
              onCouponPress={onCouponPress}
            />
          </View>
        );

      case "section_header":
        return (
          <View style={[styles.sectionHeader, dark && styles.sectionHeaderDark]}>
            <AppText style={[styles.sectionHeaderText, dark && styles.sectionHeaderTextDark]}>{item.title}</AppText>
          </View>
        );

      case "menu_masonry":
        return (
          <MerchantMenuMasonrySection
            title={item.title}
            items={item.items}
            merchantId={merchantId}
            onAdd={onAdd}
            onItemPress={onItemPress}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
            highlightedMenuItemKey={highlightedMenuItemKey}
            highlightedOfferId={highlightedOfferId}
            highlyReorderedIds={highlyReorderedIds}
            bookmarkMenuItemIdSet={bookmarkMenuItemIdSet}
            onBookmark={onBookmark}
            resolveMenuItemPk={resolveMenuItemPk}
            itemOfferById={itemOfferById}
            railInset={railInset}
          />
        );

      case "menu_item": {
        const menuItem = item.item;
        const menuItemPk = resolveMenuItemPk(menuItem);
        const itemOffer =
          itemOfferById?.get(menuItem.id) ??
          (menuItem.menuItemId != null
            ? itemOfferById?.get(String(menuItem.menuItemId))
            : undefined) ??
          null;
        return (
          <StoreMenuItemRow
            item={menuItem}
            merchantId={merchantId}
            goesWithName={null}
            onAdd={onAdd}
            onItemPress={onItemPress}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
            showDivider={item.showDivider}
            isHighlyReordered={highlyReorderedIds.has(menuItem.id)}
            isBookmarked={menuItemPk != null && bookmarkMenuItemIdSet.has(menuItemPk)}
            highlighted={
              (highlightedMenuItemKey != null &&
                (menuItem.id === highlightedMenuItemKey ||
                  (menuItem.menuItemId != null &&
                    String(menuItem.menuItemId) === highlightedMenuItemKey))) ||
              (highlightedOfferId != null && itemOffer?.offerId === highlightedOfferId)
            }
            onBookmark={onBookmark}
            onShare={onShare}
            itemOffer={itemOffer}
          />
        );
      }

      case "pairing_strip":
        if (item.companions.length === 0) return null;
        return (
          <View style={railInset ? { paddingLeft: railInset } : null}>
            <StoreMenuPairingSection
              companions={item.companions}
              merchantId={merchantId}
              onAdd={onAdd}
              onItemPress={onItemPress}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              isStoreClosed={isStoreClosed}
              showDivider
            />
          </View>
        );

      case "footer":
        return (
          <StoreFooterSection
            similarMerchants={similarMerchants}
            bottomPadding={footerBottomPadding}
          />
        );

      case "empty_menu":
        return (
          <View style={[styles.emptyMenu, dark && styles.emptyMenuDark, railInset ? { paddingLeft: railInset + 8 } : null]}>
            <AppText style={[styles.emptyMenuText, dark && styles.emptyMenuTextDark]}>No items match the selected filters.</AppText>
          </View>
        );

      case "menu_skeleton":
        return (
            <MerchantMenuLoadingSkeleton
              merchantId={merchantId}
              startMessageIndex={loadingMessageIndex}
              variant="inline"
              showRail={!showCategoryRail}
            />
        );

      case "menu_loading":
        return (
          <View
            style={[
              styles.menuLoading,
              dark && styles.menuLoadingDark,
              { minHeight: MENU_LOADING_FILL_MIN_HEIGHT, paddingLeft: railInset },
            ]}
          >
            <MerchantMenuLoadingSkeleton
              merchantId={merchantId}
              startMessageIndex={loadingMessageIndex}
              variant="inline"
              showRail={!showCategoryRail}
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View
      style={[styles.listHost, dark && styles.listHostDark, chromeHeight > 0 ? { paddingTop: chromeHeight } : null]}
      onLayout={() => {
        onListLayout?.();
      }}
    >
      <View style={styles.split}>
        {showCategoryRail && onSelectCategory ? (
          <View style={styles.railColumn}>
            <MerchantCategoryRail
              categories={categoryChips}
              activeCategoryId={activeCategoryId}
              onSelect={onSelectCategory}
            />
          </View>
        ) : null}
        <AnimatedScrollView
          ref={scrollRef}
          style={[styles.list, dark && styles.listDark]}
          contentContainerStyle={[styles.listContent, dark && styles.listContentDark, contentContainerStyle]}
          onScroll={scrollHandler as never}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          removeClippedSubviews={false}
          bounces
          delaysContentTouches={false}
          canCancelContentTouches={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={dark ? MerchantDarkPalette.accent : GatiMitraColors.primaryMint}
                colors={[dark ? MerchantDarkPalette.accent : GatiMitraColors.primaryMint]}
                progressBackgroundColor={dark ? MerchantDarkPalette.card : "#FFFFFF"}
              />
            ) : undefined
          }
          onScrollBeginDrag={markMerchantMenuScrollActive}
          onMomentumScrollBegin={markMerchantMenuScrollActive}
          onScrollEndDrag={(event) => {
            markMerchantMenuScrollEnded();
            onVisibleCategoryChange?.(
              resolveVisibleCategoryId(event.nativeEvent.contentOffset.y)
            );
          }}
          onMomentumScrollEnd={(event) => {
            markMerchantMenuScrollEnded();
            onVisibleCategoryChange?.(
              resolveVisibleCategoryId(event.nativeEvent.contentOffset.y)
            );
          }}
          {...(Platform.OS === "android"
            ? { overScrollMode: onRefresh ? ("auto" as const) : ("never" as const), persistentScrollbar: false }
            : null)}
        >
          {data.map((item) => (
            <View
              key={item.key}
              collapsable={false}
              style={[
                styles.rowShell,
                dark && styles.rowShellDark,
                item.type === "menu_item" ? { minHeight: MENU_ITEM_ROW_HEIGHT } : null,
                item.type === "menu_masonry" ||
                item.type === "empty_menu" ||
                item.type === "menu_loading"
                  ? styles.masonryRowShell
                  : null,
                item.type === "info" ? styles.infoRowShell : null,
              ]}
              onLayout={(event) => {
                recordRowLayout(item.key, event.nativeEvent.layout.height);
              }}
            >
              {renderRow(item)}
            </View>
          ))}
        </AnimatedScrollView>
      </View>
    </View>
  );
});

/**
 * Full-mount menu host — every menu row is mounted (no virtualization), so a re-render of
 * this component reconciles ALL N rows on the JS thread. Individual rows already subscribe
 * to the cart directly (useMenuItemCartQty), so a cart tap must NOT re-render this list at
 * all — it only needs to re-render when its own props change (menu/filter/pairing/highlight).
 * Without this memo, every first-add re-rendered the parent screen (cartLineCount change),
 * which dragged the whole mounted menu through reconciliation in the SAME frame as the tap,
 * stalling the touch/paint pipeline on large menus + slower CPUs (dropped / delayed taps).
 * All props are kept referentially stable by the parent for exactly this reason.
 */
export const MerchantDetailFlashList = React.memo(MerchantDetailFlashListInner);

const styles = StyleSheet.create({
  listHost: {
    flex: 1,
    zIndex: 0,
    backgroundColor: GatiMitraColors.softBackground,
  },
  listHostDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  split: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  railColumn: {
    width: CATEGORY_RAIL_WIDTH,
    alignSelf: "stretch",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    zIndex: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  list: {
    flex: 1,
    minWidth: 0,
    zIndex: 0,
    backgroundColor: GatiMitraColors.softBackground,
  },
  listDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  listContent: {
    backgroundColor: GatiMitraColors.softBackground,
    paddingBottom: 8,
  },
  listContentDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  rowShell: {
    backgroundColor: GatiMitraColors.softBackground,
    overflow: "hidden",
    zIndex: 1,
  },
  rowShellDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  infoRowShell: {
    // Let the rounded card sit above the banner; never clip name / rating / info.
    overflow: "visible",
    zIndex: 3,
    backgroundColor: "transparent",
  },
  heroCell: {
    position: "relative",
    backgroundColor: StoreTheme.background,
    zIndex: 0,
  },
  heroActionsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    zIndex: 4,
    justifyContent: "flex-start",
  },
  menuLoading: {
    backgroundColor: StoreTheme.background,
    paddingTop: 4,
  },
  menuLoadingDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: StoreTheme.background,
  },
  sectionHeaderDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  sectionHeaderText: {
    fontSize: 17,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
  },
  sectionHeaderTextDark: {
    color: MerchantDarkPalette.text,
  },
  emptyMenu: {
    padding: 24,
    alignItems: "center",
    backgroundColor: GatiMitraColors.softBackground,
  },
  emptyMenuDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  masonryRowShell: {
    overflow: "hidden",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  emptyMenuText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
  emptyMenuTextDark: {
    color: MerchantDarkPalette.textMuted,
  },
});
