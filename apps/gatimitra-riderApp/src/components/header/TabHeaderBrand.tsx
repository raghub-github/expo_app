import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TabHeaderConfig } from "@/src/hooks/useTabHeaderTitle";
import {
  HEADER_BADGE_RADIUS,
  HEADER_BADGE_SIZE,
  HEADER_ICON_SIZE,
  HEADER_TITLE_SIZE,
  LORA_BOLD,
} from "@/src/theme/headerFonts";

type Props = {
  config: TabHeaderConfig;
};

export function TabHeaderBrand({ config }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBadge, { backgroundColor: config.accentBg }]}>
        <Ionicons name={config.icon} size={HEADER_ICON_SIZE} color={config.accentColor} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {config.title}
        </Text>
        <View style={[styles.accentLine, { backgroundColor: config.accentColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    marginRight: 12,
  },
  iconBadge: {
    width: HEADER_BADGE_SIZE,
    height: HEADER_BADGE_SIZE,
    borderRadius: HEADER_BADGE_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: HEADER_TITLE_SIZE,
    color: "#0F172A",
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  accentLine: {
    marginTop: 4,
    height: 2.5,
    width: 24,
    borderRadius: 2,
  },
});
