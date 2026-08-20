import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { DiscoveryColors, DISCOVERY_PAGE_PAD } from "./discoveryTheme";

type SortOption = "default" | "rating" | "distance";

type Props = {
  openNow: boolean;
  topBrands: boolean;
  sortBy: SortOption;
  nearFast: boolean;
  hasOffers: boolean;
  noPackagingCharges: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onToggleOpenNow: () => void;
  onToggleTopBrands: () => void;
  onToggleSort: () => void;
  onToggleOffers: () => void;
  onToggleNoPackaging: () => void;
  onToggleNearFast: () => void;
  onOpenFilters: () => void;
};

function sortLabel(sortBy: SortOption): string {
  if (sortBy === "rating") return "Rating";
  if (sortBy === "distance") return "Distance";
  return "Sort";
}

export function DiscoveryExploreSection({
  openNow,
  topBrands,
  sortBy,
  nearFast,
  hasOffers,
  noPackagingCharges,
  hasActiveFilters,
  activeFilterCount,
  onToggleOpenNow,
  onToggleTopBrands,
  onToggleSort,
  onToggleOffers,
  onToggleNoPackaging,
  onToggleNearFast,
  onOpenFilters,
}: Props) {
  const sortActive = sortBy !== "default";

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <AppText style={styles.title}>Explore all restaurants</AppText>
        <LinearGradient
          colors={["#2DD4BF", "rgba(45,212,191,0.18)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.rule}
        />
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        delaysContentTouches={false}
        contentContainerStyle={styles.chips}
      >
        <TouchableOpacity
          style={[styles.chip, hasActiveFilters && styles.chipOn]}
          onPress={onOpenFilters}
          activeOpacity={0.85}
        >
          <Ionicons
            name="options-outline"
            size={14}
            color={hasActiveFilters ? DiscoveryColors.teal : DiscoveryColors.text}
          />
          <AppText style={styles.chipText}>
            {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : "Filters"}
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, sortActive && styles.chipOn]}
          onPress={onToggleSort}
          activeOpacity={0.85}
        >
          <Ionicons
            name="swap-vertical"
            size={14}
            color={sortActive ? DiscoveryColors.teal : DiscoveryColors.text}
          />
          <AppText style={styles.chipText}>{sortLabel(sortBy)}</AppText>
          <Ionicons name="chevron-down" size={11} color={DiscoveryColors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, openNow && styles.chipOn]}
          onPress={onToggleOpenNow}
          activeOpacity={0.85}
        >
          <Ionicons
            name="storefront-outline"
            size={14}
            color={openNow ? DiscoveryColors.teal : DiscoveryColors.openIcon}
          />
          <AppText style={styles.chipText}>Open Now</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, topBrands && styles.chipOn]}
          onPress={onToggleTopBrands}
          activeOpacity={0.85}
        >
          <Ionicons
            name="pricetag"
            size={14}
            color={topBrands ? DiscoveryColors.teal : DiscoveryColors.brandIcon}
          />
          <AppText style={styles.chipText}>Top Brands</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, hasOffers && styles.chipOn]}
          onPress={onToggleOffers}
          activeOpacity={0.85}
        >
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={hasOffers ? DiscoveryColors.teal : DiscoveryColors.text}
          />
          <AppText style={styles.chipText}>Offers</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, noPackagingCharges && styles.chipOn]}
          onPress={onToggleNoPackaging}
          activeOpacity={0.85}
        >
          <Ionicons
            name="bag-handle-outline"
            size={14}
            color={noPackagingCharges ? DiscoveryColors.teal : DiscoveryColors.orange}
          />
          <AppText style={styles.chipText}>No packaging</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, nearFast && styles.chipOn]}
          onPress={onToggleNearFast}
          activeOpacity={0.85}
        >
          <Ionicons name="flash" size={14} color={nearFast ? DiscoveryColors.teal : "#16A34A"} />
          <AppText style={styles.chipText}>Near & Fast</AppText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 18,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: DISCOVERY_PAGE_PAD,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.3,
    flexShrink: 0,
  },
  rule: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  chips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: DISCOVERY_PAGE_PAD,
    paddingRight: DISCOVERY_PAGE_PAD + 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: DiscoveryColors.pill,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  chipOn: {
    backgroundColor: "rgba(45,212,191,0.12)",
    borderColor: DiscoveryColors.accentSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: DiscoveryColors.text,
  },
});
