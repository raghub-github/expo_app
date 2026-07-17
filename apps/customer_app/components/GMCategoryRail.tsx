/**
 * Category rail – 100% reference match.
 * White circular container (~68px) with soft shadow, image 46px, label below.
 * Active: green text (#19c37d) + thin green underline. Inactive: grey text (#808080).
 */

import React from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, ScrollView, StyleSheet, Image, ImageSourcePropType, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const CIRCLE_SIZE = 68;
const IMAGE_SIZE = 46;
const LABEL_GAP = 5;
const CARD_GAP = 14;
const ACTIVE_GREEN = "#19c37d";
const INACTIVE_GREY = "#808080";
const UNDERLINE_HEIGHT = 2.5;

export type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  image: ImageSourcePropType | null;
};

export type GMCategoryRailProps = {
  categories: CategoryItem[];
  activeId: string | null;
  onSelect: (id: string, slug: string) => void;
  compact?: boolean;
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function CategoryChip({
  item,
  isActive,
  onPress,
  compact,
}: {
  item: CategoryItem;
  isActive: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * (compact ? 0.92 : 1) }],
  }));

  const size = compact ? 56 : CIRCLE_SIZE;
  const imgSize = compact ? 38 : IMAGE_SIZE;

  return (
    <AnimatedTouchable
      style={[styles.chipWrap, animatedStyle]}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 260 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 260 });
      }}
      activeOpacity={1}
    >
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        {item.image ? (
          <Image
            source={item.image}
            style={{ width: imgSize, height: imgSize }}
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="search" size={imgSize * 0.55} color={INACTIVE_GREY} />
        )}
      </View>
      <AppText
        style={[
          styles.label,
          isActive && styles.labelActive,
          compact && styles.labelCompact,
        ]}
        numberOfLines={1}
      >
        {item.name}
      </AppText>
      {isActive && <View style={styles.underline} />}
    </AnimatedTouchable>
  );
}

export function GMCategoryRail({
  categories,
  activeId,
  onSelect,
  compact = false,
}: GMCategoryRailProps) {
  return (
    <View style={styles.railContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.rail, compact && styles.railCompact]}
      >
        {categories.map((cat) => (
          <CategoryChip
            key={cat.id}
            item={cat}
            isActive={activeId === cat.id}
            onPress={() => onSelect(cat.id, cat.slug)}
            compact={compact}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  railContainer: {
    backgroundColor: "#f3f7f6",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  rail: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  railCompact: {
    paddingVertical: 8,
  },
  chipWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: CARD_GAP,
  },
  circle: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 1, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        }
      : { elevation: 3 }),
  },
  label: {
    marginTop: LABEL_GAP,
    fontSize: 14,
    fontWeight: "500",
    color: INACTIVE_GREY,
    textAlign: "center",
    maxWidth: 72,
  },
  labelActive: {
    color: ACTIVE_GREEN,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: 12,
    maxWidth: 56,
  },
  underline: {
    width: "120%",
    maxWidth: 52,
    height: UNDERLINE_HEIGHT,
    backgroundColor: ACTIVE_GREEN,
    marginTop: 2,
    borderRadius: 1,
  },
});
