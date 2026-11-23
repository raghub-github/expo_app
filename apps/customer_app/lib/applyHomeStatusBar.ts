/**
 * Tabs Home status bar — white icons on dark Home chrome.
 *
 * Dark-themed screens (Home) → light-content (white glyphs).
 * Light-themed screens → dark-content (dark glyphs).
 * Never leave splash/mint dark-content stuck on Home.
 */
import { Appearance, Platform, StatusBar as NativeStatusBar } from "react-native";
import { setStatusBarBackgroundColor, setStatusBarStyle } from "expo-status-bar";
import { HOME_DARK } from "@/constants/homeDarkTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useScreenChromeStore } from "@/store/screenChromeStore";

export const HOME_STATUS_BAR_BG = HOME_DARK.page;

/** Dark page (Home) → white status icons. */
export function applyHomeStatusBarChrome(reason?: string): void {
  void reason;
  applyStatusBarChrome({
    backgroundColor: HOME_STATUS_BAR_BG,
    style: "light",
    immersive: true,
  });
}

/** Light page (Profile / auth soft) → dark status icons. */
export function applyLightScreenStatusBarChrome(
  backgroundColor: string = GatiMitraColors.softBackground
): void {
  applyStatusBarChrome({
    backgroundColor,
    style: "dark",
    immersive: false,
  });
}

/**
 * Apply status bar from explicit page chrome.
 * `style: "light"` = white glyphs (for dark backgrounds).
 * `style: "dark"` = dark glyphs (for light backgrounds).
 */
export function applyStatusBarChrome(opts: {
  backgroundColor: string;
  style: "light" | "dark";
  immersive?: boolean;
}): void {
  const barStyle = opts.style === "light" ? "light-content" : "dark-content";
  NativeStatusBar.setHidden(false, "none");
  // animated=false — animated style flips were blinking white↔black on Home.
  NativeStatusBar.setBarStyle(barStyle, false);
  setStatusBarStyle(opts.style, false);
  if (Platform.OS === "android") {
    try {
      NativeStatusBar.setTranslucent(opts.immersive !== false);
      NativeStatusBar.setBackgroundColor(opts.backgroundColor, true);
    } catch {
      /* edge-to-edge may no-op */
    }
    try {
      setStatusBarBackgroundColor(opts.backgroundColor, true);
    } catch {
      /* ignored on edge-to-edge */
    }
  }
  const cur = useScreenChromeStore.getState();
  const nextImmersive = opts.immersive !== false;
  if (
    cur.bootstrapActive ||
    cur.statusBarBackground !== opts.backgroundColor ||
    cur.statusBarStyle !== opts.style ||
    cur.hideStatusBarSpacer !== nextImmersive
  ) {
    useScreenChromeStore.setState({
      bootstrapActive: false,
      statusBarBackground: opts.backgroundColor,
      statusBarStyle: opts.style,
      hideStatusBarSpacer: nextImmersive,
    });
  }
}

/** Follow device light/dark only when page chrome is unknown. */
export function applyStatusBarForSystemScheme(): void {
  const scheme = Appearance.getColorScheme();
  if (scheme === "dark") {
    applyStatusBarChrome({
      backgroundColor: HOME_STATUS_BAR_BG,
      style: "light",
      immersive: true,
    });
  } else {
    applyLightScreenStatusBarChrome();
  }
}
