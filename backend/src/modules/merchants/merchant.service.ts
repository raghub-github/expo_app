import { getSupabase } from "../../lib/supabase.js";
import { getEnv } from "../../config/env.js";
import { getRoute, haversineDistanceKm } from "../distance/distance.service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import type {
  MerchantMenuItemRow,
  MerchantStoreRow,
  NearbyStoreRow,
  MerchantMenuCategoryRow,
  MenuItemVariantRow,
  MenuItemCustomizationRow,
  MenuItemAddonRow,
} from "./merchant.types.js";
import { computeLiveStatus } from "./merchant.types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SEARCH_LIMIT = 30;
/** Non-negotiable: never show stores beyond 15 km. */
const MAX_RADIUS_KM = 15;
const ROUGH_RADIUS_KM = 12;
const FINAL_MAX_ROAD_DISTANCE_KM = 10;
const MAX_MAPBOX_CANDIDATES = 15;
const MAPBOX_CONCURRENCY = 5;
const MAPBOX_CACHE_TTL_MS = 10 * 60 * 1000;

type NearbyStoreBase = {
  id: number;
  store_id: string;
  store_name: string;
  store_display_name: string | null;
  full_address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status: string | null;
  is_active: boolean | null;
  is_available: boolean | null;
  is_accepting_orders: boolean | null;
  operational_status: string | null;
  live_status?: string | null;
};

export type NearbyStoreListingItem = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_km: number;
  duration_min: number | null;
  is_open: boolean;
};

const mapboxDistanceCache = new Map<
  string,
  { distanceKm: number; durationMin: number | null; expiresAt: number }
>();

function mapboxCacheKey(userLat: number, userLng: number, storeId: number): string {
  return `${userLat.toFixed(5)}_${userLng.toFixed(5)}_${storeId}`;
}

function readMapboxCache(
  key: string
): { distanceKm: number; durationMin: number | null } | null {
  const entry = mapboxDistanceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mapboxDistanceCache.delete(key);
    return null;
  }
  return { distanceKm: entry.distanceKm, durationMin: entry.durationMin };
}

function writeMapboxCache(
  key: string,
  value: { distanceKm: number; durationMin: number | null }
): void {
  mapboxDistanceCache.set(key, {
    ...value,
    expiresAt: Date.now() + MAPBOX_CACHE_TTL_MS,
  });
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results: R[] = new Array(items.length);
  let index = 0;

  async function run(): Promise<void> {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: safeLimit }, () => run()));
  return results;
}

async function fetchDrivingDistanceKm(
  userLat: number,
  userLng: number,
  storeLat: number,
  storeLng: number
): Promise<{ distanceKm: number; durationMin: number | null }> {
  const env = getEnv();
  const route = await getRoute({
    origin: { lat: userLat, lng: userLng },
    destination: { lat: storeLat, lng: storeLng },
    profile: "driving",
    mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
    osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
  });
  return { distanceKm: route.distanceKm, durationMin: route.etaMinutes };
}

