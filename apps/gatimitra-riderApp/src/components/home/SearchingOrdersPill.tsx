import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { RadarTargetIcon } from "@/src/components/home/RiderRadarPulse";

/** MagicFleet-style pill — "Searching for orders" with animated radar icon. */
export function SearchingOrdersPill() {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <RadarTargetIcon size={24} />
        <Text style={styles.text}>{t("home.searchingOrders", "Searching for orders")}</Text>
      </View>
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
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 7,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    ...pillShadow,
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    letterSpacing: 0.05,
  },
});
