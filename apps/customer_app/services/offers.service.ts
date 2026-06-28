/**
 * Offer discovery service — fetches live offers from backend.
 *
 * Two endpoints:
 *  - getStoreOffers()   → merchant + platform offers for a specific store
 *  - getFeaturedOffers() → platform-wide offers for home screen banner
 */

import api from "./api";

const OFFERS_PREFIX = "/v1/offers";

export type MerchantOfferItem = {
  id: number;
  offer_id: string | null;
  title: string;
  offer_type: string;
  coupon_code: string | null;
  auto_apply: boolean;
  label: string;
  sub_label: string;
  discount_percentage: number | null;
  discount_value: number | null;
  max_discount_amount: number | null;
  min_order_amount: number | null;
};

export type PlatformOfferItem = {
  id: number;
  name: string | null;
  offer_kind: string;
  label: string;
  sub_label: string;
  is_geo_bound: boolean;
};

export type StoreOffersResponse = {
  merchant_offers: MerchantOfferItem[];
  platform_offers: PlatformOfferItem[];
};

export type HomeBannerOffer = {
  id: string;
  store_id: string;
  store_name: string | null;
  title: string;
  sub: string;
  kind: "merchant" | "platform";
  source_offer_id: number;
  offer_type?: string | null;
  coupon_code?: string | null;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  discount_percentage?: number | null;
  discount_value?: number | null;
  offer_image_url?: string | null;
  /** ISO timestamp — offer expires at this time. */
  valid_till?: string | null;
};

export type FeaturedOffersResponse = {
  offers: HomeBannerOffer[];
};

export const offersService = {
  async getStoreOffers(params: {
    storeId: string;
    pincode?: string | null;
    state?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    serviceType?: "FOOD" | "PARCEL" | "RIDE";
  }): Promise<StoreOffersResponse> {
    const query: Record<string, string | number> = {
      serviceType: params.serviceType ?? "FOOD",
    };
    if (params.pincode) query.pincode = params.pincode;
    if (params.state) query.state = params.state;
    if (params.city) query.city = params.city;
    if (params.lat != null && Number.isFinite(params.lat)) query.lat = params.lat;
    if (params.lng != null && Number.isFinite(params.lng)) query.lng = params.lng;
    const { data } = await api.get<StoreOffersResponse>(
      `${OFFERS_PREFIX}/store/${encodeURIComponent(params.storeId)}`,
      { params: query }
    );
    return data;
  },

  async getFeaturedOffers(params?: {
    pincode?: string | null;
    state?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    serviceType?: "FOOD" | "PARCEL" | "RIDE";
    limit?: number;
  }): Promise<FeaturedOffersResponse> {
    const query: Record<string, string | number> = {
      serviceType: params?.serviceType ?? "FOOD",
      limit: Math.min(Math.max(1, params?.limit ?? 5), 12),
    };
    if (params?.pincode) query.pincode = params.pincode;
    if (params?.state) query.state = params.state;
    if (params?.city) query.city = params.city;
    if (params?.lat != null && Number.isFinite(params.lat)) query.lat = params.lat;
    if (params?.lng != null && Number.isFinite(params.lng)) query.lng = params.lng;
    const { data } = await api.get<FeaturedOffersResponse>(`${OFFERS_PREFIX}/featured`, {
      params: query,
    });
    return data;
  },
};
