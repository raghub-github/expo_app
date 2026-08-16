import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type Props = {
  context?: "home" | "navigation";
  missingToken?: boolean;
  /** Native @rnmapbox/maps module unavailable (Expo Go or missing dev build). */
  needsDevBuild?: boolean;
  /** When provided on home fallback, avoid "Turn ON duty" while already on duty. */
  isOnDuty?: boolean;
};

/**
 * Home: calm branded surface so Expo Go never feels like a stuck loader.
 * Navigation: keep actionable rebuild guidance.
 */
export function MapboxUnavailablePanel({
  context = "home",
  missingToken = false,
  needsDevBuild = false,
  isOnDuty = false,
}: Props) {
  const isNav = context === "navigation";

  if (!isNav && !missingToken) {
    return (
      <View style={styles.homeWrap} accessibilityLabel="Map preview">
        <View style={styles.homeCard}>
          <View style={styles.iconBubble}>
            <Ionicons name="bicycle" size={28} color={colors.primary[600]} />
          </View>
          <Text style={styles.homeTitle}>You are on the home screen</Text>
          <Text style={styles.homeBody}>
            {isOnDuty
              ? "Live map needs a native build — all other controls work now."
              : "Turn ON duty to receive orders. Live map needs a native build — all other controls work now."}
          </Text>
        </View>
      </View>
    );
  }

  const title = missingToken
    ? "Mapbox token missing"
    : needsDevBuild
      ? "Development build required"
      : "Mapbox unavailable";

  const body = missingToken
    ? "Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN (or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) to apps/gatimitra-riderApp/.env.local and restart Metro with npx expo start -c."
    : needsDevBuild
      ? "Native Mapbox (same as production) needs a development build — not Expo Go. Run: npx expo run:android (or EAS development build). Then test routes, polylines, and live tracking."
      : "Active ride navigation requires native Mapbox. Rebuild with npx expo run:android or install an EAS development build.";

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  homeWrap: {
    flex: 1,
    backgroundColor: "#E8F4F1",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  homeCard: {
    alignItems: "center",
    maxWidth: 300,
    gap: 10,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  homeTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
  },
  homeBody: {
    fontSize: 13,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 19,
  },
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
