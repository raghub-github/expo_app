import { Platform, StatusBar } from "react-native";
import { CUSTOMER_SYSTEM_NAV_MINT } from "@/constants/layout";

/**
 * SDK 53+ Android may be edge-to-edge. When edge-to-edge is off, native nav bar
 * background can be set; otherwise the in-app AndroidSystemNavigationFill paints mint.
 */
export async function applyAndroidNavigationChrome(options?: {
  buttonStyle?: "light" | "dark";
  backgroundColor?: string;
}): Promise<void> {
  if (Platform.OS !== "android") return;
  const NavigationBar = await import("expo-navigation-bar");
  const style = options?.buttonStyle ?? "light";
  const backgroundColor = options?.backgroundColor ?? CUSTOMER_SYSTEM_NAV_MINT;
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
