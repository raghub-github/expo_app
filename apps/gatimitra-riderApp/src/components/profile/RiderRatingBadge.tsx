import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Props = {
  rating: string;
  style?: ViewStyle;
  /** Use light caption on dark / gradient hero cards. */
  variant?: "light" | "dark";
};

export function RiderRatingBadge({ rating, style, variant = "light" }: Props) {
  const { t } = useTranslation();
  const labelStyle = variant === "light" ? styles.labelLight : styles.labelDark;

  return (
    <View style={[styles.wrap, style]} accessibilityRole="text" accessibilityLabel={`${rating} rating`}>
      <View style={styles.pill}>
        <Ionicons name="star" size={11} color="#FFFFFF" />
        <Text style={styles.value}>{rating}</Text>
      </View>
      <Text style={labelStyle}>{t("profile.ratingLabel", "rating")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    minWidth: 44,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1B4337",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  value: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelLight: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
    textTransform: "lowercase",
  },
  labelDark: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "500",
    color: "#4B5563",
    textTransform: "lowercase",
  },
});
