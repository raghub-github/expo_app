import { useEffect } from "react";
import { AppState, Platform, StatusBar, type AppStateStatus } from "react-native";
import { applyAndroidNavigationChrome } from "@/lib/androidEdgeToEdgeChrome";
import { CUSTOMER_SYSTEM_NAV_MINT } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";

/**
 * Android system navigation bar: mint background + light icons.
 * Gesture nav (bottom inset 0) gets no in-app filler — see AndroidSystemNavigationFill.
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

    void applyAndroidNavigationChrome({
      buttonStyle: "light",
      backgroundColor: CUSTOMER_SYSTEM_NAV_MINT,
    }).catch(() => {});

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      assertStatusBarVisible();
      if (useScreenChromeStore.getState().bootstrapActive) return;
      void applyAndroidNavigationChrome({
        buttonStyle: "light",
        backgroundColor: CUSTOMER_SYSTEM_NAV_MINT,
      }).catch(() => {});
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [bootstrapActive]);

  return null;
}
