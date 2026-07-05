import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export type FoodHomeFilterRowProps = {
  variant: "grid_first" | "classic";
  storeCountLabel: string;
  hasActiveFilters: boolean;
  sortBy: "default" | "rating" | "distance";
  openNow: boolean;
  noPackagingCharges: boolean;
  showMealsUnderPriceChip?: boolean;
  mealsUnderPriceLabel?: string;
  onOpenFilters: () => void;
  onToggleSort: () => void;
  onToggleOpenNow: () => void;
  onToggleNoPackagingCharges: () => void;
  onMealsUnderPricePress?: () => void;
  /** Sticky overlay — tighter vertical padding. */
  compact?: boolean;
};

export function FoodHomeFilterRow({
  variant,
  storeCountLabel,
  hasActiveFilters,
  sortBy,
  openNow,
  noPackagingCharges,
  showMealsUnderPriceChip = false,
  mealsUnderPriceLabel = "",
  onOpenFilters,
  onToggleSort,
  onToggleOpenNow,
  onToggleNoPackagingCharges,
  onMealsUnderPricePress,
  compact = false,
}: FoodHomeFilterRowProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
        keyboardShouldPersistTaps="handled"
      >
        {variant === "grid_first" ? (
          <>
            <TouchableOpacity
              style={[styles.chip, hasActiveFilters && styles.chipActive]}
              onPress={onOpenFilters}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={hasActiveFilters ? "#fff" : GatiMitraColors.textPrimaryNew}
              />
              <Text style={[styles.chipText, hasActiveFilters && styles.chipTextActive]}>
                Filters
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, sortBy === "distance" && styles.chipNearFast]}
              onPress={onToggleSort}
            >
              <Ionicons
                name="flash"
                size={16}
                color={sortBy === "distance" ? "#15803D" : "#16A34A"}
              />
              <Text style={[styles.chipText, sortBy === "distance" && styles.chipTextNearFast]}>
                Near & Fast
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, noPackagingCharges && styles.chipActive]}
              onPress={onToggleNoPackagingCharges}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, noPackagingCharges && styles.chipTextActive]}>
                No packaging charges
              </Text>
            </TouchableOpacity>
            {showMealsUnderPriceChip ? (
              <TouchableOpacity
                style={styles.chip}
                onPress={onMealsUnderPricePress}
                activeOpacity={0.85}
              >
                <Text style={styles.chipText}>{mealsUnderPriceLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.chip, openNow && styles.chipActive]}
              onPress={onToggleOpenNow}
            >
              <Ionicons
                name="storefront-outline"
                size={18}
                color={openNow ? "#fff" : GatiMitraColors.primaryMint}
              />
              <Text style={[styles.chipText, openNow && styles.chipTextActive]}>
                Open Now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, sortBy !== "default" && styles.chipActive]}
              onPress={onToggleSort}
            >
              <Ionicons
                name="swap-vertical"
                size={18}
                color={sortBy !== "default" ? "#fff" : GatiMitraColors.textPrimaryNew}
              />
              <Text style={[styles.chipText, sortBy !== "default" && styles.chipTextActive]}>
                {sortBy === "default" ? "Sort" : sortBy === "rating" ? "Rating" : "Distance"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, hasActiveFilters && styles.chipActive]}
              onPress={onOpenFilters}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={hasActiveFilters ? "#fff" : GatiMitraColors.textPrimaryNew}
              />
              <Text style={[styles.chipText, hasActiveFilters && styles.chipTextActive]}>
                Filters
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <Text style={styles.storeCount}>{storeCountLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  rowCompact: {
    paddingBottom: 8,
  },
  chipsScroll: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 4,
  },
  storeCount: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  chipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  chipTextActive: {
    color: "#fff",
  },
  chipNearFast: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  chipTextNearFast: {
    color: "#15803D",
  },
});
