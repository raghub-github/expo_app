import { useEffect } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { ANDROID_SYSTEM_NAV_COLOR } from "@/constants/layout";

async function applyAndroidSystemNavigationChrome() {
  const NavigationBar = await import("expo-navigation-bar");
  await NavigationBar.setVisibilityAsync("visible");
  try {
    await NavigationBar.setPositionAsync("relative");
  } catch {
    // Ignored on edge-to-edge builds where position is fixed.
  }
  await NavigationBar.setBackgroundColorAsync(ANDROID_SYSTEM_NAV_COLOR);
  await NavigationBar.setButtonStyleAsync("light");
  if (typeof NavigationBar.setStyle === "function") {
    await NavigationBar.setStyle("dark");
  }
  try {
    const SystemUI = await import("expo-system-ui");
    await SystemUI.setBackgroundColorAsync(ANDROID_SYSTEM_NAV_COLOR);
  } catch {
    // expo-system-ui optional at runtime.
  }
}

/**
 * Dark Android system navigation bar with light icons; kept in sync on resume.
 */
export function CustomerSystemChrome() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    void applyAndroidSystemNavigationChrome().catch(() => {
      // Optional until expo-navigation-bar native module is linked.
    });

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      void applyAndroidSystemNavigationChrome().catch(() => {});
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, []);

  return null;
}
