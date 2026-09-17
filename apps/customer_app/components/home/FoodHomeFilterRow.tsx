import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
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
  /** Show FLASH DEALS chip when any nearby outlet has an active flash sale. */
  showFlashDeals?: boolean;
  flashDeals?: boolean;
  topBrands?: boolean;
  noPackagingCharges: boolean;
  showMealsUnderPriceChip?: boolean;
  mealsUnderPriceLabel?: string;
  onOpenFilters: () => void;
  onToggleSort: () => void;
  onToggleOpenNow: () => void;
  onToggleNearFast?: () => void;
  onToggleFlashDeals?: () => void;
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
  showFlashDeals = false,
  flashDeals = false,
  topBrands = false,
  noPackagingCharges,
  showMealsUnderPriceChip = false,
  mealsUnderPriceLabel = "",
  onOpenFilters,
  onToggleSort,
  onToggleOpenNow,
  onToggleNearFast,
  onToggleFlashDeals,
  onToggleOffers,
  onToggleTopBrands,
  onToggleHighlyRated,
  onToggleNoPackagingCharges,
  onMealsUnderPricePress,
  compact = false,
}: FoodHomeFilterRowProps) {
  const flashDealsChip =
    showFlashDeals && onToggleFlashDeals ? (
      <TouchableOpacity
        style={[styles.chip, flashDeals && styles.chipFlashDeals]}
        onPress={onToggleFlashDeals}
        activeOpacity={0.85}
      >
        <Ionicons name="pricetag" size={16} color={flashDeals ? "#fff" : "#C2410C"} />
        <AppText style={[styles.chipText, flashDeals && styles.chipTextFlashDeals]}>
          Flash Deal
        </AppText>
      </TouchableOpacity>
    ) : null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <ScrollView
        {...NATURAL_HORIZONTAL_SCROLL_PROPS}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
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
            {flashDealsChip}
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
            {flashDealsChip}
            {onToggleNearFast ? (
              <TouchableOpacity
                style={[styles.chip, nearFast && styles.chipActive]}
                onPress={onToggleNearFast}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="flash"
                  size={16}
                  color={nearFast ? "#fff" : "#22C55E"}
                />
                <AppText style={[styles.chipText, nearFast && styles.chipTextActive]}>
                  Near & Fast
                </AppText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.chip, sortBy !== "default" && styles.chipActive]}
              onPress={onToggleSort}
              activeOpacity={0.85}
            >
              <Ionicons
                name="swap-vertical"
                size={16}
                color={sortBy !== "default" ? "#fff" : GatiMitraColors.textPrimaryNew}
              />
              <AppText style={[styles.chipText, sortBy !== "default" && styles.chipTextActive]}>
                {sortBy === "default" ? "Sort" : sortBy === "rating" ? "Rating" : "Distance"}
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 0,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  wrapCompact: {
    paddingBottom: 4,
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
  chipFlashDeals: {
    backgroundColor: "#C2410C",
    borderColor: "#C2410C",
  },
  chipTextFlashDeals: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  chipMeals: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  chipTextMeals: {
    color: "#15803D",
  },
});
