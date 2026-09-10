import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { RadarTargetIcon } from "@/src/components/home/RiderRadarPulse";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type InlineProps = {
  compact?: boolean;
};

/** Inline pill for HomeMapTopChrome flex row — no absolute positioning. */
export function SearchingOrdersPillInline({ compact = false }: InlineProps) {
  const { t } = useTranslation();
  const { rf, rs, ri } = useResponsiveLayout();
  const iconSize = ri(compact ? 20 : 24);
  const fontSize = rf(compact ? 12 : 14, { min: 11, max: 15 });

  return (
    <View
      style={[
        styles.pill,
        {
          gap: rs(compact ? 8 : 12),
          paddingLeft: rs(8),
          paddingRight: rs(compact ? 12 : 18),
          paddingVertical: rs(7),
          maxWidth: "100%",
        },
      ]}
    >
      <RadarTargetIcon size={iconSize} />
      <Text
        style={[styles.text, { fontSize, flexShrink: 1 }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {t("home.searchingOrders", "Searching for orders")}
      </Text>
    </View>
  );
}

/** @deprecated Prefer HomeMapTopChrome + SearchingOrdersPillInline to avoid overlap. */
export function SearchingOrdersPill() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <SearchingOrdersPillInline />
    </View>
  );
}

const pillShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  android: { elevation: 5 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
    paddingHorizontal: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    ...pillShadow,
  },
  text: {
    fontWeight: "600",
    color: "#374151",
    letterSpacing: 0.05,
  },
});
