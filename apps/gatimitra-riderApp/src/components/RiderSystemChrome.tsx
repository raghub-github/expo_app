import { useEffect } from "react";
import {
  AppState,
  Platform,
  StatusBar as NativeStatusBar,
  type AppStateStatus,
} from "react-native";

/** Locked for every rider screen — changing this per-route is what made the bar blink. */
export const RIDER_STATUS_BAR_BG = "#FFFFFF";

function applyLockedRiderStatusBar(): void {
  NativeStatusBar.setHidden(false, "none");
  NativeStatusBar.setBarStyle("dark-content", false);
  if (Platform.OS !== "android") return;
  NativeStatusBar.setTranslucent(false);
  NativeStatusBar.setBackgroundColor(RIDER_STATUS_BAR_BG, false);
}

/**
 * One status-bar policy for the whole rider app:
 * always visible, dark icons, solid white, never translucent, no animated transitions.
 */
export function RiderSystemChrome() {
  useEffect(() => {
    applyLockedRiderStatusBar();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") applyLockedRiderStatusBar();
    };
    const sub = AppState.addEventListener("change", onAppState);

    if (Platform.OS !== "android") {
      return () => sub.remove();
    }

    void (async () => {
      try {
        const NavigationBar = await import("expo-navigation-bar");
        await NavigationBar.setVisibilityAsync("visible");
        await NavigationBar.setButtonStyleAsync("dark");
      } catch {
        // Package optional until `npx expo install expo-navigation-bar` is run.
      }
    })();

    return () => sub.remove();
  }, []);

  return null;
}
