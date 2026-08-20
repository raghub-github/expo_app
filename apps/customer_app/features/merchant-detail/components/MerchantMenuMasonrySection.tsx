import React, { useMemo, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";
import { StoreMenuMasonryCard } from "@/components/store/StoreMenuMasonryCard";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MenuListRow } from "../types";
import type { MenuItem } from "@/services/merchant.service";
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { CATEGORY_RAIL_WIDTH, MENU_MASONRY_GUTTER } from "../constants/layout";
import { MerchantDarkPalette, useMerchantUiDark } from "../merchantUiTheme";

export type MerchantMenuMasonrySectionProps = {
  title: string;
  items: MenuListRow[];
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onItemPress: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed: boolean;
  highlightedMenuItemKey: string | null;
  highlightedOfferId?: number | null;
  highlyReorderedIds: Set<string>;
  bookmarkMenuItemIdSet: Set<number>;
  onBookmark: (item: MenuItem) => void;
  resolveMenuItemPk: (item: MenuItem) => number | null;
  itemOfferById?: Map<string, ItemOfferDisplay>;
  railInset?: number;
};

export const MerchantMenuMasonrySection = React.memo(function MerchantMenuMasonrySection({
  title,
  items,
  merchantId,
  onAdd,
  onItemPress,
  onIncrement,
  onDecrement,
  isStoreClosed,
  highlightedMenuItemKey,
  highlightedOfferId = null,
  highlyReorderedIds,
  bookmarkMenuItemIdSet,
  onBookmark,
  resolveMenuItemPk,
  itemOfferById,
  railInset = 0,
}: MerchantMenuMasonrySectionProps) {
  const dark = useMerchantUiDark();
  const gutter = MENU_MASONRY_GUTTER;
  const columns = 2;
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const fallbackGridW = Math.max(0, windowWidth - CATEGORY_RAIL_WIDTH - railInset);
  const measuredGridW = gridW > 0 ? gridW : fallbackGridW;
  const colW = Math.max(1, Math.floor(measuredGridW / columns));
  const imageSize = Math.max(1, colW - gutter);

  const cards = useMemo(
    () =>
      items.map((menuItem) => {
        const menuItemPk = resolveMenuItemPk(menuItem);
        const itemOffer =
          itemOfferById?.get(menuItem.id) ??
          (menuItem.menuItemId != null
            ? itemOfferById?.get(String(menuItem.menuItemId))
            : undefined) ??
          null;
        const highlighted =
          (highlightedMenuItemKey != null &&
            (menuItem.id === highlightedMenuItemKey ||
              (menuItem.menuItemId != null &&
                String(menuItem.menuItemId) === highlightedMenuItemKey))) ||
          (highlightedOfferId != null && itemOffer?.offerId === highlightedOfferId);

        return (
          <View
            key={menuItem.listRowKey}
            style={[styles.cell, { padding: gutter / 2 }]}
          >
            <StoreMenuMasonryCard
              item={menuItem}
              merchantId={merchantId}
              imageSize={imageSize}
              onAdd={onAdd}
              onItemPress={onItemPress}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              isStoreClosed={isStoreClosed}
              isHighlyReordered={highlyReorderedIds.has(menuItem.id)}
              isBookmarked={menuItemPk != null && bookmarkMenuItemIdSet.has(menuItemPk)}
              highlighted={highlighted}
              onBookmark={onBookmark}
              itemOffer={itemOffer}
            />
          </View>
        );
      }),
    [
      bookmarkMenuItemIdSet,
      columns,
      gutter,
      highlightedMenuItemKey,
      highlightedOfferId,
      highlyReorderedIds,
      imageSize,
      isStoreClosed,
      itemOfferById,
      items,
      merchantId,
      onAdd,
      onBookmark,
      onDecrement,
      onIncrement,
      onItemPress,
      resolveMenuItemPk,
    ]
  );

  return (
    <View
      style={[styles.wrap, dark && styles.wrapDark]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.round(w) !== Math.round(gridW)) setGridW(w);
      }}
    >
      {title ? (
        <AppText style={[styles.title, dark && styles.titleDark]}>{title}</AppText>
      ) : null}
      <View style={styles.grid}>{cards}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    maxWidth: "100%",
    overflow: "hidden",
    backgroundColor: GatiMitraColors.softBackground,
    paddingTop: 10,
    paddingBottom: 6,
  },
  wrapDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    alignItems: "flex-start",
  },
  cell: {
    width: "50%",
    maxWidth: "50%",
    flexGrow: 0,
    flexShrink: 0,
  },
});
