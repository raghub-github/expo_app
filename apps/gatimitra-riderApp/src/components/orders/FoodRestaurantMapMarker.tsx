import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type Props = {
  name: string;
};

/** Food pickup pin — fork icon + restaurant name (reference map marker). */
export function FoodRestaurantMapMarker({ name }: Props) {
  const shortName = name.length > 22 ? `${name.slice(0, 20)}…` : name;

  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.labelPill}>
        <Text style={styles.labelText} numberOfLines={1}>
          {shortName}
        </Text>
      </View>
      <View style={styles.pin}>
        <Ionicons name="restaurant" size={18} color="#ffffff" />
      </View>
      <View style={styles.stem} />
      <View style={styles.dot} />
    </View>
  );
}

export const FOOD_RESTAURANT_MARKER_W = 160;
export const FOOD_RESTAURANT_MARKER_H = 88;

const PIN = colors.success[600];

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    maxWidth: FOOD_RESTAURANT_MARKER_W,
    minWidth: 72,
  },
  labelPill: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginBottom: 6,
    maxWidth: FOOD_RESTAURANT_MARKER_W,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  labelText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PIN,
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stem: {
    width: 3,
    height: 8,
    backgroundColor: PIN,
    marginTop: -1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PIN,
    borderWidth: 2,
    borderColor: "#fff",
  },
});
