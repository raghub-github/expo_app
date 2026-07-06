import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreText } from "./StoreText";
import { StorePastOrderRow, type PastOrderItem } from "./StorePastOrderRow";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

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
      {thumbs.map((po, idx) => {
        const uri = po.menuItem.imageUrl?.trim()
          ? (toAbsoluteImageUrl(po.menuItem.imageUrl) ?? po.menuItem.imageUrl)
          : null;
        return (
          <View key={po.menuItem.id} style={[styles.thumbWrap, idx > 0 && styles.thumbOverlap]}>
            {uri ? (
              <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
            ) : (
              <MenuItemImagePlaceholder size="xs" />
            )}
          </View>
        );
      })}
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
          <StoreText style={styles.title} bold>
            Your Orders and Collections
          </StoreText>
          <StoreText style={styles.sub}>Past customisations are pre-selected</StoreText>
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
              <StoreText style={styles.seeMoreText} bold>
                See {hiddenCount} more item{hiddenCount > 1 ? "s" : ""}
              </StoreText>
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
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 8,
    borderBottomColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 17,
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: 4,
  },
  list: {
    paddingBottom: 4,
  },
  seeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  seeMoreText: {
    fontSize: 14,
    color: StoreTheme.accentMintDark,
  },
  thumbStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
