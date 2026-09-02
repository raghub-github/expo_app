import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppText } from "@/components/AppText";

export type FoodHomeFilterRowProps = {
  variant: "grid_first" | "classic";
  /** Food-specific chips vs grocery home. */
  vertical?: "food" | "grocery";
  hasActiveFilters: boolean;
  sortBy: "default" | "rating" | "distance";
  openNow: boolean;
  nearFast?: boolean;
  filterHasOffers?: boolean;
  topBrands?: boolean;
  noPackagingCharges: boolean;
  showMealsUnderPriceChip?: boolean;
  mealsUnderPriceLabel?: string;
  onOpenFilters: () => void;
  onToggleSort: () => void;
  onToggleOpenNow: () => void;
  onToggleNearFast?: () => void;
  onToggleOffers?: () => void;
  onToggleTopBrands?: () => void;
  onToggleHighlyRated?: () => void;
  onToggleNoPackagingCharges: () => void;
  onMealsUnderPricePress?: () => void;
  /** Sticky overlay — tighter vertical padding. */
  compact?: boolean;
};

export function FoodHomeFilterRow({
  variant,
  vertical = "food",
  hasActiveFilters,
  sortBy,
  openNow,
  nearFast = false,
  filterHasOffers = false,
  topBrands = false,
  noPackagingCharges,
  showMealsUnderPriceChip = false,
  mealsUnderPriceLabel = "",
  onOpenFilters,
  onToggleSort,
  onToggleOpenNow,
  onToggleNearFast,
  onToggleOffers,
  onToggleTopBrands,
  onToggleHighlyRated,
  onToggleNoPackagingCharges,
  onMealsUnderPricePress,
  compact = false,
}: FoodHomeFilterRowProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
        keyboardShouldPersistTaps="handled"
        delaysContentTouches={false}
      >
        {variant === "grid_first" ? (
          <>
            <TouchableOpacity
              style={[styles.chip, hasActiveFilters && styles.chipActive]}
              onPress={onOpenFilters}
              activeOpacity={0.85}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={hasActiveFilters ? "#fff" : GatiMitraColors.textPrimaryNew}
              />
              <AppText style={[styles.chipText, hasActiveFilters && styles.chipTextActive]}>
                Filters
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, nearFast && styles.chipNearFast]}
              onPress={onToggleNearFast ?? onToggleSort}
              activeOpacity={0.85}
            >
              <Ionicons
                name="flash"
                size={16}
                color={nearFast ? "#15803D" : "#16A34A"}
              />
              <AppText style={[styles.chipText, nearFast && styles.chipTextNearFast]}>
                Near & Fast
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, openNow && styles.chipActive]}
              onPress={onToggleOpenNow}
              activeOpacity={0.85}
            >
              <Ionicons
                name="storefront-outline"
                size={16}
                color={openNow ? "#fff" : GatiMitraColors.primaryMint}
              />
              <AppText style={[styles.chipText, openNow && styles.chipTextActive]}>
                Open Now
              </AppText>
            </TouchableOpacity>
            {onToggleOffers ? (
              <TouchableOpacity
                style={[styles.chip, filterHasOffers && styles.chipActive]}
                onPress={onToggleOffers}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={16}
                  color={filterHasOffers ? "#fff" : GatiMitraColors.textPrimaryNew}
                />
                <AppText style={[styles.chipText, filterHasOffers && styles.chipTextActive]}>
                  Offers
                </AppText>
              </TouchableOpacity>
            ) : null}
            {vertical === "food" ? (
              <TouchableOpacity
                style={[styles.chip, noPackagingCharges && styles.chipActive]}
                onPress={onToggleNoPackagingCharges}
                activeOpacity={0.85}
              >
                <AppText style={[styles.chipText, noPackagingCharges && styles.chipTextActive]}>
                  No packaging charges
                </AppText>
              </TouchableOpacity>
            ) : null}
            {onToggleHighlyRated ? (
              <TouchableOpacity
                style={[styles.chip, sortBy === "rating" && styles.chipActive]}
                onPress={onToggleHighlyRated}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="star-outline"
                  size={16}
                  color={sortBy === "rating" ? "#fff" : "#F59E0B"}
                />
                <AppText style={[styles.chipText, sortBy === "rating" && styles.chipTextActive]}>
                  Highly rated
                </AppText>
              </TouchableOpacity>
            ) : null}
            {onToggleTopBrands ? (
              <TouchableOpacity
                style={[styles.chip, topBrands && styles.chipActive]}
                onPress={onToggleTopBrands}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={16}
                  color={topBrands ? "#fff" : "#6366F1"}
                />
                <AppText style={[styles.chipText, topBrands && styles.chipTextActive]}>
                  Top Brands
                </AppText>
              </TouchableOpacity>
            ) : null}
            {showMealsUnderPriceChip ? (
              <TouchableOpacity
                style={[styles.chip, styles.chipMeals]}
                onPress={onMealsUnderPricePress}
                activeOpacity={0.85}
              >
                <AppText style={[styles.chipText, styles.chipTextMeals]}>
                  {mealsUnderPriceLabel}
                </AppText>
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
              <AppText style={[styles.chipText, openNow && styles.chipTextActive]}>
                Open Now
              </AppText>
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
              <AppText style={[styles.chipText, sortBy !== "default" && styles.chipTextActive]}>
                {sortBy === "default" ? "Sort" : sortBy === "rating" ? "Rating" : "Distance"}
              </AppText>
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
              <AppText style={[styles.chipText, hasActiveFilters && styles.chipTextActive]}>
                Filters
              </AppText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  wrapCompact: {
    paddingBottom: 6,
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 4,
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
  chipMeals: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  chipTextMeals: {
    color: "#15803D",
  },
});
