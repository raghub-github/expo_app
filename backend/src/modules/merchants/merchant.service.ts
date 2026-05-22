import { getSupabase } from "../../lib/supabase.js";
import { getDb } from "../../db/client.js";
import { sql } from "drizzle-orm";
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
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { customerPriceFromBase } from "../commission/pricing.js";
import { previewEtaRange } from "../eta/eta.preview.js";

/**
 * Stamps the canonical customer-facing ETA range on a store row using its
 * `avg_preparation_time_minutes` + `distance_km`. Every list / detail / search
 * payload runs through this so the customer app sees the SAME numbers on
 * every screen for one store.
 */
function withEtaStamp<T extends { distance_km?: number | null; avg_preparation_time_minutes?: number | null }>(
  row: T,
): T & { eta_min_minutes: number; eta_max_minutes: number } {
  const range = previewEtaRange({
    distanceKm: row.distance_km ?? null,
    prepMinutes: row.avg_preparation_time_minutes ?? null,
  });
  return { ...row, eta_min_minutes: range.etaMinMinutes, eta_max_minutes: range.etaMaxMinutes };
}

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
          if (distance_km > radius_km) return null;
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
    .select("id, store_id, store_name, store_display_name, store_description, full_address, postal_code, banner_url, gallery_images, cuisine_types, city, latitude, longitude, operational_status, avg_preparation_time_minutes, is_active, is_available, is_accepting_orders, status, created_at, parent_id, packaging_charge_amount, delivery_charge_per_km, delivery_radius_km, store_phones")
    .eq("store_id", storeId)
    .single();
  if (error || !data) return null;
  return data as MerchantStoreRow;
}

/** Customer About page payload — store info + verified document numbers when available. */
export async function getMerchantAboutPayload(storeId: string) {
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;

  const supabase = getSupabase();
  const { data: docs } = await supabase
    .from("merchant_store_documents")
    .select("gst_document_number, gst_document_name, fssai_document_number, fssai_document_name")
    .eq("store_id", store.id)
    .maybeSingle();

  const docRow = docs as {
    gst_document_number?: string | null;
    gst_document_name?: string | null;
    fssai_document_number?: string | null;
    fssai_document_name?: string | null;
  } | null;

  const legalName =
    (store.store_display_name ?? "").trim() ||
    (store.store_name ?? "").trim() ||
    null;

  const phones = (store as { store_phones?: string[] | null }).store_phones;
  const storePhone =
    Array.isArray(phones) && phones.length > 0
      ? phones.map((p) => (p ?? "").trim()).find(Boolean) ?? null
      : null;

  return {
    store_name: store.store_name,
    store_display_name: store.store_display_name ?? null,
    legal_name: legalName,
    full_address: store.full_address ?? store.store_description ?? null,
    city: store.city ?? null,
    state: (store as { state?: string | null }).state ?? null,
    postal_code: store.postal_code ?? null,
    cuisine_types: store.cuisine_types ?? null,
    operational_status: store.operational_status ?? null,
    avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? null,
    packaging_charge_amount: (store as { packaging_charge_amount?: number | null }).packaging_charge_amount ?? null,
    delivery_charge_per_km: (store as { delivery_charge_per_km?: number | null }).delivery_charge_per_km ?? null,
    delivery_radius_km: (store as { delivery_radius_km?: number | null }).delivery_radius_km ?? null,
    banner_url: store.banner_url ?? null,
    is_active: store.is_active ?? null,
    created_at: store.created_at ?? null,
    gst_number: (docRow?.gst_document_number ?? "").trim() || null,
    fssai_number: (docRow?.fssai_document_number ?? "").trim() || null,
    store_phone: storePhone,
    is_cloud_kitchen: store.parent_id != null,
  };
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

export async function getStoreByIdForOrder(
  merchantStoreId: number
): Promise<{ parentId: number | null; storeId: string | null; fullAddress: string | null; bannerUrl: string | null; storeName: string | null; storeDisplayName: string | null; latitude: number | null; longitude: number | null; is_accepting_orders: boolean } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("parent_id, store_id, full_address, banner_url, store_name, store_display_name, latitude, longitude, is_accepting_orders")
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as { parent_id?: number | null; store_id?: string | null; full_address?: string | null; banner_url?: string | null; store_name?: string | null; store_display_name?: string | null; latitude?: number | string | null; longitude?: number | string | null; is_accepting_orders?: boolean | null };
  return {
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    storeId: row.store_id ?? null,
    fullAddress: row.full_address ?? null,
    bannerUrl: row.banner_url ?? null,
    storeName: row.store_name ?? null,
    storeDisplayName: row.store_display_name ?? null,
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

  // The merchant's stored `selling_price` is treated as their NET intended
  // menu price (what they want to receive per item). We mark it up at read
  // time so the customer always sees `selling_price × 100/(100 − commission)`
  // — that way the menu list, cart, checkout, and bill are all the same
  // number, and a rate change propagates instantly without touching the menu.
  //
  // Important: this is the ONLY place where commission is added on the
  // customer-facing read path. Don't bake markup at write time too — that
  // double-applies for items saved through forms that already pre-compute.
  const commission = await resolveStoreCommission(store.id);
  for (const it of itemsWithCategory) {
    const netRupees = parseFloat(it.selling_price);
    if (Number.isFinite(netRupees) && netRupees > 0) {
      const { customerPaise } = customerPriceFromBase(
        Math.round(netRupees * 100),
        commission.percent,
      );
      it.selling_price = (customerPaise / 100).toFixed(2);
    }
    const baseNet = parseFloat(String(it.base_price ?? ""));
    if (Number.isFinite(baseNet) && baseNet > 0) {
      const { customerPaise } = customerPriceFromBase(
        Math.round(baseNet * 100),
        commission.percent,
      );
      it.base_price = (customerPaise / 100).toFixed(2);
    }
  }

  return { store, items: itemsWithCategory };
}

export type MenuItemFullConfig = {
  item: {
    id: string;
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
      isMostOrdered?: boolean;
    }>;
  }>;
};

