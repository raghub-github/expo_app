import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

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
  const dark = useMerchantUiDark();
  const sortActive = sortBy !== "relevance";
  const idleIcon = dark ? MerchantDarkPalette.textMuted : "#64748B";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.filterRow, dark && styles.filterRowDark]}
    >
      <TouchableOpacity
        style={[
          styles.filterChip,
          dark && styles.filterChipDark,
          sortActive && (dark ? styles.filterChipActiveDark : styles.filterChipActive),
        ]}
        onPress={onPressSort}
        activeOpacity={0.85}
      >
        <Ionicons
          name="options-outline"
          size={13}
          color={sortActive ? "#fff" : idleIcon}
        />
        <AppText
          style={[
            styles.filterChipText,
            dark && styles.filterChipTextDark,
            sortActive && styles.filterChipTextActive,
          ]}
        >
          Sort
        </AppText>
        <Ionicons
          name="chevron-down"
          size={12}
          color={sortActive ? "#fff" : idleIcon}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filterChip,
          dark && styles.filterChipDark,
          nearFast && (dark ? styles.filterChipNearFastDark : styles.filterChipNearFast),
        ]}
        onPress={onToggleNearFast}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={13} color={nearFast ? MerchantDarkPalette.accent : "#16A34A"} />
        <AppText
          style={[
            styles.filterChipText,
            dark && styles.filterChipTextDark,
            nearFast && (dark ? styles.filterChipTextNearFastDark : styles.filterChipTextNearFast),
          ]}
        >
          Near & Fast
        </AppText>
      </TouchableOpacity>
      <View style={[styles.filterChip, dark && styles.filterChipDark, styles.filterChipMuted]}>
        <Ionicons name="star-outline" size={12} color={idleIcon} />
        <AppText style={[styles.filterChipTextMuted, dark && styles.filterChipTextMutedDark]}>
          New to you
        </AppText>
      </View>
      <View style={[styles.filterChip, dark && styles.filterChipDark, styles.filterChipMuted]}>
        <Ionicons name="time-outline" size={12} color={idleIcon} />
        <AppText style={[styles.filterChipTextMuted, dark && styles.filterChipTextMutedDark]}>
          Previously ordered
        </AppText>
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
  filterRowDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterChipDark: {
    backgroundColor: MerchantDarkPalette.chip,
    borderColor: MerchantDarkPalette.chipBorder,
  },
  filterChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterChipActiveDark: {
    backgroundColor: MerchantDarkPalette.accent,
    borderColor: MerchantDarkPalette.accent,
  },
  filterChipNearFast: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  filterChipNearFastDark: {
    backgroundColor: MerchantDarkPalette.accentSoft,
    borderColor: MerchantDarkPalette.accent,
  },
  filterChipMuted: {
    opacity: 0.72,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterChipTextDark: {
    color: MerchantDarkPalette.text,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  filterChipTextNearFast: {
    color: "#15803D",
  },
  filterChipTextNearFastDark: {
    color: MerchantDarkPalette.accent,
  },
  filterChipTextMuted: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  filterChipTextMutedDark: {
    color: MerchantDarkPalette.textMuted,
  },
});

export const MEALS_UNDER_PRICE_FILTER_BAR_HEIGHT = 46;
export const MEALS_UNDER_PRICE_TITLE_BAR_HEIGHT = 48;
