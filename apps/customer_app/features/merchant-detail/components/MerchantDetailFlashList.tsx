import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { View, StyleSheet, Platform, ScrollView } from "react-native";
import { AppText } from "@/components/AppText";
import Animated, { type ScrollHandlerProcessed } from "react-native-reanimated";
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
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantFlashListItem } from "../types";
import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem, MerchantSummary } from "@/services/merchant.service";
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import {
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
  } = props;

  const scrollRef = useRef<ScrollView>(null);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  const rowOffsetsRef = useRef<Map<string, number>>(new Map());
  const scrollGenerationRef = useRef(0);
  const rebuildScheduledRef = useRef(false);

  const dataLayoutKey = useMemo(() => data.map((row) => row.key).join("\0"), [data]);

  useEffect(() => {
    rowHeightsRef.current.clear();
    rowOffsetsRef.current.clear();
  }, [dataLayoutKey]);

  const rebuildRowOffsets = useCallback(() => {
    rebuildScheduledRef.current = false;
    let offset = 0;
    for (const row of data) {
      rowOffsetsRef.current.set(row.key, offset);
      offset += rowHeightsRef.current.get(row.key) ?? 0;
    }
  }, [data]);

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
          const y = rowOffsetsRef.current.get(row.key);
          if (y != null) {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - viewOffset), animated });
            return;
          }
          if (retriesLeft > 0) {
            requestAnimationFrame(() => attempt(retriesLeft - 1));
          }
        };
        attempt(8);
      },
    }),
    [cancelPendingScroll, data]
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
          <StoreSectionHeader
            title={item.title}
            couponLink={item.showCouponLink}
            onCouponPress={onCouponPress}
          />
        );

      case "section_header":
        return (
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionHeaderText}>{item.title}</AppText>
          </View>
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
        );

      case "footer":
        return <StoreFooterSection similarMerchants={similarMerchants} />;

      case "empty_menu":
        return (
          <View style={styles.emptyMenu}>
            <AppText style={styles.emptyMenuText}>No items match the selected filters.</AppText>
          </View>
        );

      case "menu_skeleton":
        return (
          <MerchantMenuLoadingSkeleton
            merchantId={merchantId}
            startMessageIndex={loadingMessageIndex}
            variant="inline"
          />
        );

      case "menu_loading":
        return (
          <View style={[styles.menuLoading, { minHeight: MENU_LOADING_FILL_MIN_HEIGHT }]}>
            <MerchantMenuLoadingSkeleton
              merchantId={merchantId}
              startMessageIndex={loadingMessageIndex}
              variant="inline"
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View
      style={styles.listHost}
      onLayout={() => {
        onListLayout?.();
      }}
    >
      <AnimatedScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={[styles.listContent, contentContainerStyle]}
        onScroll={scrollHandler as never}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        // Never clip off-screen rows — blank white gaps on fast fling.
        removeClippedSubviews={false}
        bounces
        // First-tap ADD must not wait for scroll gesture settle (Android + iOS).
        delaysContentTouches={false}
        // Keep ADD responder when the finger moves slightly (thumb jitter ≠ scroll).
        canCancelContentTouches={false}
        onScrollBeginDrag={markMerchantMenuScrollActive}
        onMomentumScrollBegin={markMerchantMenuScrollActive}
        onScrollEndDrag={markMerchantMenuScrollEnded}
        onMomentumScrollEnd={markMerchantMenuScrollEnded}
        {...(Platform.OS === "android"
          ? { overScrollMode: "never" as const, persistentScrollbar: false }
          : null)}
      >
        {data.map((item) => (
          <View
            key={item.key}
            collapsable={false}
            style={[
              styles.rowShell,
              item.type === "menu_item" ? { minHeight: MENU_ITEM_ROW_HEIGHT } : null,
              // Info card tucks over the hero — must paint above banner, not clip into it.
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
    backgroundColor: StoreTheme.background,
  },
  list: {
    flex: 1,
    zIndex: 0,
    backgroundColor: StoreTheme.background,
  },
  listContent: {
    backgroundColor: StoreTheme.background,
    paddingBottom: 8,
  },
  rowShell: {
    backgroundColor: StoreTheme.background,
    overflow: "hidden",
    zIndex: 1,
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
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: StoreTheme.background,
  },
  sectionHeaderText: {
    fontSize: 17,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
  },
  emptyMenu: {
    padding: 24,
    alignItems: "center",
    backgroundColor: StoreTheme.background,
  },
  emptyMenuText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
});
