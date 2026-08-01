import { useEffect } from "react";
import { useSegments } from "expo-router";
import {
  AppState,
  Platform,
  StatusBar as NativeStatusBar,
  type AppStateStatus,
} from "react-native";
import { useScreenChromeStore } from "@/store/screenChromeStore";

function assertSplashStatusBar() {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS !== "android") return;
  NativeStatusBar.setTranslucent(true);
  NativeStatusBar.setBackgroundColor("transparent", true);
  NativeStatusBar.setBarStyle("light-content", true);
}

function assertStatusBarVisible(opts?: { solidWhite?: boolean }) {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS !== "android") return;
  if (opts?.solidWhite) {
    NativeStatusBar.setTranslucent(false);
    NativeStatusBar.setBackgroundColor("#FFFFFF", true);
    NativeStatusBar.setBarStyle("dark-content", true);
    return;
  }
  // Immersive / translucent routes: never hide; keep dark icons (homes use light heroes).
  NativeStatusBar.setBarStyle("dark-content", true);
}

/**
 * Routes allowed to draw under the status bar (no root spacer).
 * Everything else must keep the spacer so headers never fall under system chrome.
 * Status bar icons themselves must remain visible on ALL routes.
 */
function routeAllowsImmersiveStatusBar(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  const leaf = segments[1] ?? "";

  // Food home (grid-first hero under status bar)
  if (root === "home" && (leaf === "" || leaf === "index")) return true;
  // Meals-under-price uses the same immersive hero chrome
  if (root === "home" && leaf === "meals-under-price") return true;
  // Payment success — green hero must paint under the status bar (never force white).
  if (root === "checkout" && leaf === "success") return true;

  return false;
}

/**
 * Keeps the root status-bar spacer on for every non-immersive route.
 * Prevents leaked immersive chrome from food home collapsing headers under the status bar.
 * Also re-asserts StatusBar visibility on every route + AppState resume.
 */
export function StatusBarRouteChromeGuard() {
  const segments = useSegments() as string[];
  const routeKey = segments.join("/");
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);

  /**
   * Visibility is an app-wide invariant. Native screens, modals, splash chrome,
   * or a previous route can otherwise leave Android/iOS in a hidden state.
   * Re-assert it on every route and whenever the app returns to foreground.
   * Splash/bootstrap: NEVER paint white — keep mint to match the gradient.
   */
  useEffect(() => {
    if (bootstrapActive) {
      assertSplashStatusBar();
    } else if (routeAllowsImmersiveStatusBar(segments)) {
      const chrome = useScreenChromeStore.getState();
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        const bg =
          chrome.statusBarBackground === "transparent"
            ? "transparent"
            : chrome.statusBarBackground;
        NativeStatusBar.setBackgroundColor(bg, true);
        NativeStatusBar.setBarStyle(
          chrome.statusBarStyle === "light" ? "light-content" : "dark-content",
          true
        );
      }
    } else {
      assertStatusBarVisible({
        solidWhite: true,
      });
    }

    const onAppStateChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      if (useScreenChromeStore.getState().bootstrapActive) {
        assertSplashStatusBar();
        return;
      }
      if (routeAllowsImmersiveStatusBar(segments)) {
        const chrome = useScreenChromeStore.getState();
        NativeStatusBar.setHidden(false, "none");
        if (Platform.OS === "android") {
          NativeStatusBar.setTranslucent(true);
          const bg =
            chrome.statusBarBackground === "transparent"
              ? "transparent"
              : chrome.statusBarBackground;
          NativeStatusBar.setBackgroundColor(bg, true);
          NativeStatusBar.setBarStyle(
            chrome.statusBarStyle === "light" ? "light-content" : "dark-content",
            true
          );
        }
        return;
      }
      assertStatusBarVisible({
        solidWhite: true,
      });
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [routeKey, segments, bootstrapActive]);

  useEffect(() => {
    if (bootstrapActive) {
      assertSplashStatusBar();
      return;
    }
    if (routeAllowsImmersiveStatusBar(segments)) {
      // Immersive is allowed — still never leave the bar hidden.
      // Honor screen chrome (e.g. payment success green + light icons).
      const chrome = useScreenChromeStore.getState();
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        const bg =
          chrome.statusBarBackground === "transparent"
            ? "transparent"
            : chrome.statusBarBackground;
        NativeStatusBar.setBackgroundColor(bg, true);
        NativeStatusBar.setBarStyle(
          chrome.statusBarStyle === "light" ? "light-content" : "dark-content",
          true
        );
      }
      return;
    }
    // EVERY non-immersive route (store, profile, checkout, orders, legal, tabs home, …)
    // must show a solid, visible status bar. If it inherited leaked immersive/transparent
    // chrome from a previous screen, restore the safe default.
    const chrome = useScreenChromeStore.getState();
    if (chrome.hideStatusBarSpacer || chrome.statusBarBackground === "transparent") {
      useScreenChromeStore.setState({
        statusBarBackground: "#FFFFFF",
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
        bootstrapActive: false,
      });
      assertStatusBarVisible({ solidWhite: true });
    }
  }, [segments, bootstrapActive, hideStatusBarSpacer]);

  return null;
}
