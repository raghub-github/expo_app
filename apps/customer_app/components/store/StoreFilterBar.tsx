import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";

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
  const filters: FilterDef[] = showHighlyReordered
    ? [...BASE_FILTERS, { id: "highlyreordered", label: "Highly re...", type: "tag" }]
    : BASE_FILTERS;

  return (
    <View style={[styles.wrap, style]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              style={[styles.chip, isActive && styles.chipActive]}
              activeOpacity={0.75}
            >
              {f.type === "filters" ? (
                <>
                  <Ionicons name="options-outline" size={15} color={StoreTheme.textPrimary} />
                  <Text style={styles.chipText}>{f.label}</Text>
                  <Ionicons name="chevron-down" size={13} color={StoreTheme.textSecondary} />
                </>
              ) : f.type === "diet" && f.diet ? (
                <>
                  <DietIndicator type={f.diet} />
                  <Text style={styles.chipText}>{f.label}</Text>
                </>
              ) : (
                <>
                  <View style={styles.reorderIcon}>
                    <Ionicons name="refresh-circle" size={15} color={StoreTheme.reorderGreen} />
                  </View>
                  <Text style={styles.chipText}>{f.label}</Text>
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
  },
  scrollView: {
    flexGrow: 0,
  },
  scroll: {
    paddingHorizontal: 16,
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
  chipActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  reorderIcon: {},
});
