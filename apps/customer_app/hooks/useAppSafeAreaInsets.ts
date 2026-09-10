import { useMemo } from "react";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  resolveBottomSafeInset,
  resolveStableBottomInset,
  resolveTopSafeInset,
} from "@/constants/layout";

/** Process-wide lock so Home and the tab bar share one first-paint bottom inset. */
let lockedBottomInset: number | null = null;

/**
 * Safe area insets that don't start at 0 on Android (tab bar / home first paint).
 * Bottom may start from a seed / default, then grow when WindowInsets arrive —
 * never permanently lock an undersized value (that pinned the tab bar into the system nav).
 */
export function useAppSafeAreaInsets() {
  const insets = useSafeAreaInsets();
  const seedBottom = initialWindowMetrics?.insets.bottom ?? 0;
  const seedTop = initialWindowMetrics?.insets.top ?? 0;
  const bottomRaw = resolveStableBottomInset(insets.bottom, seedBottom);
  if (lockedBottomInset == null) {
    lockedBottomInset = bottomRaw;
  } else if (bottomRaw > lockedBottomInset) {
    lockedBottomInset = bottomRaw;
  }
  const bottom = resolveBottomSafeInset(lockedBottomInset);

  return useMemo(
    () => ({
      ...insets,
      top: resolveTopSafeInset(insets.top || seedTop),
      bottom,
    }),
    [insets.top, insets.bottom, insets.left, insets.right, seedTop, bottom]
  );
}