export async function listNearbyStoresByRoadDistance(params: {
  lat: number;
  lng: number;
  maxRoadDistanceKm?: number;
  mapboxLimit?: number;
}): Promise<{ items: NearbyStoreListingItem[]; mapboxFailures: number }> {
  if (!validCoord(params.lat, params.lng)) return { items: [], mapboxFailures: 0 };

  const supabase = getSupabase();
  const user = { lat: params.lat, lng: params.lng };
  const maxRoadDistanceKm = Math.min(
    FINAL_MAX_ROAD_DISTANCE_KM,
    Math.max(1, params.maxRoadDistanceKm ?? FINAL_MAX_ROAD_DISTANCE_KM)
  );
  const mapboxLimit = Math.min(
    MAX_MAPBOX_CANDIDATES,
    Math.max(1, params.mapboxLimit ?? MAX_MAPBOX_CANDIDATES)
  );

  const { data, error } = await supabase
    .from("merchant_stores")
    .select(
      "id, store_id, store_name, store_display_name, full_address, latitude, longitude, status, is_active, is_available, is_accepting_orders, operational_status, live_status"
    )
    .eq("status", "ACTIVE")
    .eq("is_active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) throw error;

  const baseRows = (data ?? []) as NearbyStoreBase[];
  const roughCandidates = baseRows
    .map((row) => {
      const lat = toNumber(row.latitude);
      const lng = toNumber(row.longitude);
      if (lat == null || lng == null) return null;
      const roughKm = haversineDistanceKm(user, { lat, lng });
      return { row, lat, lng, roughKm };
    })
    .filter((x): x is { row: NearbyStoreBase; lat: number; lng: number; roughKm: number } => Boolean(x))
    .filter((x) => x.roughKm <= ROUGH_RADIUS_KM)
    .sort((a, b) => a.roughKm - b.roughKm)
    .slice(0, mapboxLimit);

  if (roughCandidates.length === 0) return { items: [], mapboxFailures: 0 };

  const enriched = await mapWithConcurrency(roughCandidates, MAPBOX_CONCURRENCY, async (candidate) => {
    const cacheKey = mapboxCacheKey(user.lat, user.lng, candidate.row.id);
    const cached = readMapboxCache(cacheKey);
    if (cached) {
      return {
        ...candidate,
        distanceKm: cached.distanceKm,
        durationMin: cached.durationMin,
        source: "cache" as const,
      };
    }

    try {
      const route = await fetchDrivingDistanceKm(
        user.lat,
        user.lng,
        candidate.lat,
        candidate.lng
      );
      writeMapboxCache(cacheKey, route);
      return {
        ...candidate,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        source: "mapbox" as const,
      };
    } catch {
      return {
        ...candidate,
        distanceKm: null,
        durationMin: null,
        source: "error" as const,
      };
    }
  });

  const mapboxFailures = enriched.filter((x) => x.source === "error").length;

  const items: NearbyStoreListingItem[] = enriched
    .filter((x) => x.distanceKm != null && x.distanceKm <= maxRoadDistanceKm)
    .map((x) => {
      const raw = typeof x.row.live_status === "string" ? x.row.live_status.trim().toUpperCase() : "";
      const live = raw === "OPEN" || raw === "CLOSED"
        ? raw
        : computeLiveStatus({
            is_active: x.row.is_active,
            is_available: x.row.is_available,
            is_accepting_orders: x.row.is_accepting_orders,
            operational_status: x.row.operational_status,
          });
      return {
        id: x.row.store_id,
        name: x.row.store_display_name ?? x.row.store_name,
        address: x.row.full_address ?? "",
        lat: x.lat,
        lng: x.lng,
        distance_km: Number((x.distanceKm ?? 0).toFixed(2)),
        duration_min: x.durationMin,
        is_open: live === "OPEN",
      };
    })
    .filter((x) => x.is_open)
    .sort((a, b) => a.distance_km - b.distance_km);

  return { items, mapboxFailures };
}

function clampLimit(limit: number): number {
  return Math.min(MAX_LIMIT, Math.max(1, limit));
}

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Nearby stores by user location (Haversine at DB). Requires migration 0050.
 * Strict: coords validated, radius capped at 15 km, veg_mode filter at DB.
 * Cache key: nearby:{lat.toFixed(4)}:{lng.toFixed(4)}:veg (invalidate on location/veg change).
 */
export async function listStoresNearby(params: {
  lat: number;
  lng: number;
  radius_km?: number;
  limit?: number;
  veg_mode?: boolean;
}): Promise<{ items: NearbyStoreRow[] }> {
  if (!validCoord(params.lat, params.lng)) {
    return { items: [] };
  }

  const supabase = getSupabase();
  const limit = clampLimit(params.limit ?? 50);
  const radius_km = Math.min(MAX_RADIUS_KM, Math.max(1, params.radius_km ?? MAX_RADIUS_KM));
  const veg_mode = Boolean(params.veg_mode);

  const { data, error } = await supabase.rpc("get_nearby_merchant_stores", {
    user_lat: params.lat,
    user_lng: params.lng,
    radius_km,
    max_limit: limit,
    veg_mode,
  });

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    const missingFunction = error.code === "42883";
    const removedLogoColumn =
      error.code === "42703" || message.includes("logo_url") || message.includes("column ms.logo_url");
    if (missingFunction || removedLogoColumn) {
      // Fallback path when DB RPC is missing/outdated (e.g., ms.logo_url removed).
      const { data: stores, error: storesError } = await supabase
        .from("merchant_stores")
        .select(
          "id, store_id, store_name, store_display_name, store_description, full_address, postal_code, banner_url, gallery_images, cuisine_types, city, latitude, longitude, operational_status, avg_preparation_time_minutes, is_active, is_available, is_accepting_orders, status, live_status, parent_id"
        )
        .eq("status", "ACTIVE")
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (storesError) throw storesError;

      const user = { lat: params.lat, lng: params.lng };
      const items = ((stores ?? []) as MerchantStoreRow[])
        .map((s) => {
          const lat = toNumber(s.latitude);
          const lng = toNumber(s.longitude);
          if (lat == null || lng == null) return null;
          const distance_km = haversineDistanceKm(user, { lat, lng });
          const live =
            s.live_status === "OPEN" || s.live_status === "CLOSED"
              ? s.live_status
              : computeLiveStatus({
                  is_active: s.is_active,
                  is_available: s.is_available,
                  is_accepting_orders: s.is_accepting_orders,
                  operational_status: s.operational_status,
                });
          if (distance_km > radius_km || live !== "OPEN") return null;
          return {
            ...s,
            distance_km: Number(distance_km.toFixed(2)),
            display_image: s.banner_url ?? null,
          } as NearbyStoreRow;
        })
        .filter((x): x is NearbyStoreRow => Boolean(x))
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, limit);

      return { items };
    }
    throw error;
  }
  return { items: (data ?? []) as NearbyStoreRow[] };
}

