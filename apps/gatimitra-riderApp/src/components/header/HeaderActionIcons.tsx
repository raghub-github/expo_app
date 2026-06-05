import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type IconProps = {
  size?: number;
  color?: string;
};

/** Standard translate / language icon (A + script glyph) */
export function HeaderLanguageIcon({ size = 20, color = colors.gray[800] }: IconProps) {
  return <MaterialIcons name="translate" size={size} color={color} />;
}

/** Notification bell with optional red badge count */
export function HeaderNotificationIcon({
  size = 20,
  color = colors.gray[800],
  showBadge = true,
  badgeCount,
}: IconProps & { showBadge?: boolean; badgeCount?: number }) {
  const showCount = showBadge && badgeCount != null && badgeCount > 0;

  return (
    <View style={styles.bellWrap}>
      <Ionicons name="notifications-outline" size={size} color={color} />
      {showCount ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{badgeCount > 9 ? "9+" : String(badgeCount)}</Text>
        </View>
      ) : showBadge ? (
        <View style={styles.badge} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bellWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.error[500],
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  countBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.error[500],
    borderWidth: 1.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
});
