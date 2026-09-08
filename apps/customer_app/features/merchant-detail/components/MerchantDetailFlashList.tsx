import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  Platform,
  RefreshControl,
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { AppText } from "@/components/AppText";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
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
  HEADER_IMAGE_HEIGHT,
  MENU_LOADING_FILL_MIN_HEIGHT,
  MERCHANT_HERO_ACTIONS_TOP_PAD,
  SCREEN_HEIGHT,
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

/**
 * Virtualized merchant menu.
 *
 * FlashList v2 recycles mixed-height cells (hero / info / section / item) with absolute
 * positioning. On Android fling that leaves large white/black holes under the sticky
 * search bar. FlatList windowing keeps nearby rows mounted so that gap never appears,
 * without mounting the whole catalog (full ScrollView OOMs on large menus).
 */
export type MerchantScrollListHandle = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  scrollToIndex: (params: { index: number; animated?: boolean; viewOffset?: number }) => void;
  cancelPendingScroll: () => void;
};

export type MerchantDetailFlashListProps = {
  data: MerchantFlashListItem[];
  heroUri: string | null;
  heroVideoUri?: string | null;
  /** Plain JS onScroll — required for FlashList v2 (not useAnimatedScrollHandler). */
  scrollHandler: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDragExtra?: () => void;
  onScrollEndExtra?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
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
  fssaiNumber?: string | null;
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
  /** Video hero reports measured height so scroll chrome can track banner size. */
  onHeroHeightChange?: (height: number) => void;
  /** Keep hero video playing only while the banner is on screen. */
  shouldPlayHeroVideo?: boolean;
  /** Extend hero media under the translucent status bar (video hero). */
  heroStatusBarInset?: number;
  onListLayout?: () => void;
  itemOfferById?: Map<string, ItemOfferDisplay>;
  /** Shared visit sentence index so inline skeleton matches shutter / full-screen loader. */
  loadingMessageIndex?: number;
  categoryChips?: MerchantCategoryChip[];
  activeCategoryId?: string | null;
  onSelectCategory?: (chip: MerchantCategoryChip) => void;
  onVisibleCategoryChange?: (chipId: string | null) => void;
  scrollY?: SharedValue<number>;
  /** Used with scrollY to fade hero CTAs without React re-renders mid-scroll. */
  heroBannerHeight?: number;
  railStickyTop?: number;
  /** Persistent discovery header height — list/rail start below it. */
  chromeHeight?: number;
  /** Discovery only — vertical category rail beside the masonry menu. */
  showCategoryRail?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Viewports kept mounted above + below the screen. Large enough that a fling never uncovers empty cells. */
const MENU_WINDOW_SIZE = 31;
const MENU_INITIAL_RENDER = Math.min(16, Math.max(8, Math.ceil(SCREEN_HEIGHT / 160)));

const PINNED_HEADER_TYPES = new Set<MerchantFlashListItem["type"]>([
  "hero",
  "info",
  "closed_banner",
  "rush_banner",
  "filter_bar",
  "past_orders",
  "combo_section",
  "section_lead",
]);

function splitPinnedChrome(data: MerchantFlashListItem[]): {
  headerItems: MerchantFlashListItem[];
  listItems: MerchantFlashListItem[];
  footerItem: MerchantFlashListItem | null;
} {
  let i = 0;
  while (i < data.length && PINNED_HEADER_TYPES.has(data[i]!.type)) i += 1;
  let end = data.length;
  if (end > i && data[end - 1]!.type === "footer") end -= 1;
  return {
    headerItems: data.slice(0, i),
    listItems: data.slice(i, end),
    footerItem: end < data.length ? data[end]! : null,
  };
}

const MerchantDetailFlashListInner = forwardRef<
  MerchantScrollListHandle,
  MerchantDetailFlashListProps
>(function MerchantDetailFlashList(props, ref) {
  const {
    data,
    heroUri,
    heroVideoUri,
    scrollHandler,
    onScrollBeginDragExtra,
    onScrollEndExtra,
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
    fssaiNumber = null,
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
    onHeroHeightChange,
    shouldPlayHeroVideo = true,
    heroStatusBarInset = 0,
    onListLayout,
    itemOfferById,
    loadingMessageIndex,
    categoryChips = [],
    activeCategoryId = null,
    onSelectCategory,
    onVisibleCategoryChange,
    scrollY,
    heroBannerHeight = HEADER_IMAGE_HEIGHT,
    chromeHeight = 0,
    showCategoryRail: showCategoryRailProp = false,
    refreshing = false,
    onRefresh,
  } = props;
  const dark = useMerchantUiDark();

  const showCategoryRail = showCategoryRailProp && categoryChips.length > 0;
  const railInset = 0;

  const heroActionsFadeStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1 };
    const hideAt = Math.max(48, heroBannerHeight * 0.72);
    const y = scrollY.value;
    if (y <= hideAt * 0.55) return { opacity: 1 };
    if (y >= hideAt) return { opacity: 0 };
    return { opacity: 1 - (y - hideAt * 0.55) / (hideAt * 0.45) };
  }, [scrollY, heroBannerHeight]);

  const scrollRef = useRef<FlatList<MerchantFlashListItem>>(null);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  const rowOffsetsRef = useRef<Map<string, number>>(new Map());
  const scrollGenerationRef = useRef(0);
  const rebuildScheduledRef = useRef(false);
  const headerCountRef = useRef(0);
  const listLengthRef = useRef(0);

  const { headerItems, listItems, footerItem } = useMemo(() => splitPinnedChrome(data), [data]);
  headerCountRef.current = headerItems.length;
  listLengthRef.current = listItems.length;

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
        scrollRef.current?.scrollToOffset({ offset, animated });
      },
      scrollToIndex: ({ index, animated = true, viewOffset = 0 }) => {
        cancelPendingScroll();
        const listIndex = index - headerCountRef.current;
        if (listIndex < 0) {
          scrollRef.current?.scrollToOffset({ offset: 0, animated });
          return;
        }
        if (listIndex >= listLengthRef.current) {
          scrollRef.current?.scrollToEnd({ animated });
          return;
        }
        try {
          scrollRef.current?.scrollToIndex({
            index: listIndex,
            animated,
            viewOffset,
          });
        } catch {
          // Layout may not be ready — fall back to measured offsets.
          const generation = ++scrollGenerationRef.current;
          const attempt = (retriesLeft: number) => {
            if (generation !== scrollGenerationRef.current) return;
            const row = data[index];
            if (!row) return;
            let y = rowOffsetsRef.current.get(row.key);
            if (y == null) {
              rebuildRowOffsets();
              y = rowOffsetsRef.current.get(row.key);
            }
            if (y != null) {
              scrollRef.current?.scrollToOffset({
                offset: Math.max(0, y - viewOffset),
                animated,
              });
              return;
            }
            if (retriesLeft > 0) {
              requestAnimationFrame(() => attempt(retriesLeft - 1));
            }
          };
          attempt(20);
        }
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
            <MerchantHeroBannerRow
              uri={heroUri}
              videoUri={heroVideoUri}
              merchantId={merchantId}
              statusBarInset={heroStatusBarInset}
              onHeroHeightChange={onHeroHeightChange}
              shouldPlayVideo={shouldPlayHeroVideo}
              scrollY={scrollY}
              pauseVideoAfterY={Math.max(48, heroBannerHeight * 0.85)}
            />
            {showHeroActions ? (
              <Animated.View
                style={[
                  styles.heroActionsOverlay,
                  // `top` (not paddingTop) — absoluteFill + padding was still overlapping on Android.
                  { top: Math.max(8, heroActionsTopPad) },
                  heroActionsFadeStyle,
                ]}
                pointerEvents="box-none"
                collapsable={false}
              >
                <MerchantHeroTopBarContent {...heroActions} />
              </Animated.View>
            ) : null}
          </View>
        );

      case "info":
        if (dark) return <View style={styles.zeroCell} />;
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
        if (item.companions.length === 0) return <View style={styles.zeroCell} />;
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
            fssaiNumber={fssaiNumber}
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
        return <View style={styles.zeroCell} />;
    }
  };

  const renderItem = useCallback<ListRenderItem<MerchantFlashListItem>>(
    ({ item }) => (
      <View
        collapsable={false}
        style={[
          styles.rowShell,
          dark && styles.rowShellDark,
          item.type === "section_header" ? styles.sectionHeaderShell : null,
          item.type === "menu_masonry" ||
          item.type === "empty_menu" ||
          item.type === "menu_loading"
            ? styles.masonryRowShell
            : null,
        ]}
        onLayout={(event) => {
          recordRowLayout(item.key, event.nativeEvent.layout.height);
        }}
      >
        {renderRow(item)}
      </View>
    ),
    // renderRow closes over many props — depend on data identity + chrome that affects cells.
    [
      dark,
      recordRowLayout,
      heroUri,
      heroVideoUri,
      shouldPlayHeroVideo,
      showHeroActions,
      heroActions,
      heroActionsTopPad,
      heroActionsFadeStyle,
      scrollY,
      heroBannerHeight,
      merchant,
      merchantId,
      highlightedMenuItemKey,
      highlightedOfferId,
      highlyReorderedIds,
      bookmarkMenuItemIdSet,
      itemOfferById,
      isStoreClosed,
      showCategoryRail,
    ]
  );

  const listHeader = useMemo(
    () => (
      <View collapsable={false} style={dark ? styles.headerHostDark : styles.headerHost}>
        {headerItems.map((item) => (
          <View
            key={item.key}
            collapsable={false}
            style={[
              styles.headerRowShell,
              dark && styles.rowShellDark,
              item.type === "info" ? styles.infoRowShell : null,
              item.type === "hero"
                ? { height: Math.max(HEADER_IMAGE_HEIGHT, heroBannerHeight) }
                : null,
            ]}
            onLayout={(event) => {
              recordRowLayout(item.key, event.nativeEvent.layout.height);
            }}
          >
            {renderRow(item)}
          </View>
        ))}
      </View>
    ),
    [
      headerItems,
      dark,
      recordRowLayout,
      heroUri,
      heroVideoUri,
      shouldPlayHeroVideo,
      showHeroActions,
      heroActions,
      heroActionsTopPad,
      heroActionsFadeStyle,
      scrollY,
      heroBannerHeight,
      merchant,
      merchantId,
      isStoreClosed,
      itemOfferById,
    ]
  );

  const listFooter = useMemo(() => {
    if (!footerItem) return null;
    return (
      <View
        collapsable={false}
        style={[styles.rowShell, dark && styles.rowShellDark]}
        onLayout={(event) => {
          recordRowLayout(footerItem.key, event.nativeEvent.layout.height);
        }}
      >
        {renderRow(footerItem)}
      </View>
    );
  }, [
    footerItem,
    dark,
    recordRowLayout,
    similarMerchants,
    footerBottomPadding,
    fssaiNumber,
  ]);

  const keyExtractor = useCallback((item: MerchantFlashListItem) => item.key, []);

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
        <FlatList
          ref={scrollRef}
          style={StyleSheet.flatten([styles.list, dark && styles.listDark])}
          data={listItems}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={{
            highlightedMenuItemKey,
            highlightedOfferId,
            isStoreClosed,
            bookmarkMenuItemIdSet,
            itemOfferById,
          }}
          removeClippedSubviews={false}
          windowSize={MENU_WINDOW_SIZE}
          initialNumToRender={MENU_INITIAL_RENDER}
          maxToRenderPerBatch={16}
          updateCellsBatchingPeriod={16}
          onEndReachedThreshold={2}
          contentContainerStyle={[styles.listContent, dark && styles.listContentDark, contentContainerStyle]}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled={false}
          showsVerticalScrollIndicator
          bounces
          delaysContentTouches={false}
          overScrollMode="never"
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
          onScrollBeginDrag={() => {
            markMerchantMenuScrollActive();
            onScrollBeginDragExtra?.();
          }}
          onMomentumScrollBegin={markMerchantMenuScrollActive}
          onScrollEndDrag={(event) => {
            markMerchantMenuScrollEnded();
            onScrollEndExtra?.(event);
            onVisibleCategoryChange?.(
              resolveVisibleCategoryId(event.nativeEvent.contentOffset.y)
            );
          }}
          onMomentumScrollEnd={(event) => {
            markMerchantMenuScrollEnded();
            onScrollEndExtra?.(event);
            onVisibleCategoryChange?.(
              resolveVisibleCategoryId(event.nativeEvent.contentOffset.y)
            );
          }}
          onScrollToIndexFailed={(info) => {
            const offset = Math.max(0, info.averageItemLength * info.index);
            scrollRef.current?.scrollToOffset({ offset, animated: false });
            requestAnimationFrame(() => {
              if (info.index < listLengthRef.current) {
                scrollRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                  viewOffset: 8,
                });
              }
            });
          }}
          {...(Platform.OS === "android"
            ? { overScrollMode: onRefresh ? ("auto" as const) : ("never" as const), persistentScrollbar: false }
            : null)}
        />
      </View>
    </View>
  );
});

/**
 * Virtualized menu host — nearby rows stay mounted so fling never shows a blank gap.
 * Memo so cart qty updates do not reconcile the whole list (rows subscribe to cart themselves).
 */
export const MerchantDetailFlashList = React.memo(MerchantDetailFlashListInner);

const styles = StyleSheet.create({
  listHost: {
    flex: 1,
    zIndex: 0,
    backgroundColor: StoreTheme.background,
  },
  listHostDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  split: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    minWidth: 0,
    overflow: "visible",
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
    backgroundColor: StoreTheme.background,
  },
  listDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  listContent: {
    backgroundColor: StoreTheme.background,
    paddingBottom: 8,
  },
  listContentDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  headerHost: {
    backgroundColor: StoreTheme.background,
    overflow: "visible",
  },
  headerHostDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  headerRowShell: {
    backgroundColor: StoreTheme.background,
    overflow: "visible",
  },
  zeroCell: {
    height: 0,
    overflow: "hidden",
  },
  sectionHeaderShell: {
    minHeight: 40,
  },
  rowShell: {
    backgroundColor: StoreTheme.background,
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
    paddingHorizontal: 16,
    zIndex: 30,
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
    overflow: "visible",
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