/**
 * List stores: with lat/lng uses nearby RPC (strict 15 km, veg filter at DB).
 * Without valid lat/lng returns empty — no frontend geo filtering; all filtering at DB/API.
 */
export async function listStores(params: {
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
  veg_mode?: boolean;
  /** air (default): DB/RPC straight-line; road: routing engine via Mapbox/OSRM */
  distanceMode?: "air" | "road";
}): Promise<{ items: MerchantStoreRow[] | NearbyStoreRow[] }> {
  if (
    params.lat != null &&
    params.lng != null &&
    validCoord(params.lat, params.lng)
  ) {
    const { items } = await listStoresNearby({
      lat: params.lat,
      lng: params.lng,
      radius_km: MAX_RADIUS_KM,
      limit: params.limit ?? DEFAULT_LIMIT,
      veg_mode: params.veg_mode,
    });
    if (params.distanceMode === "road") {
      const env = getEnv();
      const withRoad = await enrichNearbyWithRoadDistance({
        userLat: params.lat,
        userLng: params.lng,
        items,
        mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
        osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
      });
      return { items: withRoad };
    }
    return { items };
  }

  return { items: [] };
}

async function enrichNearbyWithRoadDistance(params: {
  userLat: number;
  userLng: number;
  items: NearbyStoreRow[];
  mapboxToken?: string;
  osrmBaseUrl?: string;
}): Promise<NearbyStoreRow[]> {
  if (!validCoord(params.userLat, params.userLng)) return params.items;
  const token = params.mapboxToken;
  const osrm = params.osrmBaseUrl;

  const enriched = await mapWithConcurrency(params.items, MAPBOX_CONCURRENCY, async (s) => {
    const lat = toNumber(s.latitude);
    const lng = toNumber(s.longitude);
    if (lat == null || lng == null) return s;
    try {
      const route = await getRoute({
        origin: { lat: params.userLat, lng: params.userLng },
        destination: { lat, lng },
        profile: "driving",
        mapboxToken: token,
        osrmBaseUrl: osrm,
      });
      return {
        ...s,
        distance_km: Number((route.distanceKm ?? 0).toFixed(2)),
      };
    } catch {
      return s;
    }
  });

  return [...enriched].sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
}

/** Test-only export: avoids calling Supabase in unit tests. */
export const __test__enrichNearbyWithRoadDistance = enrichNearbyWithRoadDistance;

/**
 * Get store by string store_id (public id). Includes banner fields and operational data.
 */
export async function getStoreByStoreId(storeId: string): Promise<MerchantStoreRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("id, store_id, store_name, store_display_name, store_description, full_address, postal_code, banner_url, gallery_images, cuisine_types, city, latitude, longitude, operational_status, avg_preparation_time_minutes, is_active, is_available, is_accepting_orders, status, created_at, parent_id, packaging_charge_amount, delivery_charge_per_km, delivery_radius_km")
    .eq("store_id", storeId)
    .single();
  if (error || !data) return null;
  return data as MerchantStoreRow;
}

