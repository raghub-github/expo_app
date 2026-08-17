import { useEffect } from "react";
import { AppState, Platform, StatusBar, type AppStateStatus } from "react-native";
import { applyAndroidNavigationChrome } from "@/lib/androidEdgeToEdgeChrome";
import { useScreenChromeStore } from "@/store/screenChromeStore";

/**
 * Android system *navigation* bar only.
 * Edge-to-edge builds ignore position/background APIs — visibility + icon style only.
 */

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

    void applyAndroidNavigationChrome({ buttonStyle: "light" }).catch(() => {});

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      assertStatusBarVisible();
      if (useScreenChromeStore.getState().bootstrapActive) return;
      void applyAndroidNavigationChrome({ buttonStyle: "light" }).catch(() => {});
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [bootstrapActive]);

  return null;
}
