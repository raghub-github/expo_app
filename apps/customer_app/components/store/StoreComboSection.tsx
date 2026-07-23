import React, { useCallback, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, Image, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreMenuAddButton } from "./StoreMenuCartControls";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";

export type ComboPair = {
  id: string;
  item1: MenuItem;
  item2: MenuItem;
  customerCount?: number;
  source?: "co_purchase" | "popular_fallback";
};

export type StoreComboSectionProps = {
  combos: ComboPair[];
  onAddCombo: (combo: ComboPair) => void;
  onItemPress?: (item: MenuItem) => void;
  isStoreClosed?: boolean;
};

export function StoreComboSection({
  combos,
  onAddCombo,
  onItemPress,
  isStoreClosed,
}: StoreComboSectionProps) {
  const [expanded, setExpanded] = useState(true);

  if (combos.length === 0) return null;

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <AppText style={styles.title}>Most ordered together</AppText>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={StoreTheme.textPrimary}
        />
      </TouchableOpacity>

      {expanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          delaysContentTouches={false}
          canCancelContentTouches={false}
        >
          {combos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              onAdd={() => onAddCombo(combo)}
              onItemPress={onItemPress}
              isStoreClosed={isStoreClosed}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function ComboCard({
  combo,
  onAdd,
  onItemPress,
  isStoreClosed,
}: {
  combo: ComboPair;
  onAdd: () => void;
  onItemPress?: (item: MenuItem) => void;
  isStoreClosed?: boolean;
}) {
  const totalPrice = combo.item1.price + combo.item2.price;
  const title = `${combo.item1.name} + ${combo.item2.name}`;

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    onAdd();
  }, [onAdd, isStoreClosed]);

  return (
    <View style={styles.card}>
      <View style={styles.imagesRow}>
        <ComboImage item={combo.item1} onPress={onItemPress} />
        <View style={styles.plusCircle}>
          <Ionicons name="add" size={14} color={StoreTheme.textSecondary} />
        </View>
        <ComboImage item={combo.item2} onPress={onItemPress} />
      </View>
      {combo.customerCount != null && combo.customerCount > 0 ? (
        <View style={styles.badgeRow}>
          <Ionicons name="people-outline" size={12} color={StoreTheme.textSecondary} />
          <AppText style={styles.badgeText}>
            {combo.source === "popular_fallback"
              ? "Popular pairing"
              : `Ordered by ${combo.customerCount}+ customers`}
          </AppText>
        </View>
      ) : null}
      <AppText style={styles.comboTitle} numberOfLines={2}>
        {title}
      </AppText>
      <View style={styles.priceAddRow}>
        <AppText style={styles.comboPrice}>₹{totalPrice}</AppText>
        <StoreMenuAddButton
          onPress={handleAdd}
          disabled={isStoreClosed}
          style={styles.addBtnWrap}
          accessibilityLabel={`Add combo to cart`}
        />
      </View>
    </View>
  );
}

function ComboImage({
  item,
  onPress,
}: {
  item: MenuItem;
  onPress?: (item: MenuItem) => void;
}) {
  const [failed, setFailed] = useState(false);
  const uri = item.imageUrl;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`View ${item.name} details`}
      disabled={!onPress}
      activeOpacity={0.82}
      onPress={() => onPress?.(item)}
      style={styles.comboImageWrap}
    >
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.comboImage} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <MenuItemImagePlaceholder size="sm" />
      )}
    </TouchableOpacity>
  );
}

const CARD_W = 200;

const styles = StyleSheet.create({
  section: {
    backgroundColor: StoreTheme.background,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 8,
    borderBottomColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    width: CARD_W,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    ...StoreTheme.cardShadow,
  },
  imagesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  comboImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  comboImage: {
    width: "100%",
    height: "100%",
  },
  plusCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: StoreTheme.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    marginHorizontal: -8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 10,
    color: StoreTheme.textSecondary,
    fontWeight: "500",
  },
  comboTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    lineHeight: 17,
    marginBottom: 10,
  },
  priceAddRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  comboPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    flex: 1,
  },
  addBtnWrap: {
    flexShrink: 0,
    minWidth: 72,
  },
});