/** Remove embedded price hints from merchant-entered addon names e.g. "Extra Spicy (+₹20)". */
function stripEmbeddedPriceFromAddonName(name: string): string {
  return (name ?? "")
    .replace(/\s*\(\s*\+?\s*₹?\s*[\d,]+(?:\.\d+)?\s*\)\s*$/i, "")
    .replace(/\s*\(\+\s*[\d,]+(?:\.\d+)?\s*\)\s*$/i, "")
    .trim();
}

/** Count completed addon picks for a menu item at a store (orders_core_item_addons.addon_id = addon PK). */
async function fetchAddonOrderCounts(
  merchantStoreId: number,
  menuItemPk: number
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT oia.addon_id, SUM(COALESCE(oia.quantity, 1))::int AS order_count
      FROM orders_core_item_addons oia
      INNER JOIN orders_core_items oci ON oci.id = oia.order_item_id
      INNER JOIN orders_core oc ON oc.order_id = oci.order_id
      WHERE oc.merchant_store_id = ${merchantStoreId}
        AND oci.menu_item_id = ${menuItemPk}
        AND oia.addon_id IS NOT NULL
        AND oc.status IS DISTINCT FROM 'cancelled'
      GROUP BY oia.addon_id
    `);
    const rows = (result.rows ?? result) as Array<{ addon_id: number | string; order_count: number | string }>;
    for (const row of rows) {
      const addonPk = Number(row.addon_id);
      const count = Number(row.order_count);
      if (Number.isFinite(addonPk) && Number.isFinite(count) && count > 0) {
        counts.set(addonPk, count);
      }
    }
  } catch {
    // Non-fatal — sheet still works without popularity badges.
  }
  return counts;
}

export type OrderedTogetherPairRow = {
  id: string;
  item1Id: string;
  item2Id: string;
  item1MenuItemPk: number;
  item2MenuItemPk: number;
  orderCount: number;
};

/**
 * Pairs of menu items that appeared together in 2+ non-cancelled orders at this store.
 * Only returns pairs where both items are still active, in stock, and approved on the menu.
 */
export async function getOrderedTogetherPairs(
  storeId: string
): Promise<OrderedTogetherPairRow[]> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return [];

  const storePk = Number(store.id);
  if (!Number.isFinite(storePk) || storePk <= 0) return [];

  try {
    const db = getDb();
    const result = await db.execute(sql`
      WITH pair_counts AS (
        SELECT
          LEAST(oci1.menu_item_id, oci2.menu_item_id)::bigint AS item_a_pk,
          GREATEST(oci1.menu_item_id, oci2.menu_item_id)::bigint AS item_b_pk,
          COUNT(DISTINCT oci1.order_id)::int AS order_count
        FROM orders_core_items oci1
        INNER JOIN orders_core_items oci2
          ON oci1.order_id = oci2.order_id
          AND oci1.menu_item_id < oci2.menu_item_id
        INNER JOIN orders_core oc ON oc.order_id = oci1.order_id
        WHERE oc.merchant_store_id = ${storePk}
          AND oc.status IS DISTINCT FROM 'cancelled'
        GROUP BY item_a_pk, item_b_pk
        HAVING COUNT(DISTINCT oci1.order_id) >= 2
        ORDER BY order_count DESC
        LIMIT 12
      )
      SELECT
        pc.item_a_pk,
        pc.item_b_pk,
        pc.order_count,
        a.item_id AS item_a_id,
        b.item_id AS item_b_id
      FROM pair_counts pc
      INNER JOIN merchant_menu_items a
        ON a.id = pc.item_a_pk
        AND a.store_id = ${storePk}
        AND a.is_active = TRUE
        AND a.in_stock = TRUE
        AND a.approval_status = 'APPROVED'
      INNER JOIN merchant_menu_items b
        ON b.id = pc.item_b_pk
        AND b.store_id = ${storePk}
        AND b.is_active = TRUE
        AND b.in_stock = TRUE
        AND b.approval_status = 'APPROVED'
      ORDER BY pc.order_count DESC
      LIMIT 8
    `);

    const rows = (result.rows ?? result) as Array<{
      item_a_pk: number | string;
      item_b_pk: number | string;
      order_count: number | string;
      item_a_id: string;
      item_b_id: string;
    }>;

    return rows
      .map((row) => {
        const item1MenuItemPk = Number(row.item_a_pk);
        const item2MenuItemPk = Number(row.item_b_pk);
        const orderCount = Number(row.order_count);
        const item1Id = String(row.item_a_id ?? "").trim();
        const item2Id = String(row.item_b_id ?? "").trim();
        if (
          !Number.isFinite(item1MenuItemPk) ||
          !Number.isFinite(item2MenuItemPk) ||
          !Number.isFinite(orderCount) ||
          orderCount < 2 ||
          !item1Id ||
          !item2Id
        ) {
          return null;
        }
        return {
          id: `${item1Id}-${item2Id}`,
          item1Id,
          item2Id,
          item1MenuItemPk,
          item2MenuItemPk,
          orderCount,
        };
      })
      .filter((row): row is OrderedTogetherPairRow => row != null);
  } catch {
    return [];
  }
}

function markMostOrderedAddons<T extends { numericId: number }>(
  addons: T[],
  orderCounts: Map<number, number>
): Array<Omit<T, "numericId"> & { isMostOrdered: boolean }> {
  let topId: number | null = null;
  let topCount = 0;
  for (const addon of addons) {
    const count = orderCounts.get(addon.numericId) ?? 0;
    if (count > topCount) {
      topCount = count;
      topId = addon.numericId;
    }
  }
  const showBadge = topCount >= 2 && topId != null;
  return addons.map(({ numericId, ...rest }) => ({
    ...rest,
    isMostOrdered: showBadge && numericId === topId,
  }));
}

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

  const itemSelect =
    "id, item_id, item_name, item_description, item_image_url, food_type, base_price, selling_price, packaging_charges, has_customizations, has_addons, has_variants";

  let itemRow: Record<string, unknown> | null = null;

  const { data: byItemId, error: byItemIdError } = await supabase
    .from("merchant_menu_items")
    .select(itemSelect)
    .eq("store_id", store.id)
    .eq("item_id", itemId)
    .eq("is_active", true)
    .eq("approval_status", "APPROVED")
    .maybeSingle();

  if (!byItemIdError && byItemId) {
    itemRow = byItemId;
  } else if (/^\d+$/.test(itemId)) {
    const numericId = Number(itemId);
    if (Number.isFinite(numericId) && numericId > 0) {
      const { data: byPk, error: byPkError } = await supabase
        .from("merchant_menu_items")
        .select(itemSelect)
        .eq("store_id", store.id)
        .eq("id", numericId)
        .eq("is_active", true)
        .eq("approval_status", "APPROVED")
        .maybeSingle();
      if (!byPkError && byPk) itemRow = byPk;
    }
  }

  if (!itemRow) return null;
  const item = itemRow as MerchantMenuItemRow & { has_customizations?: boolean; has_addons?: boolean; has_variants?: boolean };

  const [variantsRes, customizationsRes] = await Promise.all([
    supabase
      .from("merchant_menu_item_variants")
      .select("variant_id, variant_name, variant_type, variant_price, is_default, display_order")
      .eq("menu_item_id", item.id)
      .eq("in_stock", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("merchant_menu_item_customizations")
      .select("id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order")
      .eq("menu_item_id", item.id)
      .order("display_order", { ascending: true }),
  ]);

  const variants = (variantsRes.data ?? []) as MenuItemVariantRow[];
  const customizations = (customizationsRes.data ?? []) as MenuItemCustomizationRow[];

  const addonsByCustomization = await Promise.all(
    customizations.map((c) =>
      supabase
        .from("merchant_menu_item_addons")
        .select("id, addon_id, addon_name, addon_price, addon_image_url, display_order")
        .eq("customization_id", c.id)
        .eq("in_stock", true)
        .order("display_order", { ascending: true })
    )
  );

  const addonOrderCounts = await fetchAddonOrderCounts(store.id, item.id);

  const customizationsWithAddons = customizations.map((c, i) => {
    const addons = (addonsByCustomization[i].data ?? []) as MenuItemAddonRow[];
    const mapped = addons.map((a) => ({
      numericId: a.id,
      id: a.addon_id,
      name: stripEmbeddedPriceFromAddonName(a.addon_name),
      price: parseFloat(a.addon_price ?? "0"),
      imageUrl: a.addon_image_url ?? null,
      displayOrder: a.display_order ?? 0,
    }));
    return {
      id: c.customization_id,
      title: c.customization_title,
      type: c.customization_type ?? null,
      isRequired: c.is_required === true,
      minSelection: c.min_selection ?? 0,
      maxSelection: c.max_selection ?? 1,
      displayOrder: c.display_order ?? 0,
      addons: markMostOrderedAddons(mapped, addonOrderCounts),
    };
  });

  // Mark up the merchant's stored prices to the customer-visible amount.
  // Same rule as getMenuByStoreId: selling_price/variant_price/addon_price
  // are the merchant's net intent; we add commission on top exactly once
  // here on the read path so cart and bill stay consistent.
  const commission = await resolveStoreCommission(store.id);
  const markup = (rupees: number): number => {
    if (!Number.isFinite(rupees) || rupees <= 0) return 0;
    return (
      customerPriceFromBase(Math.round(rupees * 100), commission.percent).customerPaise / 100
    );
  };

  return {
    item: {
      id: item.item_id,
      name: item.item_name,
      description: item.item_description ?? null,
      price: markup(parseFloat(item.selling_price)),
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
      price: markup(parseFloat(v.variant_price)),
      isDefault: v.is_default === true,
      displayOrder: v.display_order ?? 0,
    })),
    customizations: customizationsWithAddons.map((c) => ({
      ...c,
      addons: c.addons.map((a) => ({ ...a, price: markup(a.price) })),
    })),
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
