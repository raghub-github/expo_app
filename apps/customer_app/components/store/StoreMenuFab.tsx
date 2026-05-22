import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";

export type StoreMenuFabProps = {
  bottom: number;
  onPress: () => void;
};

export function StoreMenuFab({ bottom, onPress }: StoreMenuFabProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.fab, { bottom }]}
      activeOpacity={0.9}
    >
      <Ionicons name="restaurant-outline" size={18} color="#fff" />
      <Text style={styles.text}>Menu</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: StoreTheme.fabBg,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
    ...StoreTheme.cardShadow,
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
