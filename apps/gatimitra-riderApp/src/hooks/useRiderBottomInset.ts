import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Android 3-button nav often reports 0 bottom inset with edge-to-edge.
 * Reserve space so sheets and sliders sit above the system navigation bar.
 */
export const ANDROID_SYSTEM_NAV_FALLBACK_DP = 48;

/** Reliable bottom inset: safe area + Android fallback when inset is missing. */
export function resolveRiderBottomInset(safeBottomInset: number): number {
  if (Platform.OS === "android" && safeBottomInset < 28) {
    return Math.max(safeBottomInset, ANDROID_SYSTEM_NAV_FALLBACK_DP);
  }
  return Math.max(safeBottomInset, Platform.OS === "ios" ? 0 : 8);
}

export function useRiderBottomInset(): number {
  const insets = useSafeAreaInsets();
  return resolveRiderBottomInset(insets.bottom);
}

/** Full-screen nav (no tab bar): only real safe area — avoids large Android fallback gap. */
export function resolveNavScreenBottomInset(safeBottomInset: number): number {
  return Math.max(safeBottomInset, Platform.OS === "android" ? 8 : 4);
}

export function useNavScreenBottomInset(): number {
  const insets = useSafeAreaInsets();
  return resolveNavScreenBottomInset(insets.bottom);
}

/** Tab bar system nav pad — tighter than sheet fallback when inset is 0. */
export function resolveRiderTabBarBottomInset(safeBottomInset: number): number {
  if (Platform.OS === "android" && safeBottomInset < 12) {
    return 12;
  }
  return Math.max(safeBottomInset, Platform.OS === "ios" ? 0 : 4);
}
