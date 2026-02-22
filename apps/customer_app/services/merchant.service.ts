/**
 * Merchant service - list nearby merchants, get merchant detail and menu.
 */

import api from "./api";

const MERCHANTS_PREFIX = "/v1/merchants";

export type MerchantSummary = {
  id: string;
  name: string;
  /** Card hero image: COALESCE(banner_url, ads_images[1], gallery_images[1], logo_url). No placeholder. */
  displayImage?: string | null;
  deliveryTime?: string;
  cuisines?: string[];
  isOpen?: boolean;
  /** Distance in km when returned from nearby API */
  distanceKm?: number;
  /** Offer text from DB when available */
  offerText?: string | null;
  /** Avg rating 1–5 when returned from API (e.g. from customer_ratings_given aggregate). */
  avgRating?: number | null;
  /** Total review count for "9.9K+" style display. */
  totalReviews?: number | null;
  /** Next closing time (ISO string or ms) for "Closes in X" countdown. */
  nextCloseAt?: string | number | null;
  /** Next opening time (ISO string or ms) for "Opens in X" when closed. */
  nextOpenAt?: string | number | null;
  /** Backend live_status: OPEN only when is_active, is_available, is_accepting_orders, operational_status=OPEN. */
  liveStatus?: "OPEN" | "CLOSED";
};

export type MenuItem = {
  id: string;
  /** Numeric PK from merchant_menu_items; use this for order payload (menu_item_id). */
  menuItemId?: number;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isVeg: boolean;
  category?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  isPopular?: boolean;
  isRecommended?: boolean;
  prepTimeMinutes?: number;
  discountPercentage?: number;
  hasCustomizations?: boolean;
  hasAddons?: boolean;
  hasVariants?: boolean;
};

export type MenuItemFullConfig = {
  item: {
    id: string;
    menuItemId?: number;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    isVeg: boolean;
    hasCustomizations: boolean;
    hasAddons: boolean;
    hasVariants: boolean;
  };
  variants: Array<{
    id: string;
    name: string;
    type: string | null;
    price: number;
    isDefault: boolean;
    displayOrder: number;
  }>;
  customizations: Array<{
    id: string;
    title: string;
    type: string | null;
    isRequired: boolean;
    minSelection: number;
    maxSelection: number;
    displayOrder: number;
    addons: Array<{
      id: string;
      name: string;
      price: number;
      imageUrl: string | null;
      displayOrder: number;
    }>;
  }>;
};

export type MerchantDetail = MerchantSummary & {
  menu: MenuItem[];
  address?: string;
  /** Carousel images: ads_images + gallery_images, or [banner_url] fallback */
  bannerImages?: string[];
  latitude?: number | null;
  longitude?: number | null;
  operationalStatus?: string | null;
  avgPreparationTimeMinutes?: number | null;
  city?: string | null;
};

export type MerchantAbout = {
  store_name: string;
  store_display_name: string | null;
  full_address: string | null;
  city: string | null;
  state?: string | null;
  postal_code: string | null;
  cuisine_types: string[] | null;
  operational_status: string | null;
  avg_preparation_time_minutes: number | null;
  logo_url: string | null;
  banner_url: string | null;
  is_active: boolean | null;
  created_at?: string | null;
};

/** Response from GET /v1/search (dishes from merchant_menu_items + stores). */
export type SearchApiResponse = {
  dishes: Array<{
    id: string;
    name: string;
    imageKey?: string;
    restaurantName?: string;
    storeId?: string;
    price?: number;
    isVeg?: boolean;
  }>;
  stores: Array<{
    id: string;
    name: string;
    imageUrl?: string | null;
    cuisines?: string[];
  }>;
};

/** Check if current customer has bookmarked a store. Requires auth. */
export async function checkStoreBookmark(storeId: string): Promise<boolean> {
  try {
    const { data } = await api.get<{ saved: boolean }>("/v1/bookmarks/check", { params: { storeId } });
    return data?.saved ?? false;
  } catch {
    return false;
  }
}

/** Toggle store bookmark. Requires auth. */
export async function setStoreBookmark(storeId: string, saved: boolean): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>("/v1/bookmarks", { storeId, saved });
  return data ?? { saved: false };
}

export const merchantService = {
  async getMerchants(params?: {
    lat?: number;
    lng?: number;
    limit?: number;
    offset?: number;
    vegOnly?: boolean;
  }): Promise<MerchantSummary[]> {
    try {
      const { data } = await api.get<{ items: MerchantSummary[] }>(MERCHANTS_PREFIX, {
        params: {
          ...(params?.lat != null && params?.lng != null
            ? { lat: params.lat, lng: params.lng }
            : {}),
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
          veg: params?.vegOnly === true ? "true" : undefined,
        },
      });
      return Array.isArray(data?.items) ? data.items : [];
    } catch {
      return [];
    }
  },

  async getMerchantById(id: string, searchInMenu?: string): Promise<MerchantDetail> {
    const params = searchInMenu?.trim() ? { q: searchInMenu.trim() } : undefined;
    const { data } = await api.get<MerchantDetail>(`${MERCHANTS_PREFIX}/${id}/menu`, { params });
    return data;
  },

  /** About page: store info (full_address, operational_status, etc.) */
  async getMerchantAbout(id: string): Promise<MerchantAbout> {
    const { data } = await api.get<MerchantAbout>(`${MERCHANTS_PREFIX}/${id}/about`);
    return data;
  },

  /** Full config for item customization sheet: item + variants + customizations (with addons). Lazy-loaded on item tap. */
  async getMenuItemFullConfig(
    storeId: string,
    itemId: string
  ): Promise<MenuItemFullConfig | null> {
    try {
      const { data } = await api.get<MenuItemFullConfig>(
        `${MERCHANTS_PREFIX}/${storeId}/menu/items/${itemId}/full-config`
      );
      return data ?? null;
    } catch {
      return null;
    }
  },

  /** Single source of truth for store OPEN/CLOSED. Use when status not in store (e.g. cart/checkout). */
  async getStoreLiveStatus(storeId: string): Promise<"OPEN" | "CLOSED" | null> {
    try {
      const { data } = await api.get<{ liveStatus: "OPEN" | "CLOSED" }>(
        `${MERCHANTS_PREFIX}/${storeId}/live-status`
      );
      return data?.liveStatus ?? null;
    } catch {
      return null;
    }
  },

  /** Report an issue with the restaurant (auth required). */
  async reportRestaurant(
    storeId: string,
    payload: { report_type: string; description?: string | null }
  ): Promise<{ id: number; ok: boolean }> {
    const { data } = await api.post<{ id: number; ok: boolean }>(`${MERCHANTS_PREFIX}/${storeId}/report`, payload);
    return data ?? { id: 0, ok: true };
  },

  /** Search dishes + stores. Pass lat/lng for location-scoped scored search (15km). signal for cancel. */
  async search(params: {
    q: string;
    limit?: number;
    offset?: number;
    lat?: number;
    lng?: number;
    signal?: AbortSignal;
  }): Promise<SearchApiResponse> {
    try {
      const { data } = await api.get<SearchApiResponse>("/v1/search", {
        params: {
          q: params.q.trim(),
          limit: params.limit ?? 30,
          offset: params.offset ?? 0,
          ...(params.lat != null && params.lng != null ? { lat: params.lat, lng: params.lng } : {}),
        },
        signal: params.signal,
      });
      return data ?? { dishes: [], stores: [] };
    } catch {
      return { dishes: [], stores: [] };
    }
  },
};
