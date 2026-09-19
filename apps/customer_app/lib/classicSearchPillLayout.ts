/**
 * Pure layout math for Classic Food floating Search pill bottom offset.
 * Kept separate so position cannot silently depend on restaurant/API state.
 *
 * `bottom` = distance from screen bottom → pill's bottom edge.
 * Must clear the full tab capsule, and when cart/track is up, clear that row too.
 */

/** Matches CustomerTabBar CAPSULE_H — full nav height. */
export const CLASSIC_SEARCH_PILL_NAV_CLEARANCE = 64;
export const CLASSIC_SEARCH_PILL_CAPSULE_H = 38;
/** Gap between the top of the nav chrome and the search pill (smaller = lower on screen). */
export const CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP = 0;
/** Matches layout FLOATING_CART_ABOVE_TAB_GAP + small breathing room above cart. */
export const CLASSIC_SEARCH_PILL_CART_EXTRA = 16;

export type ClassicSearchPillBottomInput = {
  safeBottom: number;
  resolveChromeBottom: (safeBottom: number) => number;
  cartDockVisible: boolean;
  floatingCartBarHeight: number;
  classicNavExpanded: boolean;
  extraBottom?: number;
};

export function resolveClassicSearchPillBottom(input: ClassicSearchPillBottomInput): number {
  const cartDockLift = input.cartDockVisible
    ? input.floatingCartBarHeight + CLASSIC_SEARCH_PILL_CART_EXTRA
    : 0;
  return (
    input.resolveChromeBottom(input.safeBottom) +
    CLASSIC_SEARCH_PILL_NAV_CLEARANCE +
    CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP +
    cartDockLift +
    (input.extraBottom ?? 0) +
    (input.classicNavExpanded ? 6 : 0)
  );
}
