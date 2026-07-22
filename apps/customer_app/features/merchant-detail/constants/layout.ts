import { Dimensions } from "react-native";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Hero banner — transform-only collapse; never animate height. */
export const HEADER_IMAGE_HEIGHT = 196;
export const HEADER_COLLAPSED_THRESHOLD = 100;

/** Sticky chrome row heights — keep in sync with component styles. */
export const STICKY_SEARCH_ROW_HEIGHT = 48;
export const CATEGORY_ROW_HEIGHT = 44;
export const FILTER_BAR_HEIGHT = 52;

/**
 * Gap under status bar before sticky search.
 * Merchant page owns safe-top itself (root spacer is hidden on this screen).
 */
export const MERCHANT_HEADER_TOP_EXTRA = STATUS_BAR_TO_HEADER_GAP;

/** @deprecated Use `merchantHeaderTopGutter()`. */
export const MERCHANT_HEADER_TOP_GUTTER = MERCHANT_HEADER_TOP_EXTRA;

/** Search wrap paddingBottom in MerchantStickyChrome — keep filter row below search. */
export const STICKY_SEARCH_WRAP_PADDING_BOTTOM = 10;

/** Visual pad for hero CTAs — add safe-top when root spacer is hidden. */
export const MERCHANT_HERO_ACTIONS_TOP_PAD = 8;

export function merchantHeroActionsTopPad(safeTop = 0): number {
  return Math.max(0, safeTop) + MERCHANT_HERO_ACTIONS_TOP_PAD;
}

/**
 * Sticky search top padding.
 * Pass `safeTop` (= insets.top) when the root status-bar spacer is hidden
 * (merchant owns safe area). Pass 0 when the root spacer is visible.
 */
export function merchantHeaderTopGutter(safeTop = 0): number {
  return Math.max(0, safeTop) + MERCHANT_HEADER_TOP_EXTRA;
}

export function merchantStickyFilterTop(safeTop = 0): number {
  return (
    merchantHeaderTopGutter(safeTop) +
    STICKY_SEARCH_ROW_HEIGHT +
    STICKY_SEARCH_WRAP_PADDING_BOTTOM
  );
}

export function menuScrollStickyOffset(safeTop = 0): number {
  return merchantStickyFilterTop(safeTop) + 6;
}

/** Fallback when insets are unavailable (tests / early layout). */
export const MERCHANT_STICKY_FILTER_TOP =
  MERCHANT_HEADER_TOP_EXTRA +
  STICKY_SEARCH_ROW_HEIGHT +
  STICKY_SEARCH_WRAP_PADDING_BOTTOM;

export const MENU_SCROLL_STICKY_OFFSET = MERCHANT_STICKY_FILTER_TOP + 6;

export const CART_BAR_HEIGHT = 56;
export const MENU_FAB_HEIGHT = 48;

export const SCREEN_WIDTH_EXPORT = SCREEN_WIDTH;

/** Menu row height — fixed for zero layout shift / stable scrollTo. */
export const MENU_ITEM_ROW_HEIGHT = 202;

/** Min height for menu-loading skeleton — fills viewport below hero/info so scroll never hits blank. */
export const MENU_LOADING_FILL_MIN_HEIGHT = Math.max(
  520,
  SCREEN_HEIGHT - HEADER_IMAGE_HEIGHT - 240
);
