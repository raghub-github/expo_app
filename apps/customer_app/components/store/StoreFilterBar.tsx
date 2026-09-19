import React from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type StoreFilterId = "all" | "veg" | "egg" | "nonveg" | "highlyreordered" | "flashdeal";

type FilterDef = {
  id: StoreFilterId;
  label: string;
  type: "filters" | "diet" | "tag" | "flash";
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
  /** When the store has an active Flash Sale on any menu item. */
  showFlashDeal?: boolean;
  filtersActive?: boolean;
  style?: object | (object | null | undefined)[];
};

export const StoreFilterBar = React.memo(function StoreFilterBar({
  active,
  onChange,
  onOpenFilters,
  showHighlyReordered = false,
  showFlashDeal = false,
  filtersActive = false,
  style,
}: StoreFilterBarProps) {
  const dark = useMerchantUiDark();
  const filters: FilterDef[] = [
    BASE_FILTERS[0]!, // Filters
    ...(showFlashDeal ? [{ id: "flashdeal" as const, label: "Flash Deal", type: "flash" as const }] : []),
    ...BASE_FILTERS.slice(1), // Veg → Egg → Non-veg
    ...(showHighlyReordered
      ? [{ id: "highlyreordered" as const, label: "Highly re...", type: "tag" as const }]
      : []),
  ];

  return (
    <View style={[styles.wrap, style, dark && styles.wrapDark]}>
      <ScrollView
        {...NATURAL_HORIZONTAL_SCROLL_PROPS}
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
      >
        {filters.map((f) => {
          const isActive = f.type === "filters" ? filtersActive : active === f.id;
          const flashActive = f.type === "flash" && isActive;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => {
                if (f.type === "filters") onOpenFilters?.();
                else onChange(f.id);
              }}
              style={[
                styles.chip,
                dark && styles.chipDark,
                isActive && (dark ? styles.chipActiveDark : styles.chipActive),
                flashActive && styles.chipFlashActive,
                f.type === "flash" && !isActive && styles.chipFlash,
              ]}
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
              ) : f.type === "flash" ? (
                <>
                  <Ionicons name="flash" size={14} color={isActive ? "#0369A1" : "#0284C7"} />
                  <AppText
                    style={[
                      styles.chipText,
                      styles.chipFlashText,
                      isActive && styles.chipFlashTextActive,
                    ]}
                  >
                    {f.label}
                  </AppText>
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
    backgroundColor: "#FFFFFF",
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
  chipFlash: {
    borderColor: "#7DD3FC",
    backgroundColor: "#F0F9FF",
  },
  chipFlashActive: {
    borderColor: "#0EA5E9",
    backgroundColor: "#E0F2FE",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  chipTextDark: {
    color: MerchantDarkPalette.text,
  },
  chipFlashText: {
    color: "#0369A1",
    fontWeight: "700",
  },
  chipFlashTextActive: {
    color: "#0C4A6E",
  },
  reorderIcon: {},
});
