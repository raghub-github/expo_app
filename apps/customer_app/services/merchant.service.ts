/**
 * Merchant service - list nearby merchants, get merchant detail and menu.
 */

import api from "./api";
import type { MenuDeltaPayload } from "@/lib/merchantMenuDelta";
import {
  getCachedMenuItemFullConfig,
  setCachedMenuItemFullConfig,
} from "@/lib/menu-item-config-cache";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const MERCHANTS_PREFIX = "/v1/merchants";

export type MerchantSummary = {
  id: string;
  name: string;
  /** Card hero image from API (banner / gallery). */
  displayImage?: string | null;
  /** Banner from merchant_stores when API sends it; card falls back if displayImage empty. */
  banner_url?: string | null;
  /** Gallery URLs for card carousel (excluding duplicate of banner). */
  galleryImages?: string[];
  deliveryTime?: string;
  /**
   * Canonical ETA range stamped server-side. Drives every customer-visible
   * "delivery in X mins" copy on the list card so it stays in lock-step with
   * the merchant detail header and checkout summary.
   */
  etaMinMinutes?: number;
  etaMaxMinutes?: number;
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
  /** Personalized rating when the customer has rated this store before. */
  forYouRating?: number | null;
  /** Whether the logged-in customer has submitted a rating for this store. */
  userHasRatedStore?: boolean;
  /** Store avg prep used for ETA — menu items average when available. */
  avgPreparationTimeMinutes?: number | null;
  /** Next closing time (ISO string or ms) for "Closes in X" countdown. */
  nextCloseAt?: string | number | null;
  /** Next opening time (ISO string or ms) for "Opens in X" when closed. */
  nextOpenAt?: string | number | null;
  /** Backend live_status: OPEN only when is_active, is_available, is_accepting_orders, operational_status=OPEN. */
  liveStatus?: "OPEN" | "CLOSED";
  /** Kitchen rush window active — orders may take longer. */
  rushActive?: boolean;
  rushEndsAt?: string | null;
  rushRemainingMinutes?: number | null;
  /**
   * Backend-formatted status label from the shared @gatimitra/store-status engine
   * (e.g. "Closed · opens Thu at 11:00"). Render VERBATIM — never recompute client-side.
   * Identical to what the merchant dashboard / partner site show.
   */
  statusMessage?: string | null;
  statusChip?: string | null;
  /** Delivered food orders for this store (Loved by Customers ranking). */
  completedOrderCount?: number;
  /** Store-level restaurant packaging charge (₹); 0 = none. */
  packagingChargeAmount?: number | null;
};

export type MenuItem = {
  id: string;
  /** Numeric PK from merchant_menu_items; use this for order payload (menu_item_id). */
  menuItemId?: number;
  name: string;
  description?: string;
  price: number;
  /** MRP / base price before item discount (customer-facing, commission-inclusive). */
  basePrice?: number;
  imageUrl?: string;
  isVeg: boolean;
  foodType?: string;
  spiceLevel?: string;
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
  /** False when item is out of stock; omitted means available. */
  inStock?: boolean;
  /**
   * Optional stable row identifier used by the merchant menu list when the
   * same MenuItem appears under multiple sections (recommended + category).
   * Falls back to `id` when absent. Assigned by the list builder, not the API.
   */
  listRowKey?: string;
};

export type MenuItemFullConfig = {
  item: {
    id: string;
    /** Numeric PK from merchant_menu_items (when API sends it). */
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
    sizeValue?: string | null;
    sizeUnit?: string | null;
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
      sizeValue?: string | null;
      sizeUnit?: string | null;
      displayOrder: number;
      isMostOrdered?: boolean;
    }>;
  }>;
};

export type OrderedTogetherPair = {
  id: string;
  item1Id: string;
  item2Id: string;
  item1MenuItemPk: number;
  item2MenuItemPk: number;
  orderCount: number;
  source?: "co_purchase" | "popular_fallback";
};

export type OrderedTogetherRecommendations = {
  pairs: OrderedTogetherPair[];
  byAnchorItemId: Record<string, OrderedTogetherPair[]>;
};

export type MerchantDetail = MerchantSummary & {
  menu: MenuItem[];
  /** Epoch ms fingerprint from backend — drives delta sync. */
  menuVersion?: number;
  etag?: string;
  /** Hero banner from GET /menu (store banner_url). */
  imageUrl?: string | null;
  address?: string;
  /** Carousel images: gallery_images, or [banner_url] fallback */
  bannerImages?: string[];
  latitude?: number | null;
  longitude?: number | null;
  operationalStatus?: string | null;
  avgPreparationTimeMinutes?: number | null;
  city?: string | null;
};