/** For order creation: fetch parent_id, address, coordinates, and accepting status by numeric store id. Never trust frontend for these. */
/** Packaging + per-km delivery rates for billing engine (Supabase source of truth). */
export async function getStoreBillingRates(
  merchantStoreId: number
): Promise<{ packagingChargeAmount: number; deliveryChargePerKm: number } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("packaging_charge_amount, delivery_charge_per_km")
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as {
    packaging_charge_amount?: number | string | null;
    delivery_charge_per_km?: number | string | null;
  };
  const pkg = row.packaging_charge_amount != null ? Number(row.packaging_charge_amount) : 0;
  const perKm = row.delivery_charge_per_km != null ? Number(row.delivery_charge_per_km) : 0;
  return {
    packagingChargeAmount: Number.isFinite(pkg) && pkg > 0 ? pkg : 0,
    deliveryChargePerKm: Number.isFinite(perKm) && perKm > 0 ? perKm : 0,
  };
}

export type StoreDetailsForFoodOrder = {
  parentId: number | null;
  storeName: string;
  storeDisplayName: string | null;
  storePhones: string[];
  avgPreparationTimeMinutes: number | null;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  is_accepting_orders: boolean;
  isPureVeg: boolean;
};

export async function getStoreDetailsForFoodOrder(
  merchantStoreId: number
): Promise<StoreDetailsForFoodOrder | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select(
      "parent_id, store_name, store_display_name, store_phones, avg_preparation_time_minutes, full_address, latitude, longitude, is_accepting_orders, is_pure_veg"
    )
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as {
    parent_id?: number | null;
    store_name?: string;
    store_display_name?: string | null;
    store_phones?: string[] | null;
    avg_preparation_time_minutes?: number | null;
    full_address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    is_accepting_orders?: boolean | null;
    is_pure_veg?: boolean | null;
  };
  const phones = Array.isArray(row.store_phones)
    ? row.store_phones.map((p) => String(p).trim()).filter(Boolean)
    : [];
  return {
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    storeName: String(row.store_name ?? "Restaurant"),
    storeDisplayName: row.store_display_name ?? null,
    storePhones: phones,
    avgPreparationTimeMinutes:
      row.avg_preparation_time_minutes != null ? Number(row.avg_preparation_time_minutes) : null,
    fullAddress: row.full_address ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    is_accepting_orders: row.is_accepting_orders === true,
    isPureVeg: row.is_pure_veg === true,
  };
}

export async function getStoreByIdForOrder(
  merchantStoreId: number
): Promise<{ parentId: number | null; fullAddress: string | null; latitude: number | null; longitude: number | null; is_accepting_orders: boolean } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("parent_id, full_address, latitude, longitude, is_accepting_orders")
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as { parent_id?: number | null; full_address?: string | null; latitude?: number | string | null; longitude?: number | string | null; is_accepting_orders?: boolean | null };
  return {
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    fullAddress: row.full_address ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    is_accepting_orders: row.is_accepting_orders === true,
  };
}

/**
 * Single source of truth for store operational status. Used by all UIs (list, detail, cart, checkout, group order).
 * Returns OPEN only when is_active, is_available, is_accepting_orders true and operational_status = 'OPEN'.
 */
export async function getStoreLiveStatus(storeId: string): Promise<"OPEN" | "CLOSED" | null> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;
  const { computeLiveStatus } = await import("./merchant.types.js");
  const raw = (store as { live_status?: string | null }).live_status;
  if (raw === "OPEN" || raw === "CLOSED") return raw;
  return computeLiveStatus({
    is_active: store.is_active,
    is_available: store.is_available,
    is_accepting_orders: store.is_accepting_orders,
    operational_status: store.operational_status,
  });
}

/**
 * Get menu items for a store (by string store_id).
 * Only is_active = true and in_stock = true. Groups by category_id using merchant_menu_categories.
 * If searchQ is provided, filters items by item_name ILIKE %searchQ%.
 */
