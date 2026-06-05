import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  label: string;
};

/** White pill on alternate route (Google Maps style). */
export function NavigationRouteAltLabel({ label }: Props) {
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1A73E8",
  },
});
