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
