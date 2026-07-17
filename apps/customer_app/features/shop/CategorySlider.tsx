/**
 * Horizontal category slider – rounded cards, active highlight.
 */

import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { ProductCategoryId } from "./data";

const PAD = 16;
const GAP = 10;
const CARD_SIZE = 72;

type CategorySliderProps = {
  categories: Array<{ id: ProductCategoryId; name: string; icon: string }>;
  activeId: ProductCategoryId;
  onSelect: (id: ProductCategoryId) => void;
};

export function CategorySlider({ categories, activeId, onSelect }: CategorySliderProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((c) => {
          const isActive = c.id === activeId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => onSelect(c.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={c.icon as any}
                  size={26}
                  color={isActive ? "#fff" : GatiMitraColors.emerald}
                />
              </View>
              <AppText style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {c.name}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 3,
  elevation: 2,
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 2 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingVertical: 10,
    gap: GAP,
  },
  card: {
    width: CARD_SIZE,
    alignItems: "center",
    marginRight: GAP,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...CARD_SHADOW,
  },
  cardActive: {
    backgroundColor: GatiMitraColors.emerald,
    borderColor: GatiMitraColors.emerald,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  iconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
  },
  labelActive: {
    color: GatiMitraColors.textOnGradient,
  },
});
