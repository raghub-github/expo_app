import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Keeps the Android system navigation bar visible and out of the app content layer.
 * No-op on iOS / web.
 */
export function RiderSystemChrome() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    void (async () => {
      try {
        const NavigationBar = await import("expo-navigation-bar");
        // setPositionAsync / setBackgroundColorAsync warn on edge-to-edge Android (Expo Go SDK 54+).
        await NavigationBar.setVisibilityAsync("visible");
        await NavigationBar.setButtonStyleAsync("dark");
      } catch {
        // Package optional until `npx expo install expo-navigation-bar` is run.
      }
    })();
  }, []);

  return null;
}
