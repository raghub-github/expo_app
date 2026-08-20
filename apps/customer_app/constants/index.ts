/**
 * App-wide constants - single source of truth for keys and config.
 */

export {
  DEFAULT_STATUS_BAR_HEIGHT,
  HEADER_PADDING_TOP,
  HEADER_TOP_PADDING_NONE,
  HEADER_VERTICAL_PADDING,
} from "./layout";

export const STORAGE_KEYS = {
  AUTH_TOKEN: "gm_customer_access_token",
  AUTH_SESSION: "gm_customer_session_v1",
  CART: "gm_customer_cart_v1",
  SHOP_CART: "gm_customer_shop_cart_v1",
  THEME: "gm_customer_theme",
  LANGUAGE: "gm_customer_language",
  /** Dev-only: offline profile when backend is unreachable */
  PROFILE_OFFLINE: "gm_customer_profile_offline",
  /** Last fetched profile JSON for instant profile tab paint */
  PROFILE_CACHE: "gm_customer_profile_cache_v1",
  /** Active subscription plans for instant checkout GMitra Plus row */
  SUBSCRIPTION_PLANS_CACHE: "gm_customer_subscription_plans_cache_v1",
  /** Per-state food home layout for instant paint (classic / grid_first / discovery) */
  FOOD_HOME_LAYOUT_CACHE: "gm_customer_food_home_layout_cache_v2",
  /** Store menu payloads for instant revisit (SWR) */
  MERCHANT_MENU_CACHE: "gm_customer_merchant_menu_cache_v1",
  /** Nearby merchants list for instant food-home paint (geo-bucketed) */
  MERCHANTS_LIST_CACHE: "gm_customer_merchants_list_cache_v1",
  /** Per-store offers blob for instant restaurant-detail offer strip */
  STORE_OFFERS_CACHE: "gm_customer_store_offers_cache_v1",
  /** Last my-orders payload for instant "Your Orders & Collections" */
  MY_ORDERS_CACHE: "gm_customer_my_orders_cache_v1",
  /** Active person-ride order ids — survive force-close so Track pill can hydrate */
  ACTIVE_PERSON_RIDE_IDS: "gm_customer_active_person_ride_ids_v1",
  /** FOOD browse categories for instant home/search/category paint */
  USER_APP_CATEGORIES_CACHE: "gm_customer_user_app_categories_cache_v1",
  /** CMS static image URL map for instant ride/home asset paint */
  APP_ASSETS_CACHE: "gm_customer_app_assets_cache_v1",
  /** Default delivery partner tip amount saved from tracking sheet */
  SAVED_DELIVERY_TIP: "gm_saved_delivery_tip_v1",
  /** Last known GatiCash balance for instant header paint */
  WALLET_BALANCE_CACHE: "gm_customer_wallet_balance_cache_v1",
  /** Inbox notifications deleted by the user — inbox rows have no server-side delete */
  DISMISSED_NOTIFICATIONS: "gm_customer_dismissed_notifications_v1",
  /** Stores opened from discovery home — auto-clears after 24h */
  RECENTLY_VIEWED_STORES: "gm_customer_recently_viewed_stores_v1",
} as const;

export const API_TIMEOUT_MS = 30000;
/** Place-order / pending / finalize — billing recalc on server can take 30–60s under load. */
export const ORDER_PLACEMENT_TIMEOUT_MS = 90000;
/** POST /v1/billing/calculate — geo slabs + offers can exceed the default 30s API timeout. */
export const BILLING_CALCULATE_TIMEOUT_MS = 60000;
export const OTP_REQUEST_TIMEOUT_MS = 15000;
export const OTP_LENGTH = 6;

/** Order status display labels (customer-facing) */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  ORDER_PLACED: "Order Placed",
  PREPARING: "Preparing",
  PICKED_BY_RIDER: "On the Way",
  ON_THE_WAY: "On the Way",
  OUT_FOR_DELIVERY: "On the Way",
  IN_TRANSIT: "On the Way",
  DISPATCHED: "On the Way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ARRIVED_PICKUP: "At Restaurant",
  PICKED_UP: "On the Way",
  ARRIVED_DROP: "Arrived",
};
