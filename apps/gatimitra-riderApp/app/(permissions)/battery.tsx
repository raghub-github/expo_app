/**
 * Legacy route kept for deep-links. Battery optimization is now part of the
 * unified /(permissions)/request flow with real OS detection — redirect there.
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { colors } from "@/src/theme";

export default function BatteryOptimizationScreen() {
  useEffect(() => {
    router.replace("/(permissions)/request");
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
    </View>
  );
}
