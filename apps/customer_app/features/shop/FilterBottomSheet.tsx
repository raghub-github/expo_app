/**
 * Filter & sort bottom sheet – category, price sort, popular. Mobile-friendly.
 */

import { useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, Modal, TouchableOpacity, ScrollView, StyleSheet, Dimensions, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { ProductCategoryId } from "./data";

const { height: WINDOW_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = WINDOW_HEIGHT * 0.55;
const SPRING_CONFIG = { damping: 24, stiffness: 280 };

export type SortOption = "default" | "price_asc" | "price_desc" | "popular";

type FilterBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  selectedCategory: ProductCategoryId;
  onCategoryChange: (id: ProductCategoryId) => void;
  sortOption: SortOption;
  onSortChange: (opt: SortOption) => void;
  categories: Array<{ id: ProductCategoryId; name: string }>;
};

const SORT_OPTIONS: Array<{ id: SortOption; label: string }> = [
  { id: "default", label: "Default" },
  { id: "price_asc", label: "Price: Low → High" },
  { id: "price_desc", label: "Price: High → Low" },
  { id: "popular", label: "Popular" },
];

export function FilterBottomSheet({
  visible,
  onClose,
  selectedCategory,
  onCategoryChange,
  sortOption,
  onSortChange,
  categories,
}: FilterBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(WINDOW_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withSpring(1);
    } else {
      translateY.value = withSpring(WINDOW_HEIGHT, SPRING_CONFIG);
      backdropOpacity.value = withSpring(0);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.5,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              height: SHEET_HEIGHT + insets.bottom,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <Pressable style={styles.handleWrap} onPress={onClose}>
            <View style={styles.handle} />
          </Pressable>
          <AppText style={styles.title}>Filters & Sort</AppText>
          <AppText style={styles.subtitle}>Category & price</AppText>
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <AppText style={styles.sectionLabel}>Category</AppText>
            <View style={styles.chips}>
              {categories.map((c) => {
                const isActive = c.id === selectedCategory;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => onCategoryChange(c.id)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {c.name}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <AppText style={[styles.sectionLabel, { marginTop: 20 }]}>Sort by</AppText>
            <View style={styles.sortList}>
              {SORT_OPTIONS.map((opt) => {
                const isActive = sortOption === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.sortRow, isActive && styles.sortRowActive]}
                    onPress={() => onSortChange(opt.id)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.sortLabel, isActive && styles.sortLabelActive]}>
                      {opt.label}
                    </AppText>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={22} color={GatiMitraColors.emerald} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.9}>
              <AppText style={styles.applyBtnText}>Apply</AppText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...GatiMitraColors.elevationShadow,
  },
  handleWrap: { alignItems: "center", paddingVertical: 12 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  chipActive: {
    backgroundColor: GatiMitraColors.emerald,
    borderColor: GatiMitraColors.emerald,
  },
  chipText: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  chipTextActive: { color: "#fff" },
  sortList: { gap: 8 },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  sortRowActive: {
    borderColor: GatiMitraColors.emerald,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  sortLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  sortLabelActive: { color: GatiMitraColors.emerald },
  footer: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: GatiMitraColors.border },
  applyBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  applyBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