export async function getMenuByStoreId(
  storeId: string,
  searchQ?: string
): Promise<{
  store: MerchantStoreRow | null;
  items: (MerchantMenuItemRow & { category_name: string | null })[];
}> {
  const supabase = getSupabase();
  const store = await getStoreByStoreId(storeId);
  if (!store) return { store: null, items: [] };

  const [categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("merchant_menu_categories")
      .select("id, category_name, display_order")
      .eq("store_id", store.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    searchQ && searchQ.trim()
      ? supabase
          .from("merchant_menu_items")
          .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, packaging_charges, in_stock, is_active, is_popular, is_recommended, preparation_time_minutes, has_customizations, has_addons, has_variants")
          .eq("store_id", store.id)
          .eq("is_active", true)
          .eq("in_stock", true)
          .eq("approval_status", "APPROVED")
          .ilike("item_name", `%${searchQ.trim()}%`)
          .order("item_name", { ascending: true })
      : supabase
          .from("merchant_menu_items")
          .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, packaging_charges, in_stock, is_active, is_popular, is_recommended, preparation_time_minutes, has_customizations, has_addons, has_variants")
          .eq("store_id", store.id)
          .eq("is_active", true)
          .eq("in_stock", true)
          .eq("approval_status", "APPROVED")
          .order("item_name", { ascending: true }),
  ]);

  const categories = (categoriesRes.data ?? []) as { id: number; category_name: string; display_order: number | null }[];
  const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
  const items = (itemsRes.data ?? []) as MerchantMenuItemRow[];
  if (itemsRes.error) throw itemsRes.error;

  const itemsWithCategory = items.map((m) => ({
    ...m,
    category_name: m.category_id != null ? categoryMap.get(m.category_id) ?? null : null,
  }));

  return { store, items: itemsWithCategory };
}

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

/**
 * Full config for one menu item: item + variants + customizations (with addons). Used by customization sheet.
 * Lazy-loaded when user taps item that has has_variants / has_addons / has_customizations.
 */
