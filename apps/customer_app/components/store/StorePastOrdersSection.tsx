import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StorePastOrderRow, type PastOrderItem } from "./StorePastOrderRow";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";

export type StorePastOrdersSectionProps = {
  items: PastOrderItem[];
  getQty: (itemId: string, menuItemId?: number) => number;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
};

function StackedThumbnails({ items }: { items: PastOrderItem[] }) {
  const thumbs = items.slice(0, 2);
  return (
    <View style={styles.thumbStack}>
      {thumbs.map((po, idx) => (
        <View key={po.menuItem.id} style={[styles.thumbWrap, idx > 0 && styles.thumbOverlap]}>
          {po.menuItem.imageUrl ? (
            <Image source={{ uri: po.menuItem.imageUrl }} style={styles.thumbImage} resizeMode="cover" />
          ) : (
            <MenuItemImagePlaceholder size="xs" />
          )}
        </View>
      ))}
    </View>
  );
}

export function StorePastOrdersSection({
  items,
  getQty,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed,
}: StorePastOrdersSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, 3);
  const hiddenCount = items.length - 3;
  const hiddenItems = items.slice(3);

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Your Orders and Collections</Text>
          <Text style={styles.sub}>Past customisations are pre-selected</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={StoreTheme.textPrimary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.list}>
          {visible.map((po) => (
            <StorePastOrderRow
              key={po.menuItem.id}
              item={po}
              quantity={getQty(po.menuItem.id, po.menuItem.menuItemId)}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              isStoreClosed={isStoreClosed}
            />
          ))}
          {!showAll && hiddenCount > 0 ? (
            <TouchableOpacity style={styles.seeMore} onPress={() => setShowAll(true)} activeOpacity={0.8}>
              <StackedThumbnails items={hiddenItems} />
              <Text style={styles.seeMoreText}>
                See {hiddenCount} more item{hiddenCount > 1 ? "s" : ""}
              </Text>
              <Ionicons name="chevron-down" size={16} color={StoreTheme.accentMintDark} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 8,
    borderBottomColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: 3,
  },
  list: {},
  seeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
  },
  seeMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.accentMintDark,
  },
  thumbStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#F3F4F6",
  },
  thumbOverlap: {
    marginLeft: -10,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
});
