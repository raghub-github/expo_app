import { Appearance, Platform, StatusBar } from "react-native";
import {
  resolveAndroidSystemNavBackground,
  resolveAndroidSystemNavButtonStyle,
} from "@/constants/layout";

/**
 * SDK 53+ Android may be edge-to-edge. When edge-to-edge is off, native nav bar
 * background can be set; otherwise AndroidSystemNavigationFill paints the inset.
 * Defaults follow the device light/dark theme — never brand mint.
 */
export async function applyAndroidNavigationChrome(options?: {
  buttonStyle?: "light" | "dark";
  backgroundColor?: string;
}): Promise<void> {
  if (Platform.OS !== "android") return;
  const NavigationBar = await import("expo-navigation-bar");
  const scheme = Appearance.getColorScheme();
  const style = options?.buttonStyle ?? resolveAndroidSystemNavButtonStyle(scheme);
  const backgroundColor =
    options?.backgroundColor ?? resolveAndroidSystemNavBackground(scheme);
  try {
    await NavigationBar.setVisibilityAsync("visible");
    await NavigationBar.setButtonStyleAsync(style);
    if (typeof NavigationBar.setBackgroundColorAsync === "function") {
      await NavigationBar.setBackgroundColorAsync(backgroundColor);
    }
    if (typeof NavigationBar.setStyle === "function") {
      NavigationBar.setStyle(style === "light" ? "dark" : "light");
    }
  } catch {
    // Edge-to-edge builds may no-op background APIs — AndroidSystemNavigationFill covers it.
  }
}

export function applyAndroidStatusBarVisible(barStyle?: "light-content" | "dark-content") {
  StatusBar.setHidden(false, "none");
  if (Platform.OS !== "android") return;
  if (barStyle) StatusBar.setBarStyle(barStyle, true);
}
