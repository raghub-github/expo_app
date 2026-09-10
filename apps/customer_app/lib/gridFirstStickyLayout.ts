import { HOME_HEADER_BELOW_STATUS_GAP } from "@/constants/layout";
import { GRID_FIRST_LOCATION_ROW_H } from "@/components/home/FoodHomeGridFirstHeader";

/** Default search row height (pill + veg toggle). */
export const GRID_FIRST_SEARCH_ROW_H = 44;

/** Gap between pinned search and category icons — same at rest and after scroll-up. */
export const GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP = 6;

/**
 * Snap sticky chrome this many px early so JS scroll lag does not flash a gap.
 * Must stay smaller than typical search-stick offset or the rail paints over search at rest.
 * Keep the numeric literal in worklets too — Reanimated cannot read JS module consts on the UI thread.
 */
export const GRID_FIRST_STICK_EARLY_PX = 8;
/** @deprecated Same value as GRID_FIRST_STICK_EARLY_PX — keep exported for stale worklet closures. */
export const GRID_FIRST_STICKY_EARLY_PX = GRID_FIRST_STICK_EARLY_PX;
/** Never snap sticky chrome in the first N px of a stick threshold (avoids y=0 overlap). */
export const GRID_FIRST_STICK_REST_PX = 8;

/** Default category tabs block height incl. section padding + meals-under card. */
export function gridFirstCategoryBlockHeight(circle: number): number {
  const mealsH = Math.round(circle * 1.34);
  const tabH = circle + 38;
  return Math.max(mealsH, tabH) + 16;
}

/** Gold subscription strip approximate height when visible. */
export const GRID_FIRST_GOLD_STRIP_H = 72;

/** Filter chips row height incl. bottom padding. */
export const GRID_FIRST_FILTER_ROW_H = 48;

/** In-flow filter begins appearing after this scroll offset (px). */
export const GRID_FIRST_FILTER_SHOW_SCROLL_Y = 8;

/** Header row + search overlay height on hero (excl. status bar). */
export const GRID_FIRST_HEADER_OVERLAY_H = 130;
/**
 * Compact hero media band as a fraction of screen width.
 * Tuned to food-delivery reference proportions (~1/3 width), not device pixels.
 * Layout height is UI-driven — never from source image/video dimensions.
 */
export const GRID_FIRST_HERO_WIDTH_RATIO = 0.36;
/** Floor for very narrow screens. */
export const GRID_FIRST_HERO_MIN_H = 118;
/** Extra px on the media band — applied on Food + Grocery grid-first homes. */
export const GRID_FIRST_HERO_HEIGHT_NUDGE = 14;
/** Cap vs viewport so the hero stays compact on tall phones. */
export const GRID_FIRST_HERO_MAX_SCREEN_FRAC = 0.205;
/**
 * @deprecated Prefer GRID_FIRST_HERO_WIDTH_RATIO. Kept for callers that still
 * pass an unused aspect argument (ignored for layout).
 */
export const GRID_FIRST_HERO_DEFAULT_ASPECT = 1 / GRID_FIRST_HERO_WIDTH_RATIO;
/**
 * Fallback media band height seed when screen width is not yet known.
 */
export const GRID_FIRST_HERO_VISIBLE_H = 142;

/** Crossfade window for in-flow ↔ sticky handoff (keep tight to avoid double-ghosting). */
const STICK_HANDOFF_PX = 4;

/** Scroll Y when sticky chrome should appear. Never returns 0 for a positive stickAt. */
export function gridFirstStickySnapY(stickAt: number, earlyPx?: number): number {
  "worklet";
  // Literals only — default-arg module consts crash Reanimated ("Property doesn't exist").
  const earlyDefault = 8;
  const restPx = 8;
  const usedEarly = earlyPx == null ? earlyDefault : earlyPx;
  if (stickAt <= 1) return Number.MAX_SAFE_INTEGER;
  const early = Math.min(usedEarly, Math.max(0, stickAt - restPx));
  return stickAt - early;
}

