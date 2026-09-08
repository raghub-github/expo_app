import { Stack } from "expo-router";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

/**
 * File-based routes register screens automatically. Only override options here.
 * Listing every Stack.Screen caused NativeWind wrap-jsx + React Navigation
 * useSyncState to thrash (Maximum update depth) on mount.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f4fbf6" },
        animation: "fade",
      }}
    >
      <Stack.Screen
        name="language"
        options={{ contentStyle: { backgroundColor: RIDER_AUTH_BG } }}
      />
    </Stack>
  );
}
