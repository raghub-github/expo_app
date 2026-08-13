/** Short keys matching GET /v1/app-assets/merchant → assets map. */
export const MX = {
  brand: {
    appIcon: "brand.app_icon",
  },
  auth: {
    header: "auth.header",
    welcome: "auth.welcome",
    welcomeSlide2: "auth.welcome_slide_2",
    welcomeSlide3: "auth.welcome_slide_3",
    welcomeSlide4: "auth.welcome_slide_4",
    welcomeSlide5: "auth.welcome_slide_5",
    welcomeSlide6: "auth.welcome_slide_6",
    logo: "auth.logo",
  },
  partner: {
    manageStores: "partner.manage_stores",
  },
  orders: {
    emptyNew: "orders.empty_new",
    emptyActive: "orders.empty_active",
    emptyPreparing: "orders.empty_preparing",
    emptyReady: "orders.empty_ready",
    emptyPickedUp: "orders.empty_picked_up",
    emptyCompleted: "orders.empty_completed",
    emptyRto: "orders.empty_rto",
    emptyScheduled: "orders.empty_scheduled",
  },
  map: {
    bike: "map.bike",
  },
  offers: {
    promoBanner: "offers.promo_banner",
    emptyRunning: "offers.empty_running",
  },
  onboarding: {
    packagingTipsVideo: "onboarding.packaging_tips_video",
  },
} as const;

/** Welcome carousel keys in display order (CMS-managed). */
export const MX_WELCOME_SLIDE_KEYS = [
  MX.auth.welcome,
  MX.auth.welcomeSlide2,
  MX.auth.welcomeSlide3,
  MX.auth.welcomeSlide4,
  MX.auth.welcomeSlide5,
  MX.auth.welcomeSlide6,
] as const;
