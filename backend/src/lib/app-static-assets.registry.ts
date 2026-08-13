export const APP_STATIC_ASSET_APPS = ["customer", "rider", "merchant"] as const;
export type AppStaticAssetApp = (typeof APP_STATIC_ASSET_APPS)[number];

export type AppStaticAssetSeed = {
  id: string;
  app: AppStaticAssetApp;
  section: string;
  label: string;
  description: string;
  sortOrder: number;
};

/** Canonical registry of every hardcoded app image slot (seeded into DB). */
export const APP_STATIC_ASSET_SEEDS: AppStaticAssetSeed[] = [
  // ── Customer: Auth & onboarding ──
  { id: "customer.auth.logo", app: "customer", section: "Auth", label: "Logo", description: "OTP & onboarding screens", sortOrder: 10 },
  { id: "customer.auth.logo_with_name", app: "customer", section: "Auth", label: "Logo with name", description: "Login screen", sortOrder: 20 },

  // ── Customer: Branding ──
  {
    id: "customer.brand.app_icon",
    app: "customer",
    section: "Branding",
    label: "App icon",
    description:
      "In-app bootstrap / brand mark. Updates on next app open. Phone home-screen icon still needs a store rebuild.",
    sortOrder: 10,
  },

  // ── Customer: Home ──
  { id: "customer.home.brand_banner", app: "customer", section: "Home", label: "Brand banner", description: "Home brand strip (gm.png)", sortOrder: 10 },
  { id: "customer.home.service_food", app: "customer", section: "Home", label: "Food service card", description: "Home services grid — Order Food", sortOrder: 20 },
  { id: "customer.home.service_ride", app: "customer", section: "Home", label: "Ride service card", description: "Home services grid — Book a Ride", sortOrder: 30 },
  { id: "customer.home.service_parcel", app: "customer", section: "Home", label: "Parcel service card", description: "Home services grid — Courier", sortOrder: 40 },
  { id: "customer.home.service_ecommerce", app: "customer", section: "Home", label: "E-commerce service card", description: "Home services grid — E-Commerce", sortOrder: 50 },
  { id: "customer.home.service_voucher", app: "customer", section: "Home", label: "Voucher service card", description: "Home services grid — Vouchers", sortOrder: 60 },
  { id: "customer.home.service_location", app: "customer", section: "Home", label: "Near me service card", description: "Home services grid — Explore Nearby", sortOrder: 70 },
  { id: "customer.home.promo_offer", app: "customer", section: "Home", label: "Promo banner 1", description: "Home promo carousel", sortOrder: 80 },
  { id: "customer.home.promo_offer_2", app: "customer", section: "Home", label: "Promo banner 2", description: "Home promo carousel", sortOrder: 90 },
  { id: "customer.home.promo_ride_offer_1", app: "customer", section: "Home", label: "Ride offer banner 1", description: "Ride promo carousel", sortOrder: 100 },
  { id: "customer.home.promo_ride_offer_2", app: "customer", section: "Home", label: "Ride offer banner 2", description: "Ride promo carousel", sortOrder: 110 },

  // ── Customer: Ride ──
  { id: "customer.ride.banner", app: "customer", section: "Ride", label: "Ride home banner", description: "Ride home top banner", sortOrder: 10 },
  { id: "customer.ride.bottom_banner", app: "customer", section: "Ride", label: "Ride bottom banner", description: "Ride home bottom banner", sortOrder: 20 },
  { id: "customer.ride.bike", app: "customer", section: "Ride", label: "Bike option", description: "Ride option list & grid", sortOrder: 30 },
  { id: "customer.ride.auto", app: "customer", section: "Ride", label: "Auto option", description: "Ride option list & grid", sortOrder: 40 },
  { id: "customer.ride.cab", app: "customer", section: "Ride", label: "Cab option", description: "Ride option list & grid", sortOrder: 50 },
  { id: "customer.ride.cab_premium", app: "customer", section: "Ride", label: "Premium cab option", description: "Ride option list & grid", sortOrder: 60 },
  { id: "customer.ride.travel", app: "customer", section: "Ride", label: "Travel option", description: "Ride option list & grid", sortOrder: 70 },
  { id: "customer.ride.ride_card", app: "customer", section: "Ride", label: "Ride card", description: "Ride card component", sortOrder: 80 },
  { id: "customer.ride.waiting_hero", app: "customer", section: "Ride", label: "Payment waiting hero", description: "Fare payment pending screen", sortOrder: 90 },
  { id: "customer.ride.map_bike", app: "customer", section: "Ride", label: "Map marker — bike", description: "Ride booking map markers", sortOrder: 100 },
  { id: "customer.ride.map_auto", app: "customer", section: "Ride", label: "Map marker — auto", description: "Ride booking map markers", sortOrder: 110 },
  { id: "customer.ride.map_cab", app: "customer", section: "Ride", label: "Map marker — cab", description: "Ride booking map markers", sortOrder: 120 },
  { id: "customer.ride.map_travel", app: "customer", section: "Ride", label: "Map marker — travel", description: "Ride booking map markers", sortOrder: 130 },

  // ── Customer: Search categories ──
  { id: "customer.search.biryani", app: "customer", section: "Search", label: "Biryani", description: "Search category grid", sortOrder: 10 },
  { id: "customer.search.chicken", app: "customer", section: "Search", label: "Chicken", description: "Search category grid", sortOrder: 20 },
  { id: "customer.search.pizza", app: "customer", section: "Search", label: "Pizza", description: "Search category grid", sortOrder: 30 },
  { id: "customer.search.north_indian", app: "customer", section: "Search", label: "North Indian", description: "Search category grid (north-indian slug)", sortOrder: 40 },
  { id: "customer.search.paneer", app: "customer", section: "Search", label: "Paneer", description: "Search category grid", sortOrder: 50 },
  { id: "customer.search.chinese", app: "customer", section: "Search", label: "Chinese", description: "Search category grid", sortOrder: 60 },
  { id: "customer.search.cake", app: "customer", section: "Search", label: "Cake", description: "Search category grid", sortOrder: 70 },
  { id: "customer.search.veg_meal", app: "customer", section: "Search", label: "Veg meal", description: "Search category grid (veg-meal slug)", sortOrder: 80 },
  { id: "customer.search.sweets", app: "customer", section: "Search", label: "Sweets", description: "Search category grid", sortOrder: 90 },
  { id: "customer.search.thali", app: "customer", section: "Search", label: "Thali", description: "Search category grid", sortOrder: 100 },
  { id: "customer.search.burger", app: "customer", section: "Search", label: "Burger", description: "Search category grid", sortOrder: 110 },
  { id: "customer.search.rolls", app: "customer", section: "Search", label: "Rolls", description: "Search category grid", sortOrder: 120 },
  { id: "customer.search.noodles", app: "customer", section: "Search", label: "Noodles", description: "Search category grid", sortOrder: 130 },
  { id: "customer.search.dosa", app: "customer", section: "Search", label: "Dosa", description: "Search category grid", sortOrder: 140 },
  { id: "customer.search.momos", app: "customer", section: "Search", label: "Momos", description: "Search category grid", sortOrder: 150 },
  { id: "customer.search.fried_rice", app: "customer", section: "Search", label: "Fried rice", description: "Search category grid (fried-rice slug)", sortOrder: 160 },
  { id: "customer.search.chilli_chicken", app: "customer", section: "Search", label: "Chilli chicken", description: "Search category grid", sortOrder: 170 },
  { id: "customer.search.pav_bhaji", app: "customer", section: "Search", label: "Pav bhaji", description: "Search category grid", sortOrder: 180 },
  { id: "customer.search.default", app: "customer", section: "Search", label: "Default category", description: "Search fallback image", sortOrder: 190 },

  // ── Customer: Orders & support ──
  { id: "customer.orders.post_delivery_hero", app: "customer", section: "Orders", label: "Post-delivery hero", description: "Food order delivered screen", sortOrder: 10 },
  { id: "customer.orders.support", app: "customer", section: "Orders", label: "Support icon", description: "Order delivered & support screens", sortOrder: 20 },
  { id: "customer.orders.support_hero", app: "customer", section: "Orders", label: "Support hero", description: "Raise ticket screen", sortOrder: 30 },
  { id: "customer.orders.toast_logo", app: "customer", section: "Orders", label: "Toast logo", description: "Invoice download & ride availability toasts", sortOrder: 40 },
  { id: "customer.orders.invoice_signature", app: "customer", section: "Orders", label: "Invoice authorised signature", description: "Authorised signatory on food order tax invoices (HTML + PDF)", sortOrder: 50 },

  // ── Customer: Checkout ──
  { id: "customer.checkout.rx_tip", app: "customer", section: "Checkout", label: "RX tip illustration", description: "Checkout gratitude section", sortOrder: 10 },
  { id: "customer.checkout.fed", app: "customer", section: "Checkout", label: "Fed illustration", description: "Checkout gratitude section", sortOrder: 20 },

  // ── Customer: Common ──
  { id: "customer.common.default_image", app: "customer", section: "Common", label: "Default placeholder", description: "Merchant/dish fallback across app", sortOrder: 10 },
  { id: "customer.common.empty_search", app: "customer", section: "Common", label: "Empty search", description: "Search no-results state", sortOrder: 20 },

  // ── Customer: Store ──
  { id: "customer.store.footer_promo", app: "customer", section: "Store", label: "Store footer promo", description: "Merchant store footer section", sortOrder: 10 },

  // ── Customer: Shop demo ──
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `customer.shop.product_${i + 1}`,
    app: "customer" as const,
    section: "Shop",
    label: `Shop product ${i + 1}`,
    description: "Shop demo product grid",
    sortOrder: (i + 1) * 10,
  })),

  // ── Rider ──
  {
    id: "rider.brand.app_icon",
    app: "rider",
    section: "Branding",
    label: "App icon",
    description:
      "In-app brand mark / splash icon. Updates on next app open. Phone home-screen icon still needs a store rebuild.",
    sortOrder: 10,
  },
  { id: "rider.auth.hero", app: "rider", section: "Auth", label: "Login hero", description: "Rider login & support empty state", sortOrder: 10 },
  { id: "rider.auth.logo", app: "rider", section: "Auth", label: "Brand logo", description: "Rider login & logo component", sortOrder: 20 },
  { id: "rider.auth.only_logo", app: "rider", section: "Auth", label: "Logo mark only", description: "Compact logo variant", sortOrder: 30 },
  { id: "rider.splash.rider_app", app: "rider", section: "Splash", label: "Splash / bootstrap", description: "App bootstrap screen", sortOrder: 10 },
  { id: "rider.orders.waiting_hero", app: "rider", section: "Orders", label: "Payment waiting hero", description: "Ride payment waiting screen", sortOrder: 10 },
  { id: "rider.orders.food_hero", app: "rider", section: "Orders", label: "Food delivery success", description: "Food delivery success screen", sortOrder: 20 },
  { id: "rider.ride.bike", app: "rider", section: "Ride", label: "Bike option", description: "Ride vehicle assets", sortOrder: 10 },
  { id: "rider.ride.auto", app: "rider", section: "Ride", label: "Auto option", description: "Ride vehicle assets", sortOrder: 20 },
  { id: "rider.ride.cab", app: "rider", section: "Ride", label: "Cab option", description: "Ride vehicle assets", sortOrder: 30 },
  { id: "rider.ride.cab_premium", app: "rider", section: "Ride", label: "Premium cab", description: "Ride vehicle assets", sortOrder: 40 },
  { id: "rider.ride.travel", app: "rider", section: "Ride", label: "Travel option", description: "Ride vehicle assets", sortOrder: 50 },
  { id: "rider.map.bike", app: "rider", section: "Map", label: "Map marker — bike", description: "Rider map assets", sortOrder: 10 },

  // ── Merchant ──
  {
    id: "merchant.brand.app_icon",
    app: "merchant",
    section: "Branding",
    label: "App icon",
    description:
      "In-app brand mark (login / header). Updates on next app open. Phone home-screen icon still needs a store rebuild.",
    sortOrder: 10,
  },
  { id: "merchant.auth.header", app: "merchant", section: "Auth", label: "Portal header", description: "Partner home header image", sortOrder: 10 },
  { id: "merchant.auth.welcome", app: "merchant", section: "Auth", label: "Welcome screen", description: "Merchant welcome onboarding slide 1", sortOrder: 20 },
  { id: "merchant.auth.welcome_slide_2", app: "merchant", section: "Auth", label: "Welcome carousel 2", description: "Welcome onboarding background slide 2", sortOrder: 21 },
  { id: "merchant.auth.welcome_slide_3", app: "merchant", section: "Auth", label: "Welcome carousel 3", description: "Welcome onboarding background slide 3", sortOrder: 22 },
  { id: "merchant.auth.welcome_slide_4", app: "merchant", section: "Auth", label: "Welcome carousel 4", description: "Welcome onboarding background slide 4", sortOrder: 23 },
  { id: "merchant.auth.welcome_slide_5", app: "merchant", section: "Auth", label: "Welcome carousel 5", description: "Welcome onboarding background slide 5", sortOrder: 24 },
  { id: "merchant.auth.welcome_slide_6", app: "merchant", section: "Auth", label: "Welcome carousel 6", description: "Welcome onboarding background slide 6", sortOrder: 25 },
  { id: "merchant.auth.logo", app: "merchant", section: "Auth", label: "Brand logo", description: "Login, header, outlet info", sortOrder: 30 },
  { id: "merchant.partner.manage_stores", app: "merchant", section: "Auth", label: "Manage stores art", description: "Partner home manage stores illustration; partnersite store settings empty state", sortOrder: 40 },
  { id: "merchant.orders.empty_new", app: "merchant", section: "Orders", label: "New orders empty", description: "Dashboard New tab waiting illustration", sortOrder: 10 },
  { id: "merchant.orders.empty_active", app: "merchant", section: "Orders", label: "Active orders empty", description: "Dashboard Active tab empty illustration", sortOrder: 20 },
  { id: "merchant.orders.empty_preparing", app: "merchant", section: "Orders", label: "Preparing empty", description: "Orders tab — Preparing stage empty illustration", sortOrder: 30 },
  { id: "merchant.orders.empty_ready", app: "merchant", section: "Orders", label: "Ready empty", description: "Orders tab — Ready stage empty illustration", sortOrder: 40 },
  { id: "merchant.orders.empty_picked_up", app: "merchant", section: "Orders", label: "Picked up empty", description: "Orders tab — Picked Up stage empty illustration", sortOrder: 50 },
  { id: "merchant.orders.empty_completed", app: "merchant", section: "Orders", label: "Completed empty", description: "Orders tab — Completed stage empty illustration", sortOrder: 60 },
  { id: "merchant.orders.empty_rto", app: "merchant", section: "Orders", label: "RTO empty", description: "Orders tab — RTO stage empty illustration", sortOrder: 70 },
  { id: "merchant.orders.empty_scheduled", app: "merchant", section: "Orders", label: "Scheduled empty", description: "Orders tab — Scheduled stage empty illustration", sortOrder: 80 },
  { id: "merchant.map.bike", app: "merchant", section: "Map", label: "Map marker — bike", description: "Merchant map assets", sortOrder: 10 },
  {
    id: "merchant.offers.promo_banner",
    app: "merchant",
    section: "Offers",
    label: "Promo offer banner",
    description: "Hero image on Offers & Promotions → Create offers (GatiMitra Promos card).",
    sortOrder: 10,
  },
  {
    id: "merchant.offers.empty_running",
    app: "merchant",
    section: "Offers",
    label: "No running offers",
    description: "Offers track — empty running offers illustration",
    sortOrder: 20,
  },
  {
    id: "merchant.onboarding.packaging_tips_video",
    app: "merchant",
    section: "Onboarding",
    label: "Packaging tips video",
    description: "Merchant onboarding — View packaging tips (MP4). Must play to the end to complete the task.",
    sortOrder: 10,
  },
];

export function parseAppStaticAssetApp(value: string): AppStaticAssetApp | null {
  const v = value.trim().toLowerCase();
  return APP_STATIC_ASSET_APPS.includes(v as AppStaticAssetApp) ? (v as AppStaticAssetApp) : null;
}
