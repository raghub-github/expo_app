import { useEffect } from "react";
import { AppState, Platform, StatusBar, useColorScheme, type AppStateStatus } from "react-native";
import { applyAndroidNavigationChrome } from "@/lib/androidEdgeToEdgeChrome";
import {
  resolveAndroidSystemNavBackground,
  resolveAndroidSystemNavButtonStyle,
} from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";

function assertStatusBarVisible() {
  StatusBar.setHidden(false, "none");
}

/**
 * Android system navigation bar follows the device light/dark theme (not brand mint).
 * Kept in sync on resume / theme change.
 */
export function CustomerSystemChrome() {
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);
  const colorScheme = useColorScheme();

  useEffect(() => {
    assertStatusBarVisible();

    if (Platform.OS !== "android" || bootstrapActive) return;

    void applyAndroidNavigationChrome({
      buttonStyle: resolveAndroidSystemNavButtonStyle(colorScheme),
      backgroundColor: resolveAndroidSystemNavBackground(colorScheme),
    }).catch(() => {});

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      assertStatusBarVisible();
      if (useScreenChromeStore.getState().bootstrapActive) return;
      void applyAndroidNavigationChrome({
        buttonStyle: resolveAndroidSystemNavButtonStyle(colorScheme),
        backgroundColor: resolveAndroidSystemNavBackground(colorScheme),
      }).catch(() => {});
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [bootstrapActive, colorScheme]);

  return null;
}
