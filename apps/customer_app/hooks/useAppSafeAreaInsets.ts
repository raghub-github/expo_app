import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveBottomSafeInset, resolveTopSafeInset } from "@/constants/layout";

/** Safe area insets with Android navigation-bar / status-bar fallbacks for edge-to-edge. */
export function useAppSafeAreaInsets() {
  const insets = useSafeAreaInsets();

  return useMemo(
    () => ({
      ...insets,
      top: resolveTopSafeInset(insets.top),
      bottom: resolveBottomSafeInset(insets.bottom),
    }),
    [insets.top, insets.bottom, insets.left, insets.right]
  );
}
