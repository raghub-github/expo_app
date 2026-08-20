import React, { useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type StoreMenuFilterState = {
  sortBy: "default" | "price_asc" | "price_desc";
  veg: boolean;
  egg: boolean;
  nonveg: boolean;
  highlyReordered: boolean;
  spicy: boolean;
  offerPrices: number[];
};

export const DEFAULT_STORE_MENU_FILTERS: StoreMenuFilterState = {
  sortBy: "default",
  veg: false,
  egg: false,
  nonveg: false,
  highlyReordered: false,
  spicy: false,
  offerPrices: [],
};

export type StoreFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  filters: StoreMenuFilterState;
  onApply: (filters: StoreMenuFilterState) => void;
  offerPriceTiers: number[];
  countForFilters: (filters: StoreMenuFilterState) => number;
  showHighlyReordered: boolean;
};

function FilterPill({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const dark = useMerchantUiDark();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        dark && styles.pillDark,
        active && (dark ? styles.pillActiveDark : styles.pillActive),
      ]}
      activeOpacity={0.8}
    >
      {icon}
      <AppText
        style={[
          styles.pillText,
          dark && styles.pillTextDark,
          active && (dark ? styles.pillTextActiveDark : styles.pillTextActive),
        ]}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

export function StoreFilterSheet({
  visible,
  onClose,
  filters,
  onApply,
  offerPriceTiers,
  countForFilters,
  showHighlyReordered,
}: StoreFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const dark = useMerchantUiDark();
  const [draft, setDraft] = useState<StoreMenuFilterState>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const matchCount = useMemo(() => countForFilters(draft), [countForFilters, draft]);

  const toggleSort = (sortBy: StoreMenuFilterState["sortBy"]) => {
    setDraft((d) => ({ ...d, sortBy: d.sortBy === sortBy ? "default" : sortBy }));
  };

  const toggleDiet = (key: "veg" | "egg" | "nonveg") => {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  };

  const toggleOfferPrice = (price: number) => {
    setDraft((d) => {
      const has = d.offerPrices.includes(price);
      return {
        ...d,
        offerPrices: has ? d.offerPrices.filter((p) => p !== price) : [...d.offerPrices, price],
      };
    });
  };

  const clearAll = () => setDraft({ ...DEFAULT_STORE_MENU_FILTERS });

  const applyLabel = useMemo(
    () => (matchCount > 0 ? `Apply (${matchCount})` : "Apply"),
    [matchCount]
  );

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.88} flushBottom>
      <AppText style={[styles.title, dark && styles.titleDark]}>Filters and Sorting</AppText>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>Sort by:</AppText>
        <View style={styles.pillRow}>
          <FilterPill
            label="Price - low to high"
            active={draft.sortBy === "price_asc"}
            onPress={() => toggleSort("price_asc")}
          />
          <FilterPill
            label="Price - high to low"
            active={draft.sortBy === "price_desc"}
            onPress={() => toggleSort("price_desc")}
          />
        </View>

        <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>Veg/Non-veg preference:</AppText>
        <View style={styles.pillRow}>
          <FilterPill
            label="Veg"
            active={draft.veg}
            onPress={() => toggleDiet("veg")}
            icon={<DietIndicator type="veg" />}
          />
          <FilterPill
            label="Egg"
            active={draft.egg}
            onPress={() => toggleDiet("egg")}
            icon={<DietIndicator type="egg" />}
          />
          <FilterPill
            label="Non-veg"
            active={draft.nonveg}
            onPress={() => toggleDiet("nonveg")}
            icon={<DietIndicator type="nonveg" />}
          />
        </View>

        {showHighlyReordered ? (
          <>
            <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>Top picks:</AppText>
            <View style={styles.pillRow}>
              <FilterPill
                label="Highly reordered"
                active={draft.highlyReordered}
                onPress={() => setDraft((d) => ({ ...d, highlyReordered: !d.highlyReordered }))}
                icon={<Ionicons name="refresh-circle" size={16} color={StoreTheme.reorderGreen} />}
              />
            </View>
          </>
        ) : null}

        <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>Dietary preference:</AppText>
        <View style={styles.pillRow}>
          <FilterPill
            label="Spicy"
            active={draft.spicy}
            onPress={() => setDraft((d) => ({ ...d, spicy: !d.spicy }))}
            icon={<AppText style={styles.chiliIcon}>🌶</AppText>}
          />
        </View>

        {offerPriceTiers.length > 0 ? (
          <>
            <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>Offers:</AppText>
            <View style={styles.offerGrid}>
              {offerPriceTiers.map((price) => (
                <FilterPill
                  key={price}
                  label={`Items @ ₹${price}/-`}
                  active={draft.offerPrices.includes(price)}
                  onPress={() => toggleOfferPrice(price)}
                  icon={
                    <View style={styles.dealIcon}>
                      <AppText style={styles.dealIconText}>Deal</AppText>
                    </View>
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, dark && styles.footerDark, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity onPress={clearAll} hitSlop={8}>
          <AppText style={styles.clearText}>Clear All</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.applyBtn,
            dark && styles.applyBtnDark,
            matchCount === 0 && (dark ? styles.applyBtnDisabledDark : styles.applyBtnDisabled),
          ]}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          activeOpacity={0.85}
        >
          <AppText style={styles.applyText}>{applyLabel}</AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionLabelDark: {
    color: MerchantDarkPalette.text,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  offerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: StoreTheme.filterBorder,
    backgroundColor: "#fff",
  },
  pillDark: {
    backgroundColor: MerchantDarkPalette.chip,
    borderColor: MerchantDarkPalette.chipBorder,
  },
  pillActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  pillActiveDark: {
    borderColor: MerchantDarkPalette.accent,
    backgroundColor: MerchantDarkPalette.chipActive,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  pillTextDark: {
    color: MerchantDarkPalette.text,
  },
  pillTextActive: {
    color: StoreTheme.accentMintDark,
  },
  pillTextActiveDark: {
    color: MerchantDarkPalette.accent,
  },
  chiliIcon: {
    fontSize: 14,
  },
  dealIcon: {
    backgroundColor: "#0EA5E9",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dealIconText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    gap: 12,
    backgroundColor: "#fff",
  },
  footerDark: {
    backgroundColor: MerchantDarkPalette.surface,
    borderTopColor: MerchantDarkPalette.border,
  },
  clearText: {
    fontSize: 15,
    fontWeight: "600",
    color: StoreTheme.accentRed,
  },
  applyBtn: {
    flex: 1,
    backgroundColor: StoreTheme.accentMint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnDark: {
    backgroundColor: MerchantDarkPalette.accent,
  },
  applyBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  applyBtnDisabledDark: {
    backgroundColor: "#3A3A3A",
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
