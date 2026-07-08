/** Short keys matching GET /v1/app-assets/customer → assets map (same as customer app). */
export const CX = {
  auth: {
    logo: 'auth.logo',
    logoWithName: 'auth.logo_with_name',
  },
  home: {
    brandBanner: 'home.brand_banner',
    serviceFood: 'home.service_food',
    serviceRide: 'home.service_ride',
    serviceParcel: 'home.service_parcel',
    serviceEcommerce: 'home.service_ecommerce',
    serviceVoucher: 'home.service_voucher',
    serviceLocation: 'home.service_location',
    promoOffer: 'home.promo_offer',
    promoOffer2: 'home.promo_offer_2',
    promoRideOffer1: 'home.promo_ride_offer_1',
    promoRideOffer2: 'home.promo_ride_offer_2',
  },
  ride: {
    banner: 'ride.banner',
    bottomBanner: 'ride.bottom_banner',
    bike: 'ride.bike',
    auto: 'ride.auto',
    cab: 'ride.cab',
    cabPremium: 'ride.cab_premium',
  },
} as const
