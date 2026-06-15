import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

type Props = {
  context?: "home" | "navigation";
  missingToken?: boolean;
  /** Native @rnmapbox/maps module unavailable (Expo Go or missing dev build). */
  needsDevBuild?: boolean;
};

export function MapboxUnavailablePanel({
  context = "home",
  missingToken = false,
  needsDevBuild = false,
}: Props) {
  const isNav = context === "navigation";
  const title = missingToken
    ? "Mapbox token missing"
    : needsDevBuild
      ? "Development build required"
      : "Mapbox unavailable";

  const body = missingToken
    ? "Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN to apps/gatimitra-riderApp/.env.local and restart Metro with npx expo start -c."
    : needsDevBuild
      ? "Maps use native @rnmapbox/maps only. Install a development build: npx expo run:android (or EAS build). Expo Go does not support maps."
      : isNav
        ? "Active ride navigation requires native Mapbox. Rebuild with npx expo run:android or use an EAS development build."
        : "Native Mapbox maps require a development build. Run npx expo run:android or install an EAS build on your device.";

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
