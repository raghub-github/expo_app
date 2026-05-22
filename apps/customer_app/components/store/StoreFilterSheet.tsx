import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";

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
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      activeOpacity={0.8}
    >
      {icon}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
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
      <Text style={styles.title}>Filters and Sorting</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Sort by:</Text>
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

        <Text style={styles.sectionLabel}>Veg/Non-veg preference:</Text>
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
            <Text style={styles.sectionLabel}>Top picks:</Text>
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

        <Text style={styles.sectionLabel}>Dietary preference:</Text>
        <View style={styles.pillRow}>
          <FilterPill
            label="Spicy"
            active={draft.spicy}
            onPress={() => setDraft((d) => ({ ...d, spicy: !d.spicy }))}
            icon={<Text style={styles.chiliIcon}>🌶</Text>}
          />
        </View>

        {offerPriceTiers.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Offers:</Text>
            <View style={styles.offerGrid}>
              {offerPriceTiers.map((price) => (
                <FilterPill
                  key={price}
                  label={`Items @ ₹${price}/-`}
                  active={draft.offerPrices.includes(price)}
                  onPress={() => toggleOfferPrice(price)}
                  icon={
                    <View style={styles.dealIcon}>
                      <Text style={styles.dealIconText}>Deal</Text>
                    </View>
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity onPress={clearAll} hitSlop={8}>
          <Text style={styles.clearText}>Clear All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyBtn, matchCount === 0 && styles.applyBtnDisabled]}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.applyText}>{applyLabel}</Text>
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
  pillActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  pillTextActive: {
    color: StoreTheme.accentMintDark,
  },
  chiliIcon: {
    fontSize: 14,
  },
  dealIcon: {
    backgroundColor: "#7C3AED",
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
  applyBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
