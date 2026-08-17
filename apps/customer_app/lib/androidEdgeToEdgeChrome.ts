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
  const style = options?.buttonStyle ?? "light";
  // Best-effort: on edge-to-edge SDK 53+ some of these warn/no-op, and the
  // synchronous `setStyle` returns void (no `.catch`), so guard them together.
  try {
    await NavigationBar.setVisibilityAsync("visible");
    await NavigationBar.setButtonStyleAsync(style);
    if (typeof NavigationBar.setStyle === "function") {
      NavigationBar.setStyle(style === "light" ? "dark" : "light");
    }
  } catch {
    // unsupported / edge-to-edge navigation-bar API — safe no-op
  }
}

export function applyAndroidStatusBarVisible(barStyle?: "light-content" | "dark-content") {
  StatusBar.setHidden(false, "none");
  if (Platform.OS !== "android") return;
  if (barStyle) StatusBar.setBarStyle(barStyle, true);
}
