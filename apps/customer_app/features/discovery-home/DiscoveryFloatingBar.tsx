import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { DiscoveryColors, DISCOVERY_FLOAT_BAR_H } from "./discoveryTheme";

type SortOption = "default" | "rating" | "distance";

type Props = {
  sortBy: SortOption;
  hasActiveFilters: boolean;
  bottomInset: number;
  onSortPress: () => void;
  onFiltersPress: () => void;
};

function sortLabel(sortBy: SortOption): string {
  if (sortBy === "rating") return "Rating";
  if (sortBy === "distance") return "Distance";
  return "Relevance";
}

export function DiscoveryFloatingBar({
  sortBy,
  hasActiveFilters,
  bottomInset,
  onSortPress,
  onFiltersPress,
}: Props) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: Math.max(bottomInset, 10) }]}
    >
      <View style={styles.bar}>
        <TouchableOpacity style={styles.seg} onPress={onSortPress} activeOpacity={0.85}>
          <AppText style={styles.segText}>{sortLabel(sortBy)}</AppText>
          <Ionicons name="swap-vertical" size={16} color={DiscoveryColors.text} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.seg} onPress={onFiltersPress} activeOpacity={0.85}>
          <AppText style={[styles.segText, hasActiveFilters && styles.segTextActive]}>
            Filters
          </AppText>
          <Ionicons
            name="options-outline"
            size={16}
            color={hasActiveFilters ? DiscoveryColors.accent : DiscoveryColors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: DISCOVERY_FLOAT_BAR_H,
    minWidth: 220,
    paddingHorizontal: 8,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: DiscoveryColors.floatBar,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: "100%",
  },
  segText: {
    fontSize: 14,
    fontWeight: "700",
    color: DiscoveryColors.text,
  },
  segTextActive: {
    color: DiscoveryColors.accent,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
});
