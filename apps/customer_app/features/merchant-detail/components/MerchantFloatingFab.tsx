import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { StoreTheme } from "@/constants/storeTheme";

export type MerchantFloatingFabProps = {
  bottom: number;
  onPress: () => void;
  animatedStyle: object;
};

export const MerchantFloatingFab = React.memo(function MerchantFloatingFab({
  bottom,
  onPress,
  animatedStyle,
}: MerchantFloatingFabProps) {
  return (
    <Animated.View style={[styles.wrap, { bottom }, animatedStyle]} pointerEvents="box-none">
      <TouchableOpacity onPress={onPress} style={styles.fab} activeOpacity={0.9}>
        <Ionicons name="restaurant-outline" size={18} color="#fff" />
        <Text style={styles.text}>Menu</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    zIndex: 15,
  },
  fab: {
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
