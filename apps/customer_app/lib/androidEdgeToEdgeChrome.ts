import { Platform, StatusBar } from "react-native";

/**
 * SDK 53+ Android is edge-to-edge. Position / background APIs warn and no-op.
 * Keep visibility + icon style only.
 */
export async function applyAndroidNavigationChrome(options?: {
  buttonStyle?: "light" | "dark";
}): Promise<void> {
  if (Platform.OS !== "android") return;
  const NavigationBar = await import("expo-navigation-bar");
  await NavigationBar.setVisibilityAsync("visible").catch(() => {});
  const style = options?.buttonStyle ?? "light";
  await NavigationBar.setButtonStyleAsync(style).catch(() => {});
  if (typeof NavigationBar.setStyle === "function") {
    await NavigationBar.setStyle(style === "light" ? "dark" : "light").catch(() => {});
  }
}

export function applyAndroidStatusBarVisible(barStyle?: "light-content" | "dark-content") {
  StatusBar.setHidden(false, "none");
  if (Platform.OS !== "android") return;
  if (barStyle) StatusBar.setBarStyle(barStyle, true);
}
