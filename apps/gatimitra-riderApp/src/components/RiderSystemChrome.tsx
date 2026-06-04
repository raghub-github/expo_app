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
        await NavigationBar.setPositionAsync("relative");
        await NavigationBar.setVisibilityAsync("visible");
        await NavigationBar.setBackgroundColorAsync("#ffffff");
        await NavigationBar.setButtonStyleAsync("dark");
      } catch {
        // Package optional until `npx expo install expo-navigation-bar` is run.
      }
    })();
  }, []);

  return null;
}
