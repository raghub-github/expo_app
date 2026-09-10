// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { colors } from "@/src/theme";
import { headerControlText } from "@/src/theme/headerFonts";

type Props = {
  onPress?: () => void;
  compact?: boolean;
};

export function HeaderMaxSubscriptionBadge({ onPress, compact = false }: Props) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push("/your-subscription");
  };

  return (
    <Pressable
      onPress={handlePress}
      delayPressIn={0}
      hitSlop={8}
      style={({ pressed }) => [styles.hitSlop, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t("subscription.maxBadgeA11y", "Gatimitra Max subscription active")}
    >
      <View style={[styles.badge, compact && styles.badgeCompact]}>
        <Ionicons name="star" size={compact ? 11 : 12} color="#FBBF24" />
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1} allowFontScaling={false}>
          {t("subscription.maxBadge", "MAX")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitSlop: {
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.88,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primary[900],
    borderWidth: 1.5,
    borderColor: "#FBBF24",
  },
  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  label: {
    marginLeft: 3,
    ...headerControlText,
    fontSize: 12,
    color: "#FBBF24",
    flexShrink: 0,
  },
  labelCompact: {
    fontSize: 11,
    marginLeft: 2,
  },
});