export function gridFirstStickyOn(y: number, stickAt: number): boolean {
  "worklet";
  return y >= gridFirstStickySnapY(stickAt);
}

export type GridFirstStickyMetrics = {
  topInset: number;
  heroHeight: number;
  goldStripHeight: number;
  categoryBlockY: number;
  categoryBlockHeight: number;
  /** Measured in-flow header block (location + search) for sticky alignment. */
  headerBlockHeight: number;
  searchRowHeight: number;
  filterBlockY: number;
  filterBlockHeight: number;
};

/** Default full header content height below the status bar (location + search). */
export function gridFirstDefaultHeaderBlockHeight(): number {
  return GRID_FIRST_LOCATION_ROW_H + GRID_FIRST_SEARCH_ROW_H;
}

export function defaultGridFirstStickyMetrics(
  topInset: number,
  heroHeight: number,
  categoryCircle = 50
): GridFirstStickyMetrics {
  const categoryBlockHeight = gridFirstCategoryBlockHeight(categoryCircle);
  const categoryBlockY = heroHeight + GRID_FIRST_GOLD_STRIP_H;
  return {
    topInset,
    heroHeight,
    goldStripHeight: GRID_FIRST_GOLD_STRIP_H,
    categoryBlockY,
    categoryBlockHeight,
    headerBlockHeight: gridFirstDefaultHeaderBlockHeight(),
    searchRowHeight: GRID_FIRST_SEARCH_ROW_H,
    filterBlockY: categoryBlockY + categoryBlockHeight,
    filterBlockHeight: GRID_FIRST_FILTER_ROW_H,
  };
}

/** Scroll offset when the in-flow search row should pin below the status bar. */
export function gridFirstSearchStickScrollY(m: GridFirstStickyMetrics): number {
  const searchRowTopInContent =
    m.topInset + HOME_HEADER_BELOW_STATUS_GAP + GRID_FIRST_LOCATION_ROW_H;
  const searchRowPinsAt = Math.max(0, searchRowTopInContent - m.topInset);
  // Grid-first search sits in the hero overlay at the top of the sky block — pin as soon
  // as that row would scroll off, not after the full hero media height clears.
  return searchRowPinsAt;
}

/** Scroll offset when the category row should pin below the sticky header. */
export function gridFirstCategoryStickScrollY(m: GridFirstStickyMetrics): number {
  const stickyHeaderBottom = m.topInset + m.headerBlockHeight;
  return Math.max(0, m.categoryBlockY - stickyHeaderBottom);
}

/** Screen Y for the sticky search bar top edge. */
export function gridFirstStickySearchTop(m: GridFirstStickyMetrics): number {
  return m.topInset;
}

/** Screen Y for the sticky category row top edge (flush below header; gap is inner padding). */
export function gridFirstStickyCategoryTop(m: GridFirstStickyMetrics): number {
  return m.topInset + m.headerBlockHeight;
}

/** Screen Y for the sticky filter row top edge. */
export function gridFirstStickyFilterTop(m: GridFirstStickyMetrics): number {
  return gridFirstStickyCategoryTop(m) + m.categoryBlockHeight;
}

/** Scroll offset when the in-flow filter row should pin below sticky search + category. */
export function gridFirstFilterStickScrollY(m: GridFirstStickyMetrics): number {
  const stickyTop = gridFirstStickyFilterTop(m);
  return Math.max(
    gridFirstCategoryStickScrollY(m),
    m.filterBlockY - stickyTop
  );
}

export function gridFirstSkySectionHeight(
  topInset: number,
  mediaVisibleH: number = GRID_FIRST_HERO_VISIBLE_H
): number {
  return topInset + GRID_FIRST_HEADER_OVERLAY_H + mediaVisibleH;
}

export { STICK_HANDOFF_PX as GRID_FIRST_STICK_HANDOFF_PX };
