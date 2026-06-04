import { RIDER_TAB_BAR_CONTENT_HEIGHT } from "@/src/lib/active-order-display";
import {
  resolveNavScreenBottomInset,
  resolveRiderTabBarBottomInset,
} from "@/src/hooks/useRiderBottomInset";

/** Total height of the bottom tab bar including system navigation inset. */
export function getRiderTabBarTotalHeight(safeBottomInset: number): number {
  const bottomPad = resolveRiderTabBarBottomInset(safeBottomInset);
  return RIDER_TAB_BAR_CONTENT_HEIGHT + bottomPad;
}

/** Padding for inline sheets docked directly above the tab bar (no extra gap). */
export function getRiderSheetPaddingAboveTabBar(): number {
  return 8;
}

/** @deprecated Use useNavScreenBottomInset() on full-screen navigation. */
export function getRiderNavScreenBottomInset(safeBottomInset: number): number {
  return resolveNavScreenBottomInset(safeBottomInset);
}
