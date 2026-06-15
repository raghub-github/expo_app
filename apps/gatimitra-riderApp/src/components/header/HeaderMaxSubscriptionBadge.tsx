import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { colors } from "@/src/theme";

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
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: colors.primary[900],
    borderWidth: 1.5,
    borderColor: "#FBBF24",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  label: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "800",
    color: "#FBBF24",
    letterSpacing: 0.8,
    includeFontPadding: false,
    flexShrink: 0,
  },
});
