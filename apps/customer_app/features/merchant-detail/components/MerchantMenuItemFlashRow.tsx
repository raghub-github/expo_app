import React from "react";
import { View, StyleSheet } from "react-native";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { StoreTheme } from "@/constants/storeTheme";
import { MENU_ITEM_ROW_HEIGHT } from "../constants/layout";
import type { MerchantFlashListItem } from "../types";
import type { MenuItem } from "@/services/merchant.service";

type Props = {
  row: Extract<MerchantFlashListItem, { type: "menu_item" }>;
  merchantId: string;
  goesWithName: string | null;
  isHighlyReordered: boolean;
  isBookmarked: boolean;
  highlighted: boolean;
  isStoreClosed: boolean;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onBookmark: (item: MenuItem) => void;
  onShare: (item: MenuItem) => void;
};

export const MerchantMenuItemFlashRow = React.memo(
  function MerchantMenuItemFlashRow({
    row,
    merchantId,
    goesWithName,
    isHighlyReordered,
    isBookmarked,
    highlighted,
    isStoreClosed,
    onAdd,
    onIncrement,
    onDecrement,
    onBookmark,
    onShare,
  }: Props) {
    const item = row.item;
    return (
      <View collapsable={false} style={styles.shell}>
        <StoreMenuItemRow
          item={item}
          merchantId={merchantId}
          goesWithName={goesWithName}
          onAdd={onAdd}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          isStoreClosed={isStoreClosed}
          showDivider={row.showDivider}
          isHighlyReordered={isHighlyReordered}
          isBookmarked={isBookmarked}
          highlighted={highlighted}
          onBookmark={onBookmark}
          onShare={onShare}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.row.key === next.row.key &&
    prev.row.showDivider === next.row.showDivider &&
    prev.merchantId === next.merchantId &&
    prev.goesWithName === next.goesWithName &&
    prev.isHighlyReordered === next.isHighlyReordered &&
    prev.isBookmarked === next.isBookmarked &&
    prev.highlighted === next.highlighted &&
    prev.isStoreClosed === next.isStoreClosed &&
    prev.row.item === next.row.item
);

const styles = StyleSheet.create({
  shell: {
    minHeight: MENU_ITEM_ROW_HEIGHT,
    backgroundColor: StoreTheme.background,
  },
});
