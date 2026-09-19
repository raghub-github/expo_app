/**
 * Collapsible "Currently unavailable" block — sits just above "Try these similar".
 */

import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreMenuItemRow } from "@/components/store/StoreMenuItemRow";
import { StoreTheme } from "@/constants/storeTheme";
import type { MenuItem } from "@/services/merchant.service";
import type { MenuListRow } from "@/features/merchant-detail/types";
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";

export type StoreOosSectionProps = {
  items: MenuListRow[];
  merchantId: string;
  isStoreClosed?: boolean;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onItemPress?: (item: MenuItem) => void;
  itemOfferById?: Map<string, ItemOfferDisplay>;
};

export function StoreOosSection({
  items,
  merchantId,
  isStoreClosed = false,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  itemOfferById,
}: StoreOosSectionProps) {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <AppText style={styles.title}>Currently unavailable</AppText>
        <View style={styles.headerRight}>
          <AppText style={styles.count}>{items.length}</AppText>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={StoreTheme.textPrimary}
          />
        </View>
      </TouchableOpacity>
      {expanded
        ? items.map((item, index) => {
            const itemOffer =
              itemOfferById?.get(item.id) ??
              (item.menuItemId != null
                ? itemOfferById?.get(String(item.menuItemId))
                : undefined) ??
              null;
            return (
              <StoreMenuItemRow
                key={item.listRowKey}
                item={item}
                merchantId={merchantId}
                onAdd={onAdd}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onItemPress={onItemPress}
                isStoreClosed={isStoreClosed}
                showDivider={index < items.length - 1}
                itemOffer={itemOffer}
              />
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E8E8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#02060C",
    flex: 1,
    paddingRight: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  count: {
    fontSize: 13,
    fontWeight: "600",
    color: "#686B78",
  },
});
