import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { FlashList, type FlashListRef, type ListRenderItemInfo } from "@shopify/flash-list";
import Animated, { type ScrollHandlerProcessed } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import { StoreInfoCard } from "@/components/store/StoreInfoCard";
import { StoreFilterBar, type StoreFilterId } from "@/components/store/StoreFilterBar";
import { StorePastOrdersSection } from "@/components/store/StorePastOrdersSection";
import { StoreComboSection } from "@/components/store/StoreComboSection";
import { StoreSectionHeader } from "@/components/store/StoreSectionHeader";
import { StoreFooterSection } from "@/components/store/StoreFooterSection";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { MenuListSkeleton } from "@/components/ShimmerSkeleton";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  FLASH_LIST_CONFIG,
  HEADER_IMAGE_HEIGHT,
  SCREEN_WIDTH_EXPORT,
} from "../constants/layout";
import {
  getFlashItemType,
  splitFlashListRows,
} from "../lib/buildFlashListData";
import type { MerchantFlashListItem } from "../types";
import type { ComboPair } from "@/components/store/StoreComboSection";
import type { MenuItem, MerchantSummary } from "@/services/merchant.service";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList<MerchantFlashListItem>
) as typeof FlashList<MerchantFlashListItem>;

export type MerchantDetailFlashListProps = {
  listRef: React.RefObject<FlashListRef<MerchantFlashListItem> | null>;
  data: MerchantFlashListItem[];
  scrollHandler: ScrollHandlerProcessed;
  contentContainerStyle?: object;
  heroBannerStyle: object;
  heroOverlayOpacityStyle: object;
  infoOpacityStyle: object;
  merchantBannerHeroUri: string | null;
  merchantGalleryBannerUris: string[];
  merchantLogoUri: string | null;
  merchant: MerchantSummary;
  merchantId: string;
  distanceKm: number | null;
  storeEtaLabel: string;
  scheduledSlotLabel: string | null;
  offerTickerTexts: string[];
  visibleOffersCount: number;
  onInfoPress: () => void;
  onOffersPress: () => void;
  onSchedulePress: () => void;
  onHeroBack: () => void;
  onHeroSearch: () => void;
  onHeroGroupOrder: () => void;
  onHeroOptions: () => void;
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
  goesWithNameByItemId: Record<string, string>;
  onBookmark: (item: MenuItem) => void;
  onShare: (item: MenuItem) => void;
  resolveMenuItemPk: (item: MenuItem) => number | null;
};

