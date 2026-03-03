/**
 * Route path constants - use with router.push/replace for type safety.
 */

export const ROUTES = {
  SPLASH: "/",
  LOGIN: "/(auth)/login",
  OTP: "/(auth)/otp",
  HOME: "/(tabs)/",
  HOME_FOOD: "/home",
  HOME_SERVICE: "/home/service",
  SEARCH: "/(tabs)/search",
  ORDERS: "/(tabs)/orders",
  PROFILE: "/(tabs)/profile",
  MERCHANT: "/home/merchant/[id]",
  CART: "/checkout",
  CHECKOUT: "/checkout",
  ORDER_TRACKING: "/orders/[id]",
  ORDER_HISTORY: "/(tabs)/orders",
  ADDRESSES: "/profile/addresses",
  HELP: "/profile/help",
} as const;