export type NearbyStore = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_km: number;
  duration_min: number | null;
  is_open: boolean;
};

export type MerchantAbout = {
  store_name: string;
  store_display_name: string | null;
  legal_name?: string | null;
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
  gst_number?: string | null;
  fssai_number?: string | null;
  store_phone?: string | null;
  is_cloud_kitchen?: boolean;
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

function pickFirstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return null;
}

function pickOpenAtValue(...candidates: unknown[]): string | number | null {
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}

function normalizeMerchantListItem(item: MerchantSummary & Record<string, unknown>): MerchantSummary {
  const bannerRaw = pickFirstString(item.banner_url, item.bannerUrl);
  const logoRaw = pickFirstString(
    (item as Record<string, unknown>).logo_url,
    (item as Record<string, unknown>).logoUrl
  );
  const chosen = pickFirstString(bannerRaw, item.displayImage, item.imageUrl, logoRaw);
  const bannerAbs = toAbsoluteImageUrl(bannerRaw) ?? bannerRaw;
  const rawGallery = Array.isArray(item.galleryImages)
    ? item.galleryImages
    : Array.isArray(item.gallery_images)
      ? (item.gallery_images as string[])
      : [];
  const galleryImages = rawGallery
    .map((u) => (typeof u === "string" ? toAbsoluteImageUrl(u) ?? u.trim() : null))
    .filter((u): u is string => Boolean(u))
    .filter((u) => u !== bannerAbs);
  return {
    ...item,
    banner_url: bannerAbs ?? bannerRaw,
    displayImage: toAbsoluteImageUrl(chosen),
    galleryImages: galleryImages.length > 0 ? galleryImages : undefined,
    nextOpenAt: pickOpenAtValue(
      item.nextOpenAt,
      (item as Record<string, unknown>).nextOpenAt,
      (item as Record<string, unknown>).next_open_at
    ),
    nextCloseAt: pickOpenAtValue(
      item.nextCloseAt,
      (item as Record<string, unknown>).nextCloseAt,
      (item as Record<string, unknown>).next_close_at
    ),
    statusMessage:
      ((item as Record<string, unknown>).statusMessage as string | null | undefined) ??
      ((item as Record<string, unknown>).status_message as string | null | undefined) ??
      null,
    statusChip:
      ((item as Record<string, unknown>).statusChip as string | null | undefined) ??
      ((item as Record<string, unknown>).status_chip as string | null | undefined) ??
      null,
    completedOrderCount: (() => {
      const raw =
        item.completedOrderCount ??
        (item as Record<string, unknown>).completedOrderCount ??
        (item as Record<string, unknown>).completed_order_count;
      const n = Number(raw ?? 0);
      return Number.isFinite(n) ? n : 0;
    })(),
    avgPreparationTimeMinutes: (() => {
      const raw =
        item.avgPreparationTimeMinutes ??
        (item as Record<string, unknown>).avg_preparation_time_minutes;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    etaMinMinutes: (() => {
      const raw = item.etaMinMinutes ?? (item as Record<string, unknown>).eta_min_minutes;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : item.etaMinMinutes;
    })(),
    etaMaxMinutes: (() => {
      const raw = item.etaMaxMinutes ?? (item as Record<string, unknown>).eta_max_minutes;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : item.etaMaxMinutes;
    })(),
    avgRating: (() => {
      const raw = item.avgRating ?? (item as Record<string, unknown>).avg_rating;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
    totalReviews: (() => {
      const raw = item.totalReviews ?? (item as Record<string, unknown>).total_reviews;
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    packagingChargeAmount: (() => {
      const raw =
        item.packagingChargeAmount ??
        (item as Record<string, unknown>).packagingChargeAmount ??
        (item as Record<string, unknown>).packaging_charge_amount;
      if (raw == null || raw === "") return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
    liveStatus: (() => {
      const raw =
        item.liveStatus ??
        (item as Record<string, unknown>).liveStatus ??
        (item as Record<string, unknown>).live_status;
      const normalized = (raw ?? "").toString().trim().toUpperCase();
      if (normalized === "OPEN" || normalized === "CLOSED") {
        return normalized as "OPEN" | "CLOSED";
      }
      return undefined;
    })(),
  };
}

/** Detail /menu response: fix relative URLs and localhost so header BannerCarousel can load on device. */
function normalizeMerchantDetail(data: MerchantDetail): MerchantDetail {
  const r = data as MerchantDetail & Record<string, unknown>;
  const imageUrlRaw = pickFirstString(data.imageUrl, r.image_url);
  const displayRaw = pickFirstString(data.displayImage, r.display_image);
  const bannerRaw = pickFirstString(data.banner_url, r.banner_url);

  const rawBannerImages = Array.isArray(data.bannerImages)
    ? data.bannerImages
    : Array.isArray(r.banner_images)
      ? (r.banner_images as string[])
      : [];

  const hero = pickFirstString(imageUrlRaw, displayRaw, bannerRaw);
  const resolvedHero = toAbsoluteImageUrl(hero);

  const resolvedList = rawBannerImages
    .map((u) => (typeof u === "string" ? toAbsoluteImageUrl(u) : null))
    .filter((u): u is string => Boolean(u));

  const seen = new Set<string>();
  const mergedBanner: string[] = [];
  const pushUrl = (u: string | null | undefined) => {
    if (!u) return;
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    mergedBanner.push(t);
  };
  pushUrl(resolvedHero);
  for (const u of resolvedList) pushUrl(u);

  const bannerImages: string[] | undefined = mergedBanner.length > 0 ? mergedBanner : undefined;

  const menu = (data.menu ?? []).map((m) => ({
    ...m,
    imageUrl: toAbsoluteImageUrl(m.imageUrl ?? null) ?? m.imageUrl,
  }));

  const avgRatingRaw = data.avgRating ?? r.avg_rating ?? r.avgRating;
  const totalReviewsRaw = data.totalReviews ?? r.total_reviews ?? r.totalReviews;
  const avgRating =
    avgRatingRaw != null && avgRatingRaw !== "" && Number.isFinite(Number(avgRatingRaw))
      ? Number(avgRatingRaw)
      : null;
  const totalReviews =
    totalReviewsRaw != null && Number.isFinite(Number(totalReviewsRaw))
      ? Number(totalReviewsRaw)
      : null;

  const forYouRatingRaw = data.forYouRating ?? r.for_you_rating ?? r.forYouRating;
  const forYouRating =
    forYouRatingRaw != null && Number.isFinite(Number(forYouRatingRaw))
      ? Number(forYouRatingRaw)
      : null;
  const userHasRatedStoreRaw = data.userHasRatedStore ?? r.user_has_rated_store ?? r.userHasRatedStore;
  const userHasRatedStore = userHasRatedStoreRaw === true;

  return {
    ...data,
    imageUrl: resolvedHero ?? undefined,
    displayImage: resolvedHero ?? undefined,
    banner_url: toAbsoluteImageUrl(bannerRaw) ?? bannerRaw ?? data.banner_url,
    bannerImages,
    menu,
    avgRating,
    totalReviews,
    forYouRating,
    userHasRatedStore,
    liveStatus:
      (() => {
        const raw = data.liveStatus ?? r.liveStatus ?? r.live_status;
        const normalized = (raw ?? "").toString().trim().toUpperCase();
        if (normalized === "OPEN" || normalized === "CLOSED") {
          return normalized as "OPEN" | "CLOSED";
        }
        return undefined;
      })(),
    nextOpenAt: pickOpenAtValue(data.nextOpenAt, r.nextOpenAt, r.next_open_at),
    nextCloseAt: pickOpenAtValue(data.nextCloseAt, r.nextCloseAt, r.next_close_at),
    rushActive:
      data.rushActive === true ||
      r.rushActive === true ||
      r.rush_active === true,
    rushEndsAt: (() => {
      const raw = data.rushEndsAt ?? r.rushEndsAt ?? r.rush_ends_at;
      return raw != null && String(raw).trim() ? String(raw) : null;
    })(),
    rushRemainingMinutes: (() => {
      const raw = data.rushRemainingMinutes ?? r.rushRemainingMinutes ?? r.rush_remaining_minutes;
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    })(),
    menuVersion:
      data.menuVersion != null && Number.isFinite(Number(data.menuVersion))
        ? Number(data.menuVersion)
        : undefined,
    etag: typeof data.etag === "string" ? data.etag : undefined,
  };
}

/** Check if current customer has bookmarked a store. Requires auth. */
export async function checkStoreBookmark(storeId: string): Promise<boolean> {
  try {
    const { data } = await api.get<{ saved: boolean }>("/v1/bookmarks/check", { params: { storeId } });
    return data?.saved ?? false;
  } catch {
    return false;
  }
}

/** All bookmarked store public ids for the logged-in customer. */
export async function getStoreBookmarks(): Promise<string[]> {
  // NOTE: do NOT swallow errors here. A silent `catch { return [] }` made an API
  // failure indistinguishable from "no bookmarks", so the Collections screen showed
  // a false empty state and React Query never retried. Let the error propagate.
  const { data } = await api.get<{ storeIds: string[] }>("/v1/bookmarks");
  const storeIds = Array.isArray(data?.storeIds) ? data.storeIds : [];
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[collections] getStoreBookmarks ok", { count: storeIds.length });
  }
  return storeIds;
}

/** Toggle store bookmark. Requires auth. */
export async function setStoreBookmark(storeId: string, saved: boolean): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>("/v1/bookmarks", { storeId, saved });
  return data ?? { saved: false };
}

export type BookmarkedMenuItem = {
  storeId: string;
  menuItemId: number;
  itemId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  isVeg: boolean;
  storeName: string;
};

/** All bookmarked menu items for the logged-in customer. */
export async function getMenuItemBookmarks(storeId?: string): Promise<BookmarkedMenuItem[]> {
  // Do NOT swallow errors (see getStoreBookmarks) — a failed request must not read
  // as "no saved dishes". Let it propagate so React Query surfaces/retries it.
  const { data } = await api.get<{ items: BookmarkedMenuItem[] }>("/v1/bookmarks/menu-items", {
    params: storeId ? { storeId } : undefined,
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[collections] getMenuItemBookmarks ok", { storeId: storeId ?? null, count: items.length });
  }
  return items;
}

/** Toggle menu item bookmark. Requires auth. */
export async function setMenuItemBookmark(
  storeId: string,
  menuItemId: number,
  saved: boolean
): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>("/v1/bookmarks/menu-items", {
    storeId,
    menuItemId,
    saved,
  });
  return data ?? { saved: false };
}

export const merchantService = {
  async getMerchants(params?: {
    lat?: number;
    lng?: number;
    limit?: number;
    offset?: number;
    vegOnly?: boolean;
    /** air = straight-line, road = backend routing engine (Mapbox/OSRM). */
    distanceMode?: "air" | "road";
  }): Promise<MerchantSummary[]> {
    try {
      const { data } = await api.get<{ items: MerchantSummary[] }>(MERCHANTS_PREFIX, {
        params: {
          ...(params?.lat != null && params?.lng != null
            ? { lat: params.lat, lng: params.lng }
            : {}),
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
          distanceMode: params?.distanceMode,
          veg: params?.vegOnly === true ? "true" : undefined,
        },
      });
      const list = Array.isArray(data?.items) ? data.items : [];
      return list.map((item) =>
        normalizeMerchantListItem(item as MerchantSummary & Record<string, unknown>)
      );
    } catch {
      return [];
    }
  },

  async getNearbyStores(params: {
    lat: number;
    lng: number;
    maxDistanceKm?: number;
    mapboxLimit?: number;
  }): Promise<NearbyStore[]> {
    try {
      const { data } = await api.get<NearbyStore[]>("/v1/stores/nearby", {
        params: {
          lat: params.lat,
          lng: params.lng,
          maxDistanceKm: params.maxDistanceKm ?? 10,
          mapboxLimit: params.mapboxLimit ?? 15,
        },
      });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  async getMenuVersion(id: string): Promise<{ menuVersion: number; etag: string } | null> {
    try {
      const { data } = await api.get<{ menuVersion: number; etag: string }>(
        `${MERCHANTS_PREFIX}/${id}/menu/version`
      );
      if (data?.menuVersion == null) return null;
      return { menuVersion: Number(data.menuVersion), etag: String(data.etag ?? "") };
    } catch {
      return null;
    }
  },

  async getMenuDelta(id: string, sinceVersion: number): Promise<MenuDeltaPayload | null> {
    try {
      const { data } = await api.get<MenuDeltaPayload>(
        `${MERCHANTS_PREFIX}/${id}/menu/delta`,
        { params: { sinceVersion } }
      );
      return data ?? null;
    } catch {
      return null;
    }
  },

  async getMerchantById(
    id: string,
    searchInMenu?: string,
    options?: { ifNoneMatch?: string }
  ): Promise<MerchantDetail | null> {
    const params = searchInMenu?.trim() ? { q: searchInMenu.trim() } : undefined;
    const headers =
      options?.ifNoneMatch && !searchInMenu?.trim()
        ? { "If-None-Match": options.ifNoneMatch }
        : undefined;
    const response = await api.get<MerchantDetail>(`${MERCHANTS_PREFIX}/${id}/menu`, {
      params,
      headers,
      validateStatus: (status) => status === 200 || status === 304,
    });
    if (response.status === 304) return null;
    return normalizeMerchantDetail(response.data);
  },

  /** About page: store info (full_address, operational_status, etc.) */
  async getMerchantAbout(id: string): Promise<MerchantAbout> {
    const { data } = await api.get<MerchantAbout>(`${MERCHANTS_PREFIX}/${id}/about`);
    return data;
  },

  /** Full config for item customization sheet: item + variants + customizations (with addons). Lazy-loaded on item tap. */
  async getMenuItemFullConfig(
    storeId: string,
    itemId: string,
    options?: { skipMemoryCache?: boolean }
  ): Promise<MenuItemFullConfig | null> {
    if (!options?.skipMemoryCache) {
      const cached = getCachedMenuItemFullConfig(storeId, itemId);
      if (cached) return cached;
    }
    try {
      const { data } = await api.get<MenuItemFullConfig>(
        `${MERCHANTS_PREFIX}/${storeId}/menu/items/${itemId}/full-config`
      );
      if (data) setCachedMenuItemFullConfig(storeId, itemId, data);
      return data ?? null;
    } catch {
      return null;
    }
  },

  /** Pairs frequently ordered together at this store (from order history + popular fallback). */
  async getOrderedTogetherPairs(
    storeId: string,
    opts?: { anchorMenuItemId?: string; limit?: number }
  ): Promise<OrderedTogetherPair[]> {
    try {
      const params = new URLSearchParams();
      if (opts?.anchorMenuItemId) params.set("anchorMenuItemId", opts.anchorMenuItemId);
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      const qs = params.toString();
      const { data } = await api.get<{ pairs: OrderedTogetherPair[] }>(
        `${MERCHANTS_PREFIX}/${storeId}/menu/ordered-together${qs ? `?${qs}` : ""}`
      );
      return Array.isArray(data?.pairs) ? data.pairs : [];
    } catch {
      return [];
    }
  },

  /** Store-level pairs plus per-anchor recommendations for menu UI. */
  async getOrderedTogetherRecommendations(
    storeId: string
  ): Promise<OrderedTogetherRecommendations> {
    try {
      const { data } = await api.get<OrderedTogetherRecommendations>(
        `${MERCHANTS_PREFIX}/${storeId}/menu/ordered-together/recommendations`
      );
      return {
        pairs: Array.isArray(data?.pairs) ? data.pairs : [],
        byAnchorItemId: data?.byAnchorItemId ?? {},
      };
    } catch {
      return { pairs: [], byAnchorItemId: {} };
    }
  },

  /** Single source of truth for store OPEN/CLOSED + schedule hints + rush. */
  async getStoreLiveStatusSnapshot(storeId: string): Promise<{
    liveStatus: "OPEN" | "CLOSED";
    nextOpenAt: string | null;
    nextCloseAt: string | null;
    rushActive: boolean;
    rushEndsAt: string | null;
    rushRemainingMinutes: number | null;
  } | null> {
    try {
      const { data } = await api.get<{
        liveStatus: "OPEN" | "CLOSED";
        nextOpenAt?: string | null;
        nextCloseAt?: string | null;
        rushActive?: boolean;
        rushEndsAt?: string | null;
        rushRemainingMinutes?: number | null;
      }>(`${MERCHANTS_PREFIX}/${storeId}/live-status`);
      if (!data?.liveStatus) return null;
      return {
        liveStatus: data.liveStatus,
        nextOpenAt: data.nextOpenAt ?? null,
        nextCloseAt: data.nextCloseAt ?? null,
        rushActive: data.rushActive === true,
        rushEndsAt: data.rushEndsAt ?? null,
        rushRemainingMinutes:
          data.rushRemainingMinutes != null && Number.isFinite(Number(data.rushRemainingMinutes))
            ? Number(data.rushRemainingMinutes)
            : null,
      };
    } catch {
      return null;
    }
  },

  /** Single source of truth for store OPEN/CLOSED. Use when status not in store (e.g. cart/checkout). */
  async getStoreLiveStatus(storeId: string): Promise<"OPEN" | "CLOSED" | null> {
    const snapshot = await this.getStoreLiveStatusSnapshot(storeId);
    return snapshot?.liveStatus ?? null;
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
    vegOnly?: boolean;
    signal?: AbortSignal;
  }): Promise<SearchApiResponse> {
    try {
      const { data } = await api.get<SearchApiResponse>("/v1/search", {
        params: {
          q: params.q.trim(),
          limit: params.limit ?? 30,
          offset: params.offset ?? 0,
          veg: params.vegOnly === true ? "true" : undefined,
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
