/** Short keys matching GET /v1/app-assets/rider → assets map. */
export const RX = {
  brand: {
    appIcon: "brand.app_icon",
  },
  auth: {
    hero: "auth.hero",
    logo: "auth.logo",
    onlyLogo: "auth.only_logo",
  },
  splash: {
    riderApp: "splash.rider_app",
  },
  orders: {
    waitingHero: "orders.waiting_hero",
    foodHero: "orders.food_hero",
  },
  ride: {
    bike: "ride.bike",
    auto: "ride.auto",
    cab: "ride.cab",
    cabPremium: "ride.cab_premium",
    travel: "ride.travel",
  },
  map: {
    bike: "map.bike",
  },
} as const;
