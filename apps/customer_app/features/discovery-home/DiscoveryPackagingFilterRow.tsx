import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { DiscoveryColors } from "./discoveryTheme";

export type PackagingSortMode = "relevance" | "rating" | "distance";

type Props = {
  sortBy: PackagingSortMode;
  openNow: boolean;
  topDeals: boolean;
  lowPrice: boolean;
  vegOnly: boolean;
  nearFast: boolean;
  onCycleSort: () => void;
  onToggleOpenNow: () => void;
  onToggleTopDeals: () => void;
  onToggleLowPrice: () => void;
  onToggleVeg: () => void;
  onToggleNearFast: () => void;
};

function sortLabel(sortBy: PackagingSortMode): string {
  if (sortBy === "rating") return "Rating";
  if (sortBy === "distance") return "Distance";
  return "Sort";
}

export function DiscoveryPackagingFilterRow({
  sortBy,
  openNow,
  topDeals,
  lowPrice,
  vegOnly,
  nearFast,
  onCycleSort,
  onToggleOpenNow,
  onToggleTopDeals,
  onToggleLowPrice,
  onToggleVeg,
  onToggleNearFast,
}: Props) {
  const sortActive = sortBy !== "relevance";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <TouchableOpacity
        style={[styles.chip, sortActive && styles.chipOn]}
        onPress={onCycleSort}
        activeOpacity={0.85}
      >
        <Ionicons
          name="swap-vertical"
          size={13}
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
          size={13}
          color={openNow ? DiscoveryColors.teal : DiscoveryColors.openIcon}
        />
        <AppText style={styles.chipText}>Open Now</AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, topDeals && styles.chipOn]}
        onPress={onToggleTopDeals}
        activeOpacity={0.85}
      >
        <Ionicons
          name="pricetag"
          size={13}
          color={topDeals ? DiscoveryColors.teal : DiscoveryColors.text}
        />
        <AppText style={styles.chipText}>Top Deals</AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, lowPrice && styles.chipOn]}
        onPress={onToggleLowPrice}
        activeOpacity={0.85}
      >
        <Ionicons
          name="trending-down"
          size={14}
          color={lowPrice ? DiscoveryColors.teal : DiscoveryColors.text}
        />
        <AppText style={styles.chipText}>Low Price</AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, nearFast && styles.chipOn]}
        onPress={onToggleNearFast}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={13} color={nearFast ? DiscoveryColors.teal : "#16A34A"} />
        <AppText style={styles.chipText}>Near & Fast</AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, vegOnly && styles.chipOn]}
        onPress={onToggleVeg}
        activeOpacity={0.85}
      >
        <View style={[styles.vegDot, vegOnly && styles.vegDotOn]} />
        <AppText style={styles.chipText}>Veg</AppText>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    paddingBottom: 14,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1C1C1C",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  chipOn: {
    borderColor: DiscoveryColors.teal,
    backgroundColor: "rgba(45,212,191,0.1)",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: DiscoveryColors.text,
  },
  vegDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: DiscoveryColors.veg,
    backgroundColor: "transparent",
  },
  vegDotOn: {
    backgroundColor: DiscoveryColors.veg,
  },
});
