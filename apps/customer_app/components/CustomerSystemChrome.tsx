import { useEffect } from "react";
import { AppState, Platform, StatusBar, type AppStateStatus } from "react-native";
import { ANDROID_SYSTEM_NAV_COLOR } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";

/**
 * Android system *navigation* bar only.
 *
 * Do NOT call `expo-system-ui` here — that API tints the whole window (including
 * the status-bar region when the bar is translucent). Painting it `#121212`
 * made dark status-bar icons invisible on Home and other screens.
 * Status-bar / root window color is owned by `StatusBarSystemUISync` in `_layout`.
 */
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
}

function assertStatusBarVisible() {
  StatusBar.setHidden(false, "none");
}

/**
 * Dark Android system navigation bar with light icons; kept in sync on resume.
 * Always re-asserts that the status bar itself stays visible.
 */
export function CustomerSystemChrome() {
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);

  useEffect(() => {
    assertStatusBarVisible();

    if (Platform.OS !== "android" || bootstrapActive) return;

    void applyAndroidSystemNavigationChrome().catch(() => {
      // Optional until expo-navigation-bar native module is linked.
    });

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      assertStatusBarVisible();
      if (useScreenChromeStore.getState().bootstrapActive) return;
      void applyAndroidSystemNavigationChrome().catch(() => {});
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [bootstrapActive]);

  return null;
}
