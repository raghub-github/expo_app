import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { View, Text, StyleSheet, Platform, ScrollView } from "react-native";
import Animated, { type ScrollHandlerProcessed } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { StoreInfoCard } from "@/components/store/StoreInfoCard";
import { StoreFilterBar, type StoreFilterId } from "@/components/store/StoreFilterBar";
import { StorePastOrdersSection } from "@/components/store/StorePastOrdersSection";
import { StoreComboSection } from "@/components/store/StoreComboSection";
import { StoreSectionHeader } from "@/components/store/StoreSectionHeader";
import { StoreFooterSection } from "@/components/store/StoreFooterSection";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { StoreMenuPairingSection } from "@/components/store/StoreMenuPairingSection";
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantFlashListItem } from "../types";
import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem, MerchantSummary } from "@/services/merchant.service";
import { MENU_ITEM_ROW_HEIGHT, MENU_LOADING_FILL_MIN_HEIGHT, MERCHANT_HEADER_TOP_GUTTER } from "../constants/layout";
import { MerchantHeroBannerRow } from "./MerchantHeroBannerRow";
import {
  MerchantHeroTopBarContent,
  type MerchantHeroTopBarActions,
} from "./MerchantHeroTopBar";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

/** Imperative scroll API — same surface as FlashList scroll helpers. */
export type MerchantScrollListHandle = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  scrollToIndex: (params: { index: number; animated?: boolean; viewOffset?: number }) => void;
  /** Abort in-flight scrollToIndex retries after the user drags. */
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
  offerTickerTexts: string[];
  visibleOffersCount: number;
  /** Keep offer strip height reserved while offers warm from cache/network. */
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
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed: boolean;
  onAddCombo: (combo: ComboPair) => void;
  onCouponPress: () => void;
  similarMerchants: MerchantSummary[];
  highlightedMenuItemKey: string | null;
  highlyReorderedIds: Set<string>;
  bookmarkMenuItemIdSet: Set<number>;
  onBookmark: (item: MenuItem) => void;
  onShare: (item: MenuItem) => void;
  resolveMenuItemPk: (item: MenuItem) => number | null;
  showHeroActions: boolean;
  heroActions: MerchantHeroTopBarActions;
  onListLayout?: () => void;
};

export const MerchantDetailFlashList = forwardRef<
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
    onIncrement,
    onDecrement,
    isStoreClosed,
    onAddCombo,
    onCouponPress,
    similarMerchants,
    highlightedMenuItemKey,
    highlyReorderedIds,
    bookmarkMenuItemIdSet,
    onBookmark,
    onShare,
    resolveMenuItemPk,
    showHeroActions,
    heroActions,
    onListLayout,
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
        attempt(6);
      },
    }),
    [cancelPendingScroll, data]
  );

  const recordRowLayout = useCallback(
    (key: string, height: number) => {
      if (height <= 0) return;
      if (rowHeightsRef.current.has(key)) return;
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
                style={[styles.heroActionsOverlay, { paddingTop: MERCHANT_HEADER_TOP_GUTTER }]}
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
          <View style={styles.closedBanner}>
            <View style={styles.closedBannerIconWrap}>
              <Ionicons name="time-outline" size={18} color="#fff" />
            </View>
            <Text style={styles.closedBannerText}>{item.message}</Text>
          </View>
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
            getQty={getQty}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
          />
        );

      case "combo_section":
        return (
          <StoreComboSection
            combos={item.combos}
            onAddCombo={onAddCombo}
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
            <Text style={styles.sectionHeaderText}>{item.title}</Text>
          </View>
        );

      case "menu_item": {
        const menuItem = item.item;
        const menuItemPk = resolveMenuItemPk(menuItem);
        return (
          <StoreMenuItemRow
            item={menuItem}
            merchantId={merchantId}
            goesWithName={null}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            isStoreClosed={isStoreClosed}
            showDivider={item.showDivider}
            isHighlyReordered={highlyReorderedIds.has(menuItem.id)}
            isBookmarked={menuItemPk != null && bookmarkMenuItemIdSet.has(menuItemPk)}
            highlighted={
              highlightedMenuItemKey != null &&
              (menuItem.id === highlightedMenuItemKey ||
                (menuItem.menuItemId != null &&
                  String(menuItem.menuItemId) === highlightedMenuItemKey))
            }
            onBookmark={onBookmark}
            onShare={onShare}
          />
        );
      }

      case "pairing_strip":
        return (
          <StoreMenuPairingSection
            companions={item.companions}
            merchantId={merchantId}
            onAdd={onAdd}
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
            <Text style={styles.emptyMenuText}>No items match the selected filters.</Text>
          </View>
        );

      case "menu_skeleton":
        return <MerchantMenuLoadingSkeleton merchantId={merchantId} variant="inline" />;

      case "menu_loading":
        return (
          <View style={[styles.menuLoading, { minHeight: MENU_LOADING_FILL_MIN_HEIGHT }]}>
            <MerchantMenuLoadingSkeleton merchantId={merchantId} variant="inline" />
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
        showsVerticalScrollIndicator
        removeClippedSubviews={false}
        bounces
        {...(Platform.OS === "android" ? { overScrollMode: "never" as const } : {})}
      >
        {data.map((item) => (
          <View
            key={item.key}
            collapsable={false}
            style={[
              styles.rowShell,
              item.type === "menu_item" ? { minHeight: MENU_ITEM_ROW_HEIGHT } : null,
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
  /** No flexGrow — content height = rendered rows only (prevents white overscroll gaps). */
  listContent: {
    backgroundColor: StoreTheme.background,
    paddingBottom: 8,
  },
  rowShell: {
    backgroundColor: StoreTheme.background,
  },
  heroCell: {
    position: "relative",
    backgroundColor: StoreTheme.background,
  },
  heroActionsOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 12,
    zIndex: 4,
    justifyContent: "flex-start",
  },
  menuLoading: {
    backgroundColor: StoreTheme.background,
    paddingTop: 4,
  },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#374151",
  },
  closedBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#fff",
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
