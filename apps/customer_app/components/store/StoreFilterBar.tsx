import React from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type StoreFilterId = "all" | "veg" | "egg" | "nonveg" | "highlyreordered";

type FilterDef = {
  id: StoreFilterId;
  label: string;
  type: "filters" | "diet" | "tag";
  diet?: "veg" | "egg" | "nonveg";
};

const BASE_FILTERS: FilterDef[] = [
  { id: "all", label: "Filters", type: "filters" },
  { id: "veg", label: "Veg", type: "diet", diet: "veg" },
  { id: "egg", label: "Egg", type: "diet", diet: "egg" },
  { id: "nonveg", label: "Non-veg", type: "diet", diet: "nonveg" },
];

export type StoreFilterBarProps = {
  active: StoreFilterId;
  onChange: (id: StoreFilterId) => void;
  onOpenFilters?: () => void;
  showHighlyReordered?: boolean;
  filtersActive?: boolean;
  style?: object;
};

export const StoreFilterBar = React.memo(function StoreFilterBar({
  active,
  onChange,
  onOpenFilters,
  showHighlyReordered = false,
  filtersActive = false,
  style,
}: StoreFilterBarProps) {
  const dark = useMerchantUiDark();
  const filters: FilterDef[] = showHighlyReordered
    ? [...BASE_FILTERS, { id: "highlyreordered", label: "Highly re...", type: "tag" }]
    : BASE_FILTERS;

  return (
    <View style={[styles.wrap, style, dark && styles.wrapDark]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        delaysContentTouches={false}
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
      >
        {filters.map((f) => {
          const isActive = f.type === "filters" ? filtersActive : active === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => {
                if (f.type === "filters") onOpenFilters?.();
                else onChange(f.id);
              }}
              style={[styles.chip, dark && styles.chipDark, isActive && (dark ? styles.chipActiveDark : styles.chipActive)]}
              activeOpacity={0.75}
            >
              {f.type === "filters" ? (
                <>
                  <Ionicons name="options-outline" size={15} color={dark ? MerchantDarkPalette.text : StoreTheme.textPrimary} />
                  <AppText style={[styles.chipText, dark && styles.chipTextDark]}>{f.label}</AppText>
                  <Ionicons name="chevron-down" size={13} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
                </>
              ) : f.type === "diet" && f.diet ? (
                <>
                  <DietIndicator type={f.diet} />
                  <AppText style={[styles.chipText, dark && styles.chipTextDark]}>{f.label}</AppText>
                </>
              ) : (
                <>
                  <View style={styles.reorderIcon}>
                    <Ionicons name="refresh-circle" size={15} color={StoreTheme.reorderGreen} />
                  </View>
                  <AppText style={[styles.chipText, dark && styles.chipTextDark]}>{f.label}</AppText>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: StoreTheme.background,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
  },
  wrapDark: {
    backgroundColor: MerchantDarkPalette.bg,
    borderBottomColor: MerchantDarkPalette.border,
  },
  scrollView: {
    flexGrow: 0,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: StoreTheme.filterBorder,
    backgroundColor: StoreTheme.chipBg,
    marginRight: 8,
  },
  chipDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: MerchantDarkPalette.chipBorder,
  },
  chipActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  chipActiveDark: {
    borderColor: MerchantDarkPalette.accent,
    backgroundColor: MerchantDarkPalette.chipActive,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  chipTextDark: {
    color: MerchantDarkPalette.text,
  },
  reorderIcon: {},
});
