import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveBottomSafeInset } from "@/constants/layout";

/** Safe area insets with Android navigation-bar fallback for edge-to-edge. */
export function useAppSafeAreaInsets() {
  const insets = useSafeAreaInsets();

  return useMemo(
    () => ({
      ...insets,
      bottom: resolveBottomSafeInset(insets.bottom),
    }),
    [insets.top, insets.bottom, insets.left, insets.right]
  );
}
