import { useEffect } from "react";
import { Platform, StatusBar as NativeStatusBar } from "react-native";

/** Locked for every rider screen — changing this per-route is what made the bar blink. */
export const RIDER_STATUS_BAR_BG = "#FFFFFF";

function applyLockedRiderStatusBar(): void {
  NativeStatusBar.setHidden(false, "none");
  NativeStatusBar.setBarStyle("dark-content", false);
}

/**
 * One status-bar policy for the whole rider app:
 * always visible, dark icons, solid white, never translucent, no animated transitions.
 * Applied once. Re-applying on every resume was blinking the bar.
 */
export function RiderSystemChrome() {
  useEffect(() => {
    applyLockedRiderStatusBar();
    if (Platform.OS !== "android") return;
    void (async () => {
      try {
        const NavigationBar = await import("expo-navigation-bar");
        await NavigationBar.setVisibilityAsync("visible");
        await NavigationBar.setButtonStyleAsync("dark");
      } catch {
        // Package optional until expo-navigation-bar is installed.
      }
    })();
  }, []);

  return null;
}
