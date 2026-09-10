import { TAB_BAR_CONTENT_HEIGHT_FALLBACK } from "@/src/lib/rider-bottom-dock";
import {
  resolveRiderTabBarBottomInset,
  resolveNavScreenBottomInset,
} from "@/src/hooks/useRiderBottomInset";

/**
 * Total height of the bottom tab bar.
 * Prefers measured onLayout height from RiderTabBar; falls back until first layout.
 */
export function getRiderTabBarTotalHeight(
  safeBottomInset: number,
  measuredTotalHeight?: number | null
): number {
  if (measuredTotalHeight != null && measuredTotalHeight > 0) {
    return measuredTotalHeight;
  }
  const bottomPad = resolveRiderTabBarBottomInset(safeBottomInset);
  return TAB_BAR_CONTENT_HEIGHT_FALLBACK + bottomPad;
}

/** Padding for inline sheets docked directly above the tab bar (no extra gap). */
export function getRiderSheetPaddingAboveTabBar(): number {
  return 8;
}

/** @deprecated Use useNavScreenBottomInset() on full-screen navigation. */
export function getRiderNavScreenBottomInset(safeBottomInset: number): number {
  return resolveNavScreenBottomInset(safeBottomInset);
}
