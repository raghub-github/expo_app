import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  getActiveOrderFloatingIcon,
  getActiveOrderFloatingLabel,
} from "@/src/lib/active-order-display";

type Props = {
  order: RiderOrderSummary;
  count: number;
  onPress: () => void;
};

/** Compact horizontal pill — rendered inside MapRightControls stack (no absolute positioning). */
export function ActiveOrderFloatingCard({ order, count, onPress }: Props) {
  const { t } = useTranslation();
  const iconName = getActiveOrderFloatingIcon(order);
  const label = getActiveOrderFloatingLabel(order);
  const badgeLabel = count > 99 ? "99+" : String(Math.max(1, count));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.host, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t("orders.activeFloat.openActiveOrder", "Open active order")}
    >
      <View style={styles.card}>
        <Ionicons name={iconName} size={18} color="#ffffff" />
        <Text style={styles.label} numberOfLines={1} allowFontScaling={false}>
          {label}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText} allowFontScaling={false}>
            {badgeLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  android: { elevation: 8 },
  default: {},
});

const styles = StyleSheet.create({
  host: {
    overflow: "visible",
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.98 }],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 14,
    backgroundColor: colors.primary[500],
    borderWidth: 1,
    borderColor: colors.primary[400],
    overflow: "visible",
    ...cardShadow,
  },
  label: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    maxWidth: 108,
    includeFontPadding: false,
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.error[500],
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    includeFontPadding: false,
  },
});
