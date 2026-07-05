import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Hero banner — transform-only collapse; never animate height. */
export const HEADER_IMAGE_HEIGHT = 196;
export const HEADER_COLLAPSED_THRESHOLD = 100;

/** Sticky chrome row heights — keep in sync with component styles. */
export const STICKY_SEARCH_ROW_HEIGHT = 48;
export const CATEGORY_ROW_HEIGHT = 44;
export const FILTER_BAR_HEIGHT = 52;

export const MERCHANT_HEADER_TOP_GUTTER = 8;

/** Search wrap paddingBottom in MerchantStickyChrome — keep filter row below search. */
export const STICKY_SEARCH_WRAP_PADDING_BOTTOM = 10;

export const MERCHANT_STICKY_FILTER_TOP =
  MERCHANT_HEADER_TOP_GUTTER +
  STICKY_SEARCH_ROW_HEIGHT +
  STICKY_SEARCH_WRAP_PADDING_BOTTOM;

/** Sticky search chrome only — filter row is not pinned on scroll. */
export const MENU_SCROLL_STICKY_OFFSET = MERCHANT_STICKY_FILTER_TOP + 6;

export const CART_BAR_HEIGHT = 56;
export const MENU_FAB_HEIGHT = 48;

export const SCREEN_WIDTH_EXPORT = SCREEN_WIDTH;

/** Menu row height hint — used by row styles only, not forced on FlashList cells. */
export const MENU_ITEM_ROW_HEIGHT = 172;

/** Min height for menu-loading skeleton — fills viewport below hero/info so scroll never hits blank. */
export const MENU_LOADING_FILL_MIN_HEIGHT = Math.max(
  520,
  SCREEN_HEIGHT - HEADER_IMAGE_HEIGHT - 240
);