export const MerchantDetailFlashList = React.memo(function MerchantDetailFlashList(
  props: MerchantDetailFlashListProps
) {
  const {
    listRef,
    data,
    scrollHandler,
    contentContainerStyle,
    heroBannerStyle,
    heroOverlayOpacityStyle,
    infoOpacityStyle,
    merchantBannerHeroUri,
    merchantGalleryBannerUris,
    merchantLogoUri,
    merchant,
    merchantId,
    distanceKm,
    storeEtaLabel,
    scheduledSlotLabel,
    offerTickerTexts,
    visibleOffersCount,
    onInfoPress,
    onOffersPress,
    onSchedulePress,
    onHeroBack,
    onHeroSearch,
    onHeroGroupOrder,
    onHeroOptions,
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
    goesWithNameByItemId,
    onBookmark,
    onShare,
    resolveMenuItemPk,
  } = props;

  const { headerRows, listRows } = useMemo(() => splitFlashListRows(data), [data]);

  const keyExtractor = useCallback((item: MerchantFlashListItem) => item.key, []);

  const getItemType = useCallback((item: MerchantFlashListItem) => getFlashItemType(item), []);

  const renderFlashRow = useCallback(
    (item: MerchantFlashListItem) => {
      switch (item.type) {
        case "hero":
          return (
            <View style={styles.headerImageWrap}>
              <Animated.View style={[styles.heroBannerInner, heroBannerStyle]}>
                <StoreBannerCarousel
                  bannerUri={merchantBannerHeroUri}
                  galleryUris={merchantGalleryBannerUris}
                  width={SCREEN_WIDTH_EXPORT}
                  height={HEADER_IMAGE_HEIGHT}
                  initialBannerHoldMs={4000}
                  slideIntervalMs={5200}
                  slideDurationMs={750}
                  showDots={false}
                />
              </Animated.View>
              <LinearGradient
                colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Animated.View
                style={[StyleSheet.absoluteFill, styles.heroNavOverlay, heroOverlayOpacityStyle]}
                pointerEvents="box-none"
              >
                <View style={styles.headerIcons} pointerEvents="box-none">
                  <TouchableOpacity onPress={onHeroBack} style={styles.heroCircleBtnDark} hitSlop={8}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                  </TouchableOpacity>
                  <View style={styles.headerIconsRight}>
                    <TouchableOpacity style={styles.heroSearchPill} onPress={onHeroSearch} hitSlop={8}>
                      <Ionicons name="search" size={16} color="#fff" />
                      <Text style={styles.heroSearchPillText}>Search</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.heroCircleBtnDark} onPress={onHeroGroupOrder} hitSlop={8}>
                      <Ionicons name="people-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.heroCircleBtnDark} onPress={onHeroOptions} hitSlop={8}>
                      <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            </View>
          );

        case "info":
          return (
            <Animated.View style={infoOpacityStyle}>
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
                isFrequentlyReordered={(merchant.completedOrderCount ?? 0) > 50}
                onInfoPress={onInfoPress}
                onOffersPress={onOffersPress}
                onSchedulePress={onSchedulePress}
              />
            </Animated.View>
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
            <View style={styles.filterBarInList}>
              <StoreFilterBar
                active={filter}
                onChange={onFilterChange}
                onOpenFilters={onOpenFilters}
                showHighlyReordered={showHighlyReordered}
                filtersActive={filtersActive}
              />
            </View>
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
          const row = item.item;
          const menuItemPk = resolveMenuItemPk(row);
          return (
            <View collapsable={false}>
              <StoreMenuItemRow
                item={row}
                merchantId={merchantId}
                goesWithName={goesWithNameByItemId[row.id] ?? null}
                onAdd={onAdd}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                isStoreClosed={isStoreClosed}
                showDivider={!item.isLastInSection}
                isHighlyReordered={highlyReorderedIds.has(row.id)}
                isBookmarked={menuItemPk != null && bookmarkMenuItemIdSet.has(menuItemPk)}
                highlighted={
                  highlightedMenuItemKey != null &&
                  (row.id === highlightedMenuItemKey ||
                    (row.menuItemId != null && String(row.menuItemId) === highlightedMenuItemKey))
                }
                onBookmark={onBookmark}
                onShare={onShare}
              />
            </View>
          );
        }

        case "footer":
          return (
            <View style={styles.footerListGap}>
              <StoreFooterSection similarMerchants={similarMerchants} />
            </View>
          );

        case "empty_menu":
          return (
            <View style={styles.emptyMenu}>
              <Text style={styles.emptyMenuText}>No items match the selected filters.</Text>
            </View>
          );

        case "menu_skeleton":
          return <MenuListSkeleton count={1} />;

        default:
          return null;
      }
    },
    [
      heroBannerStyle,
      heroOverlayOpacityStyle,
      infoOpacityStyle,
      merchantBannerHeroUri,
      merchantGalleryBannerUris,
      merchantLogoUri,
      merchant,
      distanceKm,
      storeEtaLabel,
      scheduledSlotLabel,
      offerTickerTexts,
      visibleOffersCount,
      onInfoPress,
      onOffersPress,
      onSchedulePress,
      onHeroBack,
      onHeroSearch,
      onHeroGroupOrder,
      onHeroOptions,
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
      goesWithNameByItemId,
      onBookmark,
      onShare,
      resolveMenuItemPk,
      merchantId,
    ]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MerchantFlashListItem>) => renderFlashRow(item),
    [renderFlashRow]
  );

  const ListHeader = useCallback(
    () => (
      <View collapsable={false} style={styles.listHeader}>
        {headerRows.map((row) => (
          <View key={row.key} collapsable={false}>
            {renderFlashRow(row)}
          </View>
        ))}
      </View>
    ),
    [headerRows, renderFlashRow]
  );

  return (
    <AnimatedFlashList
      ref={listRef}
      style={styles.list}
      data={listRows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      ListHeaderComponent={ListHeader}
      estimatedItemSize={FLASH_LIST_CONFIG.estimatedItemSize}
      drawDistance={FLASH_LIST_CONFIG.drawDistance}
      removeClippedSubviews={FLASH_LIST_CONFIG.removeClippedSubviews}
      contentContainerStyle={contentContainerStyle}
      onScroll={scrollHandler as never}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator
      {...(Platform.OS === "android" ? { overScrollMode: "never" as const } : {})}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: StoreTheme.background,
  },
  listHeader: {
    backgroundColor: StoreTheme.background,
  },
  headerImageWrap: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
  },
  heroBannerInner: {
    width: SCREEN_WIDTH_EXPORT,
    height: HEADER_IMAGE_HEIGHT,
  },
  heroNavOverlay: {
    zIndex: 4,
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
  },
  headerIconsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  filterBarInList: {
    backgroundColor: StoreTheme.background,
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
  footerListGap: {
    paddingTop: 8,
  },
  emptyMenu: {
    padding: 24,
    alignItems: "center",
  },
  emptyMenuText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
});
