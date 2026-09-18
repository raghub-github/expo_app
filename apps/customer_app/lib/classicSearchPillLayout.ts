/**
 * Pure layout math for Classic Food floating Search pill bottom offset.
 * Kept separate so position cannot silently depend on restaurant/API state.
 *
 * `bottom` = distance from screen bottom → pill's bottom edge.
 * Must clear the HOME edge / tab capsule (64) that sits at chromeBottom.
 */

/** Matches CustomerTabBar CAPSULE_H — Home edge + full nav share this height. */
export const CLASSIC_SEARCH_PILL_NAV_CLEARANCE = 64;
export const CLASSIC_SEARCH_PILL_CAPSULE_H = 38;
/** Gap between the top of the nav chrome and the search pill (smaller = lower on screen). */
export const CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP = 0;

export type ClassicSearchPillBottomInput = {
  safeBottom: number;
  resolveChromeBottom: (safeBottom: number) => number;
  cartDockVisible: boolean;
  floatingCartBarHeight: number;
  classicNavExpanded: boolean;
  extraBottom?: number;
};

export function resolveClassicSearchPillBottom(input: ClassicSearchPillBottomInput): number {
  const cartDockLift = input.cartDockVisible ? input.floatingCartBarHeight + 10 : 0;
  return (
    input.resolveChromeBottom(input.safeBottom) +
    CLASSIC_SEARCH_PILL_NAV_CLEARANCE +
    CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP +
    cartDockLift +
    (input.extraBottom ?? 0) +
    (input.classicNavExpanded ? 6 : 0)
  );
}
