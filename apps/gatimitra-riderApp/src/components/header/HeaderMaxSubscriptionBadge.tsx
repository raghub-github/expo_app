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
};

export function HeaderMaxSubscriptionBadge({ onPress }: Props) {
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
      <View style={styles.badge}>
        <Ionicons name="star" size={12} color="#FBBF24" />
        <Text style={styles.label} numberOfLines={1}>
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
  label: {
    marginLeft: 3,
    ...headerControlText,
    fontSize: 12,
    color: "#FBBF24",
    flexShrink: 0,
  },
});
