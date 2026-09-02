import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreFonts } from "@/constants/storeTypography";
import { AppText } from "@/components/AppText";
import type { ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { StorePastOrderRow, type PastOrderItem } from "./StorePastOrderRow";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export type StorePastOrdersSectionProps = {
  items: PastOrderItem[];
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onItemPress?: (item: MenuItem) => void;
  isStoreClosed?: boolean;
  itemOfferById?: Map<string, ItemOfferDisplay>;
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
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  isStoreClosed,
  itemOfferById,
}: StorePastOrdersSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, 3);
  const hiddenCount = items.length - 3;
  const hiddenItems = items.slice(3);

  const resolveOffer = (menuItem: MenuItem) =>
    itemOfferById?.get(menuItem.id) ??
    (menuItem.menuItemId != null
      ? itemOfferById?.get(String(menuItem.menuItemId))
      : undefined) ??
    null;

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        <View style={styles.headerText}>
          <AppText style={styles.title}>Your Orders and Collections</AppText>
          <AppText style={styles.sub}>Past customisations are pre-selected</AppText>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={StoreTheme.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.list}>
          {visible.map((po, index) => (
            <StorePastOrderRow
              key={po.menuItem.id}
              item={po}
              merchantId={merchantId}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onItemPress={onItemPress}
              isStoreClosed={isStoreClosed}
              itemOffer={resolveOffer(po.menuItem)}
              showDivider={index < visible.length - 1}
            />
          ))}
          {!showAll && hiddenCount > 0 ? (
            <TouchableOpacity
              style={styles.seeMore}
              onPress={() => setShowAll(true)}
              activeOpacity={0.75}
            >
              <StackedThumbnails items={hiddenItems} />
              <AppText style={styles.seeMoreText}>
                See {hiddenCount} more item{hiddenCount > 1 ? "s" : ""}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={StoreTheme.accentMintDark} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 17,
    color: StoreTheme.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  sub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  list: {
    width: "100%",
    paddingBottom: 4,
  },
  seeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    marginTop: 2,
  },
  seeMoreText: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 13,
    color: StoreTheme.accentMintDark,
    letterSpacing: -0.1,
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
    marginLeft: -8,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
});
