import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export type MealsUnderPriceSortMode = "relevance" | "rating" | "delivery_time" | "distance";

type Props = {
  sortBy: MealsUnderPriceSortMode;
  nearFast: boolean;
  onPressSort: () => void;
  onToggleNearFast: () => void;
};

export function MealsUnderPriceFilterRow({
  sortBy,
  nearFast,
  onPressSort,
  onToggleNearFast,
}: Props) {
  const sortActive = sortBy !== "relevance";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      <TouchableOpacity
        style={[styles.filterChip, sortActive && styles.filterChipActive]}
        onPress={onPressSort}
        activeOpacity={0.85}
      >
        <Ionicons
          name="options-outline"
          size={13}
          color={sortActive ? "#fff" : "#64748B"}
        />
        <Text style={[styles.filterChipText, sortActive && styles.filterChipTextActive]}>
          Sort
        </Text>
        <Ionicons
          name="chevron-down"
          size={12}
          color={sortActive ? "#fff" : "#64748B"}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.filterChip, nearFast && styles.filterChipNearFast]}
        onPress={onToggleNearFast}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={13} color={nearFast ? "#15803D" : "#16A34A"} />
        <Text style={[styles.filterChipText, nearFast && styles.filterChipTextNearFast]}>
          Near & Fast
        </Text>
      </TouchableOpacity>
      <View style={[styles.filterChip, styles.filterChipMuted]}>
        <Ionicons name="star-outline" size={12} color="#64748B" />
        <Text style={styles.filterChipTextMuted}>New to you</Text>
      </View>
      <View style={[styles.filterChip, styles.filterChipMuted]}>
        <Ionicons name="time-outline" size={12} color="#64748B" />
        <Text style={styles.filterChipTextMuted}>Previously ordered</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterChipNearFast: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  filterChipMuted: {
    opacity: 0.72,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  filterChipTextNearFast: {
    color: "#15803D",
  },
  filterChipTextMuted: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
});

export const MEALS_UNDER_PRICE_FILTER_BAR_HEIGHT = 46;
export const MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT = 48;
