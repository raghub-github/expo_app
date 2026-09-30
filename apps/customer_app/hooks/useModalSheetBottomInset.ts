import { useMemo } from "react";
import { Dimensions, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Height of the Android system navigation bar that a translucent Modal draws
 * under, while the activity window itself does not include it.
 * Gesture nav and 3-button nav both come from screen vs window, not a fixed dp.
 */
export function androidNavigationBarOverlap(): number {
  if (Platform.OS !== "android") return 0;
  const screenH = Dimensions.get("screen").height;
  const windowH = Dimensions.get("window").height;
  const status = StatusBar.currentHeight ?? 0;
  const overlap = Math.round(screenH - windowH - status);
  if (overlap > 0 && overlap < 160) return overlap;
  return 0;
}

/** Bottom padding for Modal sheets so actions sit above gesture / 3-button nav. */
export function useModalSheetBottomInset(extra = 0): number {
  const insets = useSafeAreaInsets();
  const navOverlap = androidNavigationBarOverlap();
  return useMemo(
    () => Math.max(insets.bottom, navOverlap, 0) + extra,
    [insets.bottom, navOverlap, extra]
  );
}