export async function getMenuItemFullConfig(
  storeId: string,
  itemId: string
): Promise<MenuItemFullConfig | null> {
  const supabase = getSupabase();
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;

  const itemIdTrim = itemId.trim();
  const numericPk = parseInt(itemIdTrim, 10);
  const itemSelect =
    "id, item_id, item_name, item_description, item_image_url, food_type, base_price, selling_price, packaging_charges, has_customizations, has_addons, has_variants";

  let itemRow: MerchantMenuItemRow | null = null;
  const byItemId = await supabase
    .from("merchant_menu_items")
    .select(itemSelect)
    .eq("store_id", store.id)
    .eq("item_id", itemIdTrim)
    .eq("is_active", true)
    .eq("approval_status", "APPROVED")
    .maybeSingle();
  if (byItemId.data) itemRow = byItemId.data as MerchantMenuItemRow;
  else if (!Number.isNaN(numericPk) && numericPk > 0) {
    const byPk = await supabase
      .from("merchant_menu_items")
      .select(itemSelect)
      .eq("store_id", store.id)
      .eq("id", numericPk)
      .eq("is_active", true)
      .eq("approval_status", "APPROVED")
      .maybeSingle();
    if (byPk.data) itemRow = byPk.data as MerchantMenuItemRow;
  }

  if (!itemRow) return null;
  const item = itemRow as MerchantMenuItemRow & {
    has_customizations?: boolean;
    has_addons?: boolean;
    has_variants?: boolean;
  };
  const menuItemPk = Number(item.id);

  const [variantsRes, customizationsRes] = await Promise.all([
    supabase
      .from("merchant_menu_item_variants")
      .select("variant_id, variant_name, variant_type, variant_price, is_default, display_order")
      .eq("menu_item_id", menuItemPk)
      .eq("in_stock", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("merchant_menu_item_customizations")
      .select("id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order")
      .eq("menu_item_id", menuItemPk)
      .order("display_order", { ascending: true }),
  ]);

  const variants = (variantsRes.data ?? []) as MenuItemVariantRow[];
  const customizations = (customizationsRes.data ?? []) as MenuItemCustomizationRow[];

  const addonsByCustomization = await Promise.all(
    customizations.map((c) =>
      supabase
        .from("merchant_menu_item_addons")
        .select("addon_id, addon_name, addon_price, addon_image_url, display_order, in_stock")
        .eq("customization_id", c.id)
        .order("display_order", { ascending: true })
    )
  );

  const customizationsWithAddons = customizations
    .map((c, i) => {
      const addons = ((addonsByCustomization[i].data ?? []) as (MenuItemAddonRow & { in_stock?: boolean })[]).filter(
        (a) => a.in_stock !== false
      );
      return {
        id: c.customization_id,
        title: c.customization_title,
        type: c.customization_type ?? null,
        isRequired: c.is_required === true,
        minSelection: c.min_selection ?? 0,
        maxSelection: c.max_selection ?? 1,
        displayOrder: c.display_order ?? 0,
        addons: addons.map((a) => ({
          id: a.addon_id,
          name: a.addon_name,
          price: parseFloat(a.addon_price ?? "0"),
          imageUrl: a.addon_image_url ?? null,
          displayOrder: a.display_order ?? 0,
        })),
      };
    })
    .filter((c) => c.addons.length > 0);

  /** Reusable modifier groups (merchant_item_modifier_groups) — common source for has_addons. */
  const modifierCustomizations: MenuItemFullConfig["customizations"] = [];
  try {
    const { data: linkRows } = await supabase
      .from("merchant_item_modifier_groups")
      .select("id, modifier_group_id, display_order")
      .eq("menu_item_id", menuItemPk)
      .order("display_order", { ascending: true });

    for (const link of linkRows ?? []) {
      const linkRow = link as { id: number; modifier_group_id: number; display_order: number | null };
      const { data: group } = await supabase
        .from("merchant_modifier_groups")
        .select("id, title, description, is_required, min_selection, max_selection")
        .eq("id", linkRow.modifier_group_id)
        .maybeSingle();
      if (!group) continue;
      const g = group as {
        id: number;
        title: string;
        description: string | null;
        is_required: boolean | null;
        min_selection: number | null;
        max_selection: number | null;
      };
      const { data: opts } = await supabase
        .from("merchant_modifier_options")
        .select("option_id, name, price_delta, display_order, in_stock")
        .eq("modifier_group_id", linkRow.modifier_group_id)
        .order("display_order", { ascending: true });
      const addons = (opts ?? [])
        .filter((o) => (o as { in_stock?: boolean }).in_stock !== false)
        .map((o) => {
          const row = o as {
            option_id: string;
            name: string;
            price_delta: number | string;
            display_order: number | null;
          };
          return {
            id: row.option_id,
            name: row.name,
            price: parseFloat(String(row.price_delta ?? "0")),
            imageUrl: null as string | null,
            displayOrder: row.display_order ?? 0,
          };
        });
      if (addons.length === 0) continue;
      modifierCustomizations.push({
        id: `mg_${g.id}`,
        title: g.title,
        type: "modifier_group",
        isRequired: g.is_required === true,
        minSelection: g.min_selection ?? 0,
        maxSelection: g.max_selection ?? 1,
        displayOrder: (linkRow.display_order ?? 0) + 1000,
        addons,
      });
    }
  } catch {
    /* modifier tables optional in some envs */
  }

  const allCustomizations = [...customizationsWithAddons, ...modifierCustomizations].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return {
    item: {
      id: item.item_id,
      menuItemId: menuItemPk,
      name: item.item_name,
      description: item.item_description ?? null,
      price: parseFloat(item.selling_price),
      imageUrl: toAbsoluteClientMediaUrl(item.item_image_url ?? null),
      isVeg: (item.food_type ?? "").toLowerCase().startsWith("veg"),
      hasCustomizations: item.has_customizations === true,
      hasAddons: item.has_addons === true,
      hasVariants: item.has_variants === true,
    },
    variants: variants.map((v) => ({
      id: v.variant_id,
      name: v.variant_name,
      type: v.variant_type ?? null,
      price: parseFloat(v.variant_price),
      isDefault: v.is_default === true,
      displayOrder: v.display_order ?? 0,
    })),
    customizations: allCustomizations,
  };
}

/**
 * Search menu items and stores. When lat/lng provided, uses scored nearby RPCs (15km, approval_status).
 * Otherwise uses FTS search_menu_items + store fetch (no location filter).
 */
export async function search(params: {
  q: string;
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
}): Promise<{
  dishes: MerchantMenuItemRow[];
  stores: MerchantStoreRow[];
}> {
  const supabase = getSupabase();
  const q = (params.q ?? "").trim();
  const limit = clampLimit(params.limit ?? SEARCH_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  const useNearby = validCoord(params.lat ?? 0, params.lng ?? 0);

  if (!q) {
    return { dishes: [], stores: [] };
  }

  if (useNearby) {
    const lat = params.lat!;
    const lng = params.lng!;
    const [storesRes, dishesRes] = await Promise.all([
      supabase.rpc("search_stores_nearby", {
        query_text: q,
        user_lat: lat,
        user_lng: lng,
        lim: Math.min(limit, 20),
      }),
      supabase.rpc("search_dishes_nearby", {
        query_text: q,
        user_lat: lat,
        user_lng: lng,
        lim: limit,
      }),
    ]);

    const storeRows = (storesRes.data ?? []) as Array<{
      id: number;
      store_id: string;
      store_name: string;
      store_display_name: string | null;
      banner_url: string | null;
      cuisine_types: string[] | null;
      distance_km: number;
      search_score: number;
    }>;
    const dishRows = (dishesRes.data ?? []) as Array<{
      item_id: string;
      item_name: string;
      item_description: string | null;
      cuisine_type: string | null;
      selling_price: string | number;
      food_type: string | null;
      store_id: number;
      store_public_id: string;
      store_name: string;
      distance_km: number;
      search_score: number;
      is_popular: boolean | null;
      is_recommended: boolean | null;
    }>;

    const stores: MerchantStoreRow[] = storeRows.map((s) => ({
      id: s.id,
      store_id: s.store_id,
      store_name: s.store_name,
      store_display_name: s.store_display_name,
      store_description: null,
      banner_url: s.banner_url,
      cuisine_types: s.cuisine_types,
      city: null,
      latitude: null,
      longitude: null,
      operational_status: null,
      avg_preparation_time_minutes: null,
      is_active: true,
      is_accepting_orders: true,
      is_available: null,
      status: null,
    }));

    const items: MerchantMenuItemRow[] = dishRows.map((d) => ({
      id: 0,
      store_id: d.store_id,
      category_id: null,
      item_id: d.item_id,
      item_name: d.item_name,
      item_description: d.item_description,
      item_image_url: null,
      food_type: d.food_type,
      spice_level: null,
      cuisine_type: d.cuisine_type,
      base_price: String(d.selling_price),
      selling_price: String(d.selling_price),
      discount_percentage: null,
      in_stock: true,
      is_active: true,
      is_popular: d.is_popular ?? false,
      is_recommended: d.is_recommended ?? false,
      preparation_time_minutes: null,
    }));

    return { dishes: items, stores };
  }

  let items: MerchantMenuItemRow[] = [];
  const { data: rpcData, error: rpcError } = await supabase.rpc("search_menu_items", {
    query_text: q,
    lim: limit,
    off: offset,
  });

  if (!rpcError && Array.isArray(rpcData) && rpcData.length >= 0) {
    items = rpcData as MerchantMenuItemRow[];
  } else {
    const { data: ilikeData, error: ilikeError } = await supabase
      .from("merchant_menu_items")
      .select("id, store_id, category_id, item_id, item_name, item_description, item_image_url, food_type, spice_level, cuisine_type, base_price, selling_price, discount_percentage, in_stock, is_active, is_popular, is_recommended")
      .eq("is_active", true)
      .eq("in_stock", true)
      .or(`item_name.ilike.%${q}%,item_description.ilike.%${q}%,cuisine_type.ilike.%${q}%`)
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (ilikeError) throw ilikeError;
    items = (ilikeData ?? []) as MerchantMenuItemRow[];
  }

  const storeIds = [...new Set(items.map((i) => i.store_id))];
  if (storeIds.length === 0) {
    return { dishes: items, stores: [] };
  }

  const { data: storeRows, error: storeError } = await supabase
    .from("merchant_stores")
    .select("id, store_id, store_name, store_display_name, store_description, banner_url, cuisine_types, city, is_active, is_accepting_orders, status")
    .in("id", storeIds)
    .eq("is_active", true);

  if (storeError) throw storeError;
  const stores = (storeRows ?? []) as MerchantStoreRow[];

  return { dishes: items, stores };
}
