import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

type Props = {
  context?: "home" | "navigation";
  missingToken?: boolean;
};

export function MapboxUnavailablePanel({ context = "home", missingToken = false }: Props) {
  const isNav = context === "navigation";
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{missingToken ? "Mapbox token missing" : "Mapbox required"}</Text>
      <Text style={styles.body}>
        {missingToken
          ? "Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN to apps/gatimitra-riderApp/.env.local and restart Metro with npx expo start -c."
          : isNav
            ? "Active ride navigation uses Mapbox. Rebuild with npx expo run:android for native maps, or use Expo Go with the Mapbox web map (token required)."
            : "Mapbox token is set but native maps need a development build. In Expo Go, the Mapbox web map should load automatically after reload."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#E8F4F1",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.gray[900],
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
  },
});
