import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { GRID_FIRST_LOCATION_ROW_H } from "@/components/home/FoodHomeGridFirstHeader";

/** Default search row height (pill + veg toggle). */
export const GRID_FIRST_SEARCH_ROW_H = 44;

/** Default category tabs block height incl. section padding. */
export function gridFirstCategoryBlockHeight(circle: number): number {
  return circle + 40;
}

/** Gold subscription strip approximate height when visible. */
export const GRID_FIRST_GOLD_STRIP_H = 72;

/** Filter chips row height incl. bottom padding. */
export const GRID_FIRST_FILTER_ROW_H = 52;

/** In-flow filter begins appearing after this scroll offset (px). */
export const GRID_FIRST_FILTER_SHOW_SCROLL_Y = 8;

const STICK_HANDOFF_PX = 10;

export type GridFirstStickyMetrics = {
  topInset: number;
  heroHeight: number;
  goldStripHeight: number;
  categoryBlockY: number;
  categoryBlockHeight: number;
  searchRowHeight: number;
  filterBlockY: number;
  filterBlockHeight: number;
};

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
    searchRowHeight: GRID_FIRST_SEARCH_ROW_H,
    filterBlockY: categoryBlockY + categoryBlockHeight,
    filterBlockHeight: GRID_FIRST_FILTER_ROW_H,
  };
}

/** Scroll offset when the in-flow search row should pin below the status bar. */
export function gridFirstSearchStickScrollY(m: GridFirstStickyMetrics): number {
  const searchTopInContent =
    m.topInset + STATUS_BAR_TO_HEADER_GAP + GRID_FIRST_LOCATION_ROW_H;
  return Math.max(0, searchTopInContent - m.topInset);
}

/** Scroll offset when the category row should pin below the sticky search bar. */
export function gridFirstCategoryStickScrollY(m: GridFirstStickyMetrics): number {
  const stickySearchBottom = m.topInset + m.searchRowHeight;
  return Math.max(0, m.categoryBlockY - stickySearchBottom);
}

/** Screen Y for the sticky search bar top edge. */
export function gridFirstStickySearchTop(m: GridFirstStickyMetrics): number {
  return m.topInset;
}

/** Screen Y for the sticky category row top edge. */
export function gridFirstStickyCategoryTop(m: GridFirstStickyMetrics): number {
  return m.topInset + m.searchRowHeight;
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

export { STICK_HANDOFF_PX as GRID_FIRST_STICK_HANDOFF_PX };
