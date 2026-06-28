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

export type GridFirstStickyMetrics = {
  topInset: number;
  heroHeight: number;
  goldStripHeight: number;
  categoryBlockY: number;
  categoryBlockHeight: number;
  searchRowHeight: number;
};

export function defaultGridFirstStickyMetrics(
  topInset: number,
  heroHeight: number,
  categoryCircle = 50
): GridFirstStickyMetrics {
  const categoryBlockHeight = gridFirstCategoryBlockHeight(categoryCircle);
  return {
    topInset,
    heroHeight,
    goldStripHeight: GRID_FIRST_GOLD_STRIP_H,
    categoryBlockY: heroHeight + GRID_FIRST_GOLD_STRIP_H,
    categoryBlockHeight,
    searchRowHeight: GRID_FIRST_SEARCH_ROW_H,
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
