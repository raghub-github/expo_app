import { useEffect } from "react";
import { useSegments } from "expo-router";
import {
  AppState,
  StatusBar as NativeStatusBar,
  type AppStateStatus,
} from "react-native";
import { useScreenChromeStore } from "@/store/screenChromeStore";

function barStyleFromChrome(
  style: "light" | "dark" | undefined,
  backgroundColor?: string
): "light-content" | "dark-content" {
  if (style === "light") return "light-content";
  if (style === "dark") return "dark-content";
  const hex = (backgroundColor || "").replace("#", "").trim();
  if (hex.length < 6) return "dark-content";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "dark-content";
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "dark-content" : "light-content";
}

function applyBarVisibility(barStyle: "light-content" | "dark-content") {
  NativeStatusBar.setHidden(false, "none");
  NativeStatusBar.setBarStyle(barStyle, true);
}

function assertSplashStatusBar() {
  applyBarVisibility("light-content");
}

function assertStatusBarVisible(opts?: {
  solidWhite?: boolean;
  backgroundColor?: string;
  barStyle?: "light" | "dark";
}) {
  applyBarVisibility(barStyleFromChrome(opts?.barStyle, opts?.backgroundColor));
}

/**
 * Routes allowed to draw under the status bar (no root spacer).
 * Everything else must keep the spacer so headers never fall under system chrome.
 * Status bar icons themselves must remain visible on ALL routes.
 */
function routeAllowsImmersiveStatusBar(
  segments: readonly string[],
  hideStatusBarSpacer: boolean
): boolean {
  const root = segments[0] ?? "";
  const leaf = segments[1] ?? "";

  // Grid-first food home opts in via hideStatusBarSpacer. Discovery must keep the
  // root spacer — treating every /home as immersive slides CTA/categories under search.
  if (root === "home" && (leaf === "" || leaf === "index")) return hideStatusBarSpacer;
  // Meals-under-price uses the same immersive hero chrome
  if (root === "home" && leaf === "meals-under-price") return true;
  // Payment success — green hero must paint under the status bar (never force white).
  // Live route is /orders/payment-success; /checkout/success is the legacy alias.
  if (root === "checkout" && leaf === "success") return true;
  if (
    root === "orders" &&
    (leaf === "payment-success" || leaf === "payment-confirming")
  ) {
    return true;
  }

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
    } else if (routeAllowsImmersiveStatusBar(segments, hideStatusBarSpacer)) {
      const chrome = useScreenChromeStore.getState();
      applyBarVisibility(
        barStyleFromChrome(chrome.statusBarStyle, chrome.statusBarBackground)
      );
    } else if ((segments[0] ?? "") === "(auth)") {
      // Match login/OTP screen chrome — avoid white↔mint status-bar flicker.
      assertStatusBarVisible({ backgroundColor: "#F0F4F3", barStyle: "dark" });
    } else {
      // Honor screen-set chrome (e.g. courier mint / discovery dark).
      const chrome = useScreenChromeStore.getState();
      const bg =
        chrome.statusBarBackground && chrome.statusBarBackground !== "transparent"
          ? chrome.statusBarBackground
          : "#FFFFFF";
      assertStatusBarVisible({
        backgroundColor: bg,
        barStyle: chrome.statusBarStyle,
      });
    }

    const onAppStateChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      if (useScreenChromeStore.getState().bootstrapActive) {
        assertSplashStatusBar();
        return;
      }
      if (routeAllowsImmersiveStatusBar(segments, hideStatusBarSpacer)) {
        const chrome = useScreenChromeStore.getState();
        applyBarVisibility(
          barStyleFromChrome(chrome.statusBarStyle, chrome.statusBarBackground)
        );
        return;
      }
      if ((segments[0] ?? "") === "(auth)") {
        assertStatusBarVisible({ backgroundColor: "#F0F4F3", barStyle: "dark" });
        return;
      }
      const chrome = useScreenChromeStore.getState();
      const bg =
        chrome.statusBarBackground && chrome.statusBarBackground !== "transparent"
          ? chrome.statusBarBackground
          : "#FFFFFF";
      assertStatusBarVisible({
        backgroundColor: bg,
        barStyle: chrome.statusBarStyle,
      });
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [routeKey, segments, bootstrapActive, hideStatusBarSpacer]);

  useEffect(() => {
    if (bootstrapActive) {
      assertSplashStatusBar();
      return;
    }
    if (routeAllowsImmersiveStatusBar(segments, hideStatusBarSpacer)) {
      // Immersive is allowed — still never leave the bar hidden.
      // Honor screen chrome (e.g. payment success green + light icons).
      const chrome = useScreenChromeStore.getState();
      applyBarVisibility(
        barStyleFromChrome(chrome.statusBarStyle, chrome.statusBarBackground)
      );
      return;
    }
    // EVERY non-immersive route (store, profile, checkout, orders, legal, tabs home, …)
    // must show a solid, visible status bar. If it inherited leaked immersive/transparent
    // chrome from a previous screen, restore the safe default — unless the screen already
    // set a solid dark bar (discovery wallet / store).
    const chrome = useScreenChromeStore.getState();
    const authChrome = (segments[0] ?? "") === "(auth)";
    const desiredBar = authChrome ? "#F0F4F3" : "#FFFFFF";
    const hasSolidDarkChrome =
      chrome.statusBarStyle === "light" &&
      chrome.statusBarBackground !== "transparent" &&
      !chrome.hideStatusBarSpacer;
    if (hasSolidDarkChrome) {
      assertStatusBarVisible({
        backgroundColor: chrome.statusBarBackground,
        barStyle: "light",
      });
      return;
    }
    if (
      chrome.hideStatusBarSpacer ||
      chrome.statusBarBackground === "transparent" ||
      (authChrome && chrome.statusBarBackground !== desiredBar)
    ) {
      useScreenChromeStore.setState({
        statusBarBackground: desiredBar,
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
        bootstrapActive: false,
      });
      assertStatusBarVisible(
        authChrome
          ? { backgroundColor: desiredBar, barStyle: "dark" }
          : { solidWhite: true, barStyle: "dark" },
      );
    }
  }, [segments, bootstrapActive, hideStatusBarSpacer]);

  return null;
}
