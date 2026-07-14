import React, { useCallback } from "react";
import { Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";
import type { MerchantCategoryChip } from "../types";
import { CATEGORY_ROW_HEIGHT } from "../constants/layout";

export type MerchantCategoryRowProps = {
  categories: MerchantCategoryChip[];
  activeCategoryId: string | null;
  onSelect: (chip: MerchantCategoryChip) => void;
};

export const MerchantCategoryRow = React.memo(function MerchantCategoryRow({
  categories,
  activeCategoryId,
  onSelect,
}: MerchantCategoryRowProps) {
  const handlePress = useCallback(
    (chip: MerchantCategoryChip) => () => onSelect(chip),
    [onSelect]
  );

  if (categories.length === 0) return null;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      delaysContentTouches={false}
      contentContainerStyle={styles.scroll}
      style={styles.wrap}
    >
      {categories.map((chip) => {
        const active = activeCategoryId === chip.id;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={handlePress(chip)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {chip.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 0,
    height: CATEGORY_ROW_HEIGHT,
    backgroundColor: StoreTheme.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
  },
  scroll: {
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    flexGrow: 0,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: StoreTheme.filterBorder,
    backgroundColor: StoreTheme.chipBg,
    marginRight: 8,
    maxWidth: 180,
  },
  chipActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
  },
  chipTextActive: {
    color: StoreTheme.textPrimary,
  },
});
