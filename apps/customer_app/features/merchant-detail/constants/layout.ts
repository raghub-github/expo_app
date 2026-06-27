import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** Hero banner — transform-only collapse; never animate height. */
export const HEADER_IMAGE_HEIGHT = 196;
export const HEADER_COLLAPSED_THRESHOLD = 100;

/** Sticky chrome row heights — keep in sync with component styles. */
export const STICKY_SEARCH_ROW_HEIGHT = 48;
export const CATEGORY_ROW_HEIGHT = 44;
export const FILTER_BAR_HEIGHT = 52;

export const MERCHANT_HEADER_TOP_GUTTER = 0;

export const MERCHANT_STICKY_FILTER_TOP =
  MERCHANT_HEADER_TOP_GUTTER + STICKY_SEARCH_ROW_HEIGHT + 10;

export const MENU_SCROLL_STICKY_OFFSET =
  MERCHANT_STICKY_FILTER_TOP + FILTER_BAR_HEIGHT + 6;

/** Scroll Y where sticky filter row locks below search. */
export const STICKY_FILTER_SHOW_Y = HEADER_IMAGE_HEIGHT + 156;

export const CART_BAR_HEIGHT = 64;
export const MENU_FAB_HEIGHT = 48;

export const SCREEN_WIDTH_EXPORT = SCREEN_WIDTH;

/** FlashList estimated sizes per item type (px). */
export const ESTIMATED_ITEM_SIZES = {
  hero: HEADER_IMAGE_HEIGHT,
  info: 248,
  closed_banner: 56,
  filter_bar: FILTER_BAR_HEIGHT + 20,
  category_bar: CATEGORY_ROW_HEIGHT + 8,
  past_orders: 180,
  combo_section: 200,
  section_lead: 52,
  section_header: 44,
  menu_item: 172,
  footer: 420,
  empty_menu: 80,
  menu_skeleton: 148,
} as const;

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/** FlashList tuning — large draw distance + native measurement (no forced row heights). */
export const FLASH_LIST_CONFIG = {
  drawDistance: Math.round(SCREEN_HEIGHT * 3),
  estimatedItemSize: ESTIMATED_ITEM_SIZES.menu_item,
  removeClippedSubviews: false,
} as const;
