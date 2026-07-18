import React from "react";
import { AppText } from "@/components/AppText";

import { TouchableOpacity, StyleSheet, Platform, View } from "react-native";
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
      style={[styles.wrap, { bottom }]}
      activeOpacity={0.9}
    >
      <View style={styles.fab}>
        <Ionicons name="restaurant-outline" size={18} color="#FFFFFF" />
        <AppText style={styles.text}>Menu</AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    zIndex: 220,
    elevation: 32,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: StoreTheme.fabBg,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
