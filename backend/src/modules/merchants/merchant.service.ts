import { getSupabase } from "../../lib/supabase.js";
import { getDb, getSql } from "../../db/client.js";
import { sql } from "drizzle-orm";
import {
  formatStoreStatusLabel,
  type LiveSchedulePhase,
} from "@gatimitra/store-status";
import {
  getMenuItemEffectiveInStockExpr,
  getMenuItemEffectiveInStockForAliases,
} from "../../lib/menu-item-effective-stock.js";
import { getEnv } from "../../config/env.js";
import { getRoute, haversineDistanceKm, getMatrixDistances } from "../distance/distance.service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { toTimestamptzParam } from "../../lib/sql-timestamps.js";
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
import {
  computeSurfaceLiveStatus,
  customerOperationalFromStoreRow,
} from "../../lib/store-surface-online.js";
import { getScheduleTimesForStores } from "./merchant-store-schedule-times.js";
import { buildPartnerStoreStatusSnapshot } from "../merchant-partner/partner-store-status-snapshot.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { customerPriceFromBase } from "../commission/pricing.js";
import { previewEtaRange } from "../eta/eta.preview.js";
import {
  fetchAddonsForCustomizationIds,
  fetchVariantsForFullConfig,
} from "../../lib/menu-full-config-sql.js";

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
/** Non-negotiable upper bound. No store ever shows beyond this from the user. */
const MAX_RADIUS_KM = 15;
const ROUGH_RADIUS_KM = 12;
const FINAL_MAX_ROAD_DISTANCE_KM = 10;
const MAX_MAPBOX_CANDIDATES = 15;
const MAPBOX_CONCURRENCY = 5;

/**
 * Cell-quantised result cache for nearby-stores queries.
 *
 * Why: at 1 lakh stores in production, the bbox + haversine + Mapbox
 * Matrix pipeline costs ~250-500ms per fresh request. Two customers
 * standing 50 metres apart should hit the same cache row, not pay for
 * two pipelines.
 *
 * Cell size: 0.005° ≈ 550 m at India latitudes. Small enough that the
 * answer doesn't materially change inside a cell; large enough that
 * adjacent customers and short walks hit the same cell.
 *
 * TTL: 60s. The store list itself doesn't churn faster than that, but
 * `is_open` does — 60s caps how stale we get.
 */
const RESULT_CELL_DEGREE = 0.005;
const RESULT_CACHE_TTL_MS = 60 * 1000;
const RESULT_CACHE_MAX_ENTRIES = 1000;
const nearbyResultCache = new Map<
  string,
  { items: NearbyStoreListingItem[]; expiresAt: number }
>();

function resultCacheKey(
  userLat: number,
  userLng: number,
  maxRoadKm: number,
  mapboxLimit: number,
): string {
  const cellLat = Math.round(userLat / RESULT_CELL_DEGREE);
  const cellLng = Math.round(userLng / RESULT_CELL_DEGREE);
  return `${cellLat}:${cellLng}:r${maxRoadKm}:n${mapboxLimit}`;
}

function evictResultCacheIfFull(): void {
  if (nearbyResultCache.size <= RESULT_CACHE_MAX_ENTRIES) return;
  // Cheap eviction: drop the oldest 10% of keys (Map preserves insertion order).
  const dropCount = Math.ceil(RESULT_CACHE_MAX_ENTRIES * 0.1);
  let dropped = 0;
  for (const key of nearbyResultCache.keys()) {
    if (dropped >= dropCount) break;
    nearbyResultCache.delete(key);
    dropped += 1;
  }
}

/**
 * Per-store effective radius rule.
 *
 *   effective = min(globalCap, store.delivery_radius_km)
 *
 * NULL / 0 / non-numeric `delivery_radius_km` → only the global cap
 * applies, matching the previous fallback behaviour. This is the
 * load-bearing function the user flagged: previously the engine ignored
 * `delivery_radius_km` entirely and showed stores outside their service
 * area.
 *
 * Exported for unit tests.
 */
export function effectiveServiceRadiusKm(
  globalCapKm: number,
  storeDeliveryRadiusKm: number | string | null | undefined,
): number {
  if (storeDeliveryRadiusKm == null) return globalCapKm;
  const v = Number(storeDeliveryRadiusKm);
  if (!Number.isFinite(v) || v <= 0) return globalCapKm;
  return Math.min(globalCapKm, v);
}

type NearbyStoreBase = {
  id: number;
  store_id: string;
  store_name: string;
  store_display_name: string | null;
  full_address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  /**
   * Per-store delivery service radius in kilometres. Stored on
   * `merchant_stores.delivery_radius_km`. NULL means "use the platform
   * default". The nearby engine honours this so a store that opted into
   * a smaller radius (e.g. 3 km) is hidden when the user is further
   * away even if the global cap (15 km) would have included it.
   */
  delivery_radius_km: number | string | null;
  status: string | null;
  is_active: boolean | null;
  is_available: boolean | null;
  is_accepting_orders: boolean | null;
  operational_status: string | null;
  live_status?: string | null;
  // Live schedule columns written by store-schedule-engine tick
  // (migration 0381). See @gatimitra/store-status for the contract.
  live_schedule_phase?: string | null;
  next_open_at?: string | null;
  next_close_at?: string | null;
  manual_override_active?: boolean | null;
  live_status_updated_at?: string | null;
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
  // Live schedule fields written by store-schedule-engine tick
  // (migration 0381). Customer app uses formatStoreStatusLabel from
  // @gatimitra/store-status to render a label that matches the
  // partnersite + merchant app exactly.
  live_schedule_phase: string | null;
  live_next_open_at: string | null;
  live_next_close_at: string | null;
  live_manual_override_active: boolean;
  live_label: string;
  live_label_chip: "OPEN" | "CLOSED" | "BREAK" | "UNKNOWN";
};

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


/**
 * Find stores deliverable to (userLat, userLng) using:
 *   1. SQL bounding-box prefilter (uses btree index on lat/lng — scans
 *      candidates, not the whole table)
 *   2. Haversine ordering + top-N candidate selection
 *   3. Per-store `delivery_radius_km` enforcement — a store is only
 *      returned if the user is within ITS declared service area, not
 *      just within the caller's global cap
 *   4. Mapbox Directions Matrix (ONE HTTP call for all candidates) for
 *      real road-network distance
 *   5. Cell-quantised LRU result cache for repeat queries from nearby
 *      users (0.005° ≈ 550 m grid, 60s TTL)
 *
 * Why this design vs PostGIS `ST_DWithin`:
 *   - No DB migration required to fix the user-visible bug today
 *   - The bbox + btree path is fast enough up to ~1M stores
 *   - PostGIS upgrade is documented in docs/store-discovery.md and is a
 *     drop-in replacement for stage 1 when DBA is ready
 *
 * Failure modes:
 *   - Mapbox quota / network failure: per-candidate result is null; we
 *     fall back to haversine distance for THAT candidate so the user
 *     doesn't see an empty list. The number of fallbacks is reported
 *     back via `mapboxFailures` so the caller can log/alert.
 *   - No candidates in bbox: returns an empty list, no Mapbox call made.
 */
export async function listNearbyStoresByRoadDistance(params: {
  lat: number;
  lng: number;
  /** Hard upper bound from the caller, capped at FINAL_MAX_ROAD_DISTANCE_KM. */
  maxRoadDistanceKm?: number;
  /** Max stores to send to Mapbox Matrix. Capped at MAX_MAPBOX_CANDIDATES (matrix is 25 coords/req). */
  mapboxLimit?: number;
  /** Skip the result cache (e.g. for debug endpoints). */
  bypassCache?: boolean;
}): Promise<{ items: NearbyStoreListingItem[]; mapboxFailures: number; cacheHit: boolean }> {
  if (!validCoord(params.lat, params.lng)) {
    return { items: [], mapboxFailures: 0, cacheHit: false };
  }

  const user = { lat: params.lat, lng: params.lng };
  const globalCap = Math.min(
    FINAL_MAX_ROAD_DISTANCE_KM,
    Math.max(1, params.maxRoadDistanceKm ?? FINAL_MAX_ROAD_DISTANCE_KM),
  );
  const mapboxLimit = Math.min(
    MAX_MAPBOX_CANDIDATES,
    Math.max(1, params.mapboxLimit ?? MAX_MAPBOX_CANDIDATES),
  );

  // Result-cache lookup (cell-quantised). Same cell + same params => same result.
  const cacheKey = resultCacheKey(user.lat, user.lng, globalCap, mapboxLimit);
  if (!params.bypassCache) {
    const cached = nearbyResultCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { items: cached.items, mapboxFailures: 0, cacheHit: true };
    }
    if (cached) nearbyResultCache.delete(cacheKey);
  }

  // --- Stage 1: SQL bbox prefilter ---
  // Latitude: 1 degree ≈ 111.32 km. Longitude: 111.32 km × cos(lat).
  // The bbox is sized to the ROUGH_RADIUS_KM (12 km), so any store
  // outside it cannot possibly be in service range under MAX_RADIUS_KM.
  // This converts the previous "SELECT *" full scan into an indexed
  // range scan on (latitude, longitude).
  const latDelta = ROUGH_RADIUS_KM / 111.32;
  const cosLat = Math.max(Math.cos((user.lat * Math.PI) / 180), 0.1); // clamp for poles
  const lngDelta = ROUGH_RADIUS_KM / (111.32 * cosLat);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select(
      // Trailing columns are written by the backend store-schedule-engine
      // tick (migration 0381). Customer mobile app uses formatStoreStatusLabel
      // from @gatimitra/store-status to render the same label the merchant
      // app + partnersite render.
      // No `timezone` column on merchant_stores — engine assumes Asia/Kolkata.
      "id, store_id, store_name, store_display_name, full_address, latitude, longitude, delivery_radius_km, status, is_active, is_available, is_accepting_orders, operational_status, live_schedule_phase, next_open_at, next_close_at, manual_override_active, live_status_updated_at",
    )
    .eq("status", "ACTIVE")
    .eq("is_active", true)
    .gte("latitude", user.lat - latDelta)
    .lte("latitude", user.lat + latDelta)
    .gte("longitude", user.lng - lngDelta)
    .lte("longitude", user.lng + lngDelta)
    .limit(500); // safety cap — bbox should already keep this small

  if (error) throw error;
  const baseRows = (data ?? []) as NearbyStoreBase[];

  // --- Stage 2: Haversine sort + per-store rough filter ---
  // We rough-filter by `min(globalCap, store.delivery_radius_km) × 1.5`
  // — the 1.5× buffer absorbs the worst-case detour ratio between
  // straight-line and road distance. Anything outside this buffer
  // cannot possibly satisfy `road_dist ≤ store_radius`, so we skip the
  // Mapbox call for it.
  const roughCandidates = baseRows
    .map((row) => {
      const lat = toNumber(row.latitude);
      const lng = toNumber(row.longitude);
      if (lat == null || lng == null) return null;
      const roughKm = haversineDistanceKm(user, { lat, lng });
      const storeRadius = effectiveServiceRadiusKm(globalCap, row.delivery_radius_km);
      const roughBudget = Math.min(ROUGH_RADIUS_KM, storeRadius * 1.5);
      if (roughKm > roughBudget) return null;
      return { row, lat, lng, roughKm, storeRadius };
    })
    .filter(
      (x): x is { row: NearbyStoreBase; lat: number; lng: number; roughKm: number; storeRadius: number } =>
        Boolean(x),
    )
    .sort((a, b) => a.roughKm - b.roughKm)
    .slice(0, mapboxLimit);

  if (roughCandidates.length === 0) {
    if (!params.bypassCache) {
      evictResultCacheIfFull();
      nearbyResultCache.set(cacheKey, { items: [], expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
    }
    return { items: [], mapboxFailures: 0, cacheHit: false };
  }

  // --- Stage 3: Mapbox Matrix — single HTTP call for all candidates ---
  const env = getEnv();
  const mapboxToken = env.MAPBOX_ACCESS_TOKEN ?? null;
  let mapboxFailures = 0;
  let matrixResults: Array<{ distanceKm: number; durationMin: number | null } | null>;

  if (!mapboxToken) {
    // No token configured (dev / preview) — every candidate falls back
    // to haversine. We still honour per-store radius.
    matrixResults = roughCandidates.map(() => null);
    mapboxFailures = roughCandidates.length;
  } else {
    const destinations = roughCandidates.map((c) => ({ lat: c.lat, lng: c.lng }));
    const matrix = await getMatrixDistances({
      origin: user,
      destinations,
      mapboxToken,
      profile: "driving",
    });
    matrixResults = matrix.map((m) => {
      if (!m) return null;
      return {
        distanceKm: m.distanceMeters / 1000,
        durationMin: m.durationSeconds != null ? m.durationSeconds / 60 : null,
      };
    });
    mapboxFailures = matrixResults.filter((r) => r === null).length;
  }

  // --- Stage 4: Per-store radius gate + live-status filter + sort ---
  const candidateInternalIds = roughCandidates
    .map((c) => Number(c.row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const scheduleByStore = await getScheduleTimesForStores(candidateInternalIds);

  const items: NearbyStoreListingItem[] = roughCandidates
    .map((c, i) => {
      const mb = matrixResults[i];
      // Mapbox failed for this candidate → fall back to haversine for
      // it. The store still gets a chance to appear; we just won't have
      // an accurate road distance. We never silently inflate the cap.
      const distanceKm = mb?.distanceKm ?? c.roughKm;
      const durationMin = mb?.durationMin ?? null;
      // THE CORE RULE: per-store delivery_radius_km gate
      if (distanceKm > c.storeRadius) return null;

      const storeInternalId = Number(c.row.id);
      const sched =
        Number.isFinite(storeInternalId) && storeInternalId > 0
          ? scheduleByStore.get(storeInternalId)
          : undefined;
      const operational = customerOperationalFromStoreRow({
        is_active: c.row.is_active,
        is_available: c.row.is_available,
        is_accepting_orders: c.row.is_accepting_orders,
        operational_status: c.row.operational_status,
      });
      const live = computeSurfaceLiveStatus(operational, sched?.withinOperatingHours ?? false);

      const isOpen = live === "OPEN";
      const livePhase = (c.row.live_schedule_phase ?? null) as LiveSchedulePhase | null;

      // Sync-failure monitoring (silent when healthy): the schedule engine says this
      // store is inside its slot AND it is within operating hours, yet the customer-
      // facing operational flags still read CLOSED. That is the exact "merchant shows
      // Open, customer shows Closed" condition — it means the background schedule tick
      // hasn't flipped merchant_stores fresh. Surface it so it can be alerted/monitored.
      if (!isOpen && livePhase === "WITHIN_SLOT" && sched?.withinOperatingHours === true) {
        console.warn(
          `[store-status-sync] store ${storeInternalId} is WITHIN_SLOT + within hours but customer sees CLOSED ` +
            `(stale merchant_stores flags — schedule tick lagging): ` +
            `operational_status=${c.row.operational_status} is_active=${c.row.is_active} ` +
            `is_accepting_orders=${c.row.is_accepting_orders} is_available=${c.row.is_available}`,
        );
      }

      const liveLabel = formatStoreStatusLabel({
        phase: livePhase,
        nextOpenAt: c.row.next_open_at ?? null,
        nextCloseAt: c.row.next_close_at ?? null,
        manualOverrideActive: c.row.manual_override_active === true,
        isOpenNow: isOpen,
        // merchant_stores has no timezone column; rely on default IST.
      });

      const item: NearbyStoreListingItem = {
        id: c.row.store_id,
        name: c.row.store_display_name ?? c.row.store_name,
        address: c.row.full_address ?? "",
        lat: c.lat,
        lng: c.lng,
        distance_km: Number(distanceKm.toFixed(2)),
        duration_min: durationMin != null ? Number(durationMin.toFixed(1)) : null,
        is_open: isOpen,
        live_schedule_phase: livePhase,
        live_next_open_at: c.row.next_open_at ?? null,
        live_next_close_at: c.row.next_close_at ?? null,
        live_manual_override_active: c.row.manual_override_active === true,
        live_label: liveLabel.primary,
        live_label_chip: liveLabel.chip,
      };
      return item;
    })
    .filter((x): x is NearbyStoreListingItem => x !== null)
    .filter((x) => x.is_open)
    .sort((a, b) => a.distance_km - b.distance_km);

  if (!params.bypassCache) {
    evictResultCacheIfFull();
    nearbyResultCache.set(cacheKey, { items, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
  }

  return { items, mapboxFailures, cacheHit: false };
}

/**
 * Test helper — wipes the result cache. Exported so the test file can
 * assert behaviour without timing dependencies.
 */
export function __resetNearbyResultCache(): void {
  nearbyResultCache.clear();
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
      let storesQuery = supabase
        .from("merchant_stores")
        .select(
          "id, store_id, store_name, store_display_name, store_description, full_address, postal_code, banner_url, gallery_images, cuisine_types, city, latitude, longitude, operational_status, avg_preparation_time_minutes, is_active, is_available, is_accepting_orders, status, parent_id, is_pure_veg"
        )
        .eq("status", "ACTIVE")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (veg_mode) storesQuery = storesQuery.eq("is_pure_veg", true);
      const { data: stores, error: storesError } = await storesQuery;
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
  let items = (data ?? []) as NearbyStoreRow[];
  if (veg_mode) {
    /**
     * Enforce veg toggle via merchant_stores.is_pure_veg so UI behavior is stable
     * even if nearby RPC implementation changes or returns mixed rows.
     */
    const internalIds = items
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (internalIds.length === 0) return { items: [] };
    const { data: vegRows, error: vegErr } = await supabase
      .from("merchant_stores")
      .select("id, is_pure_veg")
      .in("id", internalIds)
      .eq("is_pure_veg", true);
    if (vegErr) throw vegErr;
    const vegIds = new Set(
      ((vegRows ?? []) as Array<{ id: number; is_pure_veg?: boolean | null }>)
        .filter((r) => r.is_pure_veg === true)
        .map((r) => Number(r.id))
    );
    items = items.filter((r) => vegIds.has(Number(r.id)));
  }
  return { items };
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

/**
 * Lightweight store lookup used by order-placement enrichment. Returns the
 * fields the enrichment step writes onto orders_food (restaurant display
 * name, phone, prep time) plus the pure-veg flag used for veg aggregation.
 */
export async function getStoreDetailsForFoodOrder(
  merchantStoreId: number,
): Promise<{
  isPureVeg: boolean;
  storeName: string | null;
  storeDisplayName: string | null;
  storePhones: string[] | null;
  avgPreparationTimeMinutes: number | null;
} | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_stores")
    .select("is_pure_veg, store_name, store_display_name, store_phones, avg_preparation_time_minutes")
    .eq("id", merchantStoreId)
    .single();
  if (error || !data) return null;
  const row = data as {
    is_pure_veg?: boolean | null;
    store_name?: string | null;
    store_display_name?: string | null;
    store_phones?: string[] | null;
    avg_preparation_time_minutes?: number | string | null;
  };
  return {
    isPureVeg: row.is_pure_veg === true,
    storeName: row.store_name ?? null,
    storeDisplayName: row.store_display_name ?? null,
    storePhones: Array.isArray(row.store_phones) ? row.store_phones : null,
    avgPreparationTimeMinutes:
      row.avg_preparation_time_minutes != null
        ? Number(row.avg_preparation_time_minutes)
        : null,
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
 * Customer-facing surface status: operational gate + within operating hours.
 * Runs schedule tick so menu/detail match merchant app and partner portal.
 */
export type StoreActiveRush = {
  isActive: true;
  endsAt: string;
  remainingMinutes: number;
  durationMinutes: number;
};

export async function getActiveRushForStoreInternalId(
  storeInternalId: number
): Promise<StoreActiveRush | null> {
  if (!Number.isFinite(storeInternalId) || storeInternalId < 1) return null;
  try {
    const pg = getSql();
    const rushRows = await pg`
      SELECT duration_minutes, ends_at
      FROM merchant_store_rush_windows
      WHERE store_id = ${storeInternalId}
        AND is_active = TRUE
        AND ends_at > NOW()
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const rw = rushRows[0] as
      | { duration_minutes: number; ends_at: Date | string }
      | undefined;
    if (!rw) return null;
    const endsAtMs = new Date(String(rw.ends_at)).getTime();
    if (!Number.isFinite(endsAtMs)) return null;
    const remainingMinutes = Math.max(0, Math.floor((endsAtMs - Date.now()) / 60000));
    if (remainingMinutes <= 0) return null;
    return {
      isActive: true,
      endsAt: new Date(endsAtMs).toISOString(),
      remainingMinutes,
      durationMinutes: Number(rw.duration_minutes) || 0,
    };
  } catch {
    return null;
  }
}

export async function getStoreSurfaceLiveStatus(
  storeId: string,
  log?: { info: (o: object, msg?: string) => void; error: (o: object, msg?: string) => void }
): Promise<{
  liveStatus: "OPEN" | "CLOSED";
  withinOperatingHours: boolean;
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  activeRush: StoreActiveRush | null;
} | null> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;
  const internalId = Number(store.id);
  if (!Number.isFinite(internalId) || internalId < 1) return null;

  const noopLog = log ?? { info: () => {}, error: () => {} };
  const [snapshot, sched, activeRush] = await Promise.all([
    buildPartnerStoreStatusSnapshot(internalId, noopLog),
    getScheduleTimesForStores([internalId]).then((m) => m.get(internalId)),
    getActiveRushForStoreInternalId(internalId),
  ]);
  if (!snapshot) return null;

  return {
    liveStatus: snapshot.surface_online ? "OPEN" : "CLOSED",
    withinOperatingHours: snapshot.within_operating_hours,
    nextOpenAt: sched?.nextOpenAt ?? null,
    nextCloseAt: sched?.nextCloseAt ?? null,
    activeRush,
  };
}

/**
 * Single source of truth for store operational status. Used by all UIs (list, detail, cart, checkout, group order).
 * Returns OPEN only when is_active, is_available, is_accepting_orders true, operational_status = 'OPEN',
 * and current time is within configured operating hours.
 */
export async function getStoreLiveStatus(storeId: string): Promise<"OPEN" | "CLOSED" | null> {
  const surface = await getStoreSurfaceLiveStatus(storeId);
  return surface?.liveStatus ?? null;
}

/**
 * Get menu items for a store (by string store_id).
 * Only active, approved items that are effectively in stock (OOS fields + category cascade).
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

  const storePk = Number(store.id);
  const trimmedSearch = searchQ?.trim() ?? "";
  const pg = getSql();
  const effectiveInStock = getMenuItemEffectiveInStockExpr(pg);

  const [categoriesRes, itemRows] = await Promise.all([
    supabase
      .from("merchant_menu_categories")
      .select("id, category_name, display_order")
      .eq("store_id", store.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    trimmedSearch
      ? pg`
          SELECT
            m.id,
            m.store_id,
            m.category_id,
            m.item_id,
            m.item_name,
            m.item_description,
            COALESCE(
              NULLIF(TRIM((
                SELECT img.image_url
                FROM merchant_menu_item_images img
                WHERE img.menu_item_id = m.id
                  AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'APPROVED'
                ORDER BY CASE WHEN img.is_primary THEN 0 ELSE 1 END, img.created_at DESC, img.id DESC
                LIMIT 1
              )), ''),
              CASE
                WHEN m.approval_status = 'APPROVED'::merchant_menu_item_approval_status
                THEN NULLIF(TRIM(m.item_image_url), '')
                ELSE NULL
              END
            ) AS item_image_url,
            m.food_type,
            m.spice_level,
            m.cuisine_type,
            m.base_price,
            m.selling_price,
            m.discount_percentage,
            m.packaging_charges,
            m.in_stock,
            m.is_active,
            m.is_popular,
            m.is_recommended,
            m.preparation_time_minutes,
            m.has_customizations,
            m.has_addons,
            m.has_variants,
            c.category_name
          FROM merchant_menu_items m
          LEFT JOIN merchant_menu_categories c
            ON c.id = m.category_id
            AND c.store_id = ${storePk}
            AND COALESCE(c.is_deleted, FALSE) = FALSE
          WHERE m.store_id = ${storePk}
            AND COALESCE(m.is_deleted, FALSE) = FALSE
            AND m.is_active = TRUE
            AND m.approval_status = 'APPROVED'
            -- Entitlement gate: items locked by the merchant's plan limit are hidden from customers.
            AND COALESCE(m.is_locked_by_plan, FALSE) = FALSE
            AND ${effectiveInStock} = TRUE
            AND m.item_name ILIKE ${"%" + trimmedSearch + "%"}
          ORDER BY m.item_name ASC
        `
      : pg`
          SELECT
            m.id,
            m.store_id,
            m.category_id,
            m.item_id,
            m.item_name,
            m.item_description,
            COALESCE(
              NULLIF(TRIM((
                SELECT img.image_url
                FROM merchant_menu_item_images img
                WHERE img.menu_item_id = m.id
                  AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'APPROVED'
                ORDER BY CASE WHEN img.is_primary THEN 0 ELSE 1 END, img.created_at DESC, img.id DESC
                LIMIT 1
              )), ''),
              CASE
                WHEN m.approval_status = 'APPROVED'::merchant_menu_item_approval_status
                THEN NULLIF(TRIM(m.item_image_url), '')
                ELSE NULL
              END
            ) AS item_image_url,
            m.food_type,
            m.spice_level,
            m.cuisine_type,
            m.base_price,
            m.selling_price,
            m.discount_percentage,
            m.packaging_charges,
            m.in_stock,
            m.is_active,
            m.is_popular,
            m.is_recommended,
            m.preparation_time_minutes,
            m.has_customizations,
            m.has_addons,
            m.has_variants,
            c.category_name
          FROM merchant_menu_items m
          LEFT JOIN merchant_menu_categories c
            ON c.id = m.category_id
            AND c.store_id = ${storePk}
            AND COALESCE(c.is_deleted, FALSE) = FALSE
          WHERE m.store_id = ${storePk}
            AND COALESCE(m.is_deleted, FALSE) = FALSE
            AND m.is_active = TRUE
            AND m.approval_status = 'APPROVED'
            -- Entitlement gate: items locked by the merchant's plan limit are hidden from customers.
            AND COALESCE(m.is_locked_by_plan, FALSE) = FALSE
            AND ${effectiveInStock} = TRUE
          ORDER BY m.item_name ASC
        `,
  ]);

  const categories = (categoriesRes.data ?? []) as { id: number; category_name: string; display_order: number | null }[];
  const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
  const items = itemRows as unknown as (MerchantMenuItemRow & { category_name?: string | null })[];

  const itemsWithCategory = items.map((m) => ({
    ...m,
    category_name:
      m.category_name ?? (m.category_id != null ? categoryMap.get(m.category_id) ?? null : null),
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

/** Lightweight menu fingerprint — epoch ms of latest menu/store/category change. */
export async function getMenuVersion(
  storeId: string
): Promise<{ menuVersion: number; etag: string } | null> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return null;

  const storePk = Number(store.id);
  if (!Number.isFinite(storePk) || storePk <= 0) return null;

  const pg = getSql();
  const [row] = await pg`
    SELECT GREATEST(
      COALESCE(
        (SELECT MAX(EXTRACT(EPOCH FROM updated_at) * 1000)::bigint
         FROM merchant_menu_items
         WHERE store_id = ${storePk}),
        0::bigint
      ),
      COALESCE(
        (SELECT MAX(EXTRACT(EPOCH FROM updated_at) * 1000)::bigint
         FROM merchant_menu_categories
         WHERE store_id = ${storePk}),
        0::bigint
      ),
      -- Image approvals/rejections change the visible menu without touching
      -- parent merchant_menu_items.updated_at; include them in the version
      -- fingerprint so delta sync and version checks detect image-only changes.
      COALESCE(
        (SELECT MAX(EXTRACT(EPOCH FROM img.updated_at) * 1000)::bigint
         FROM merchant_menu_item_images img
         INNER JOIN merchant_menu_items mi ON mi.id = img.menu_item_id
         WHERE mi.store_id = ${storePk}),
        0::bigint
      ),
      COALESCE(
        (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint,
        0::bigint
      )
    ) AS menu_version
    FROM merchant_stores
    WHERE id = ${storePk}
    LIMIT 1
  `;

  const menuVersion = Number(row?.menu_version ?? 0);
  const etag = `"gm-menu-${storeId}-${menuVersion}"`;
  return { menuVersion, etag };
}

export type MenuDeltaRow = MerchantMenuItemRow & { category_name?: string | null };

export type MenuDeltaResult = {
  menuVersion: number;
  unchanged?: boolean;
  requiresFullSync?: boolean;
  deletedItemIds?: string[];
  changedRows?: MenuDeltaRow[];
};

/**
 * Delta since client menuVersion (epoch ms). Returns changed rows + removals only.
 * If client version is missing or too stale, signals full sync.
 */
export async function getMenuDelta(
  storeId: string,
  sinceVersionMs: number
): Promise<MenuDeltaResult | null> {
  const versionInfo = await getMenuVersion(storeId);
  if (!versionInfo) return null;

  const { menuVersion } = versionInfo;
  if (!Number.isFinite(sinceVersionMs) || sinceVersionMs <= 0) {
    return { menuVersion, requiresFullSync: true };
  }
  if (sinceVersionMs >= menuVersion) {
    return { menuVersion, unchanged: true };
  }

  const store = await getStoreByStoreId(storeId);
  if (!store) return null;

  const storePk = Number(store.id);
  const pg = getSql();
  const effectiveInStock = getMenuItemEffectiveInStockExpr(pg);
  const since = toTimestamptzParam(sinceVersionMs);

  const changedRows = (await pg`
    SELECT
      m.id,
      m.store_id,
      m.category_id,
      m.item_id,
      m.item_name,
      m.item_description,
      COALESCE(
        NULLIF(TRIM((
          SELECT img.image_url
          FROM merchant_menu_item_images img
          WHERE img.menu_item_id = m.id
            AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'APPROVED'
          ORDER BY CASE WHEN img.is_primary THEN 0 ELSE 1 END, img.created_at DESC, img.id DESC
          LIMIT 1
        )), ''),
        CASE
          WHEN m.approval_status = 'APPROVED'::merchant_menu_item_approval_status
          THEN NULLIF(TRIM(m.item_image_url), '')
          ELSE NULL
        END
      ) AS item_image_url,
      m.food_type,
      m.spice_level,
      m.cuisine_type,
      m.base_price,
      m.selling_price,
      m.discount_percentage,
      m.packaging_charges,
      m.in_stock,
      m.is_active,
      m.is_popular,
      m.is_recommended,
      m.preparation_time_minutes,
      m.has_customizations,
      m.has_addons,
      m.has_variants,
      m.approval_status,
      COALESCE(m.is_deleted, FALSE) AS is_deleted,
      COALESCE(m.is_locked_by_plan, FALSE) AS is_locked_by_plan,
      ${effectiveInStock} AS effective_in_stock,
      c.category_name
    FROM merchant_menu_items m
    LEFT JOIN merchant_menu_categories c
      ON c.id = m.category_id
      AND c.store_id = ${storePk}
      AND COALESCE(c.is_deleted, FALSE) = FALSE
    WHERE m.store_id = ${storePk}
      AND m.updated_at > ${since}::timestamptz
    ORDER BY m.updated_at ASC
  `) as unknown as (MenuDeltaRow & {
    effective_in_stock?: boolean;
    approval_status?: string | null;
    is_deleted?: boolean;
    is_locked_by_plan?: boolean;
  })[];

  const deletedItemIds: string[] = [];
  const activeRows: MenuDeltaRow[] = [];

  for (const row of changedRows) {
    const itemId = String(row.item_id ?? "").trim();
    if (!itemId) continue;

    const approved = row.approval_status === "APPROVED";
    const active =
      row.is_active === true &&
      row.is_deleted !== true &&
      approved &&
      // Plan-locked items are hidden from customers → tell the SWR client to remove them.
      row.is_locked_by_plan !== true &&
      row.effective_in_stock !== false;

    if (!active) {
      deletedItemIds.push(itemId);
      continue;
    }
    activeRows.push(row);
  }

  const commission = await resolveStoreCommission(store.id);
  for (const it of activeRows) {
    const netRupees = parseFloat(String(it.selling_price ?? ""));
    if (Number.isFinite(netRupees) && netRupees > 0) {
      const { customerPaise } = customerPriceFromBase(
        Math.round(netRupees * 100),
        commission.percent
      );
      it.selling_price = (customerPaise / 100).toFixed(2);
    }
    const baseNet = parseFloat(String(it.base_price ?? ""));
    if (Number.isFinite(baseNet) && baseNet > 0) {
      const { customerPaise } = customerPriceFromBase(
        Math.round(baseNet * 100),
        commission.percent
      );
      it.base_price = (customerPaise / 100).toFixed(2);
    }
  }

  return {
    menuVersion,
    deletedItemIds,
    changedRows: activeRows,
  };
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
    sizeValue: string | null;
    sizeUnit: string | null;
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
      sizeValue: string | null;
      sizeUnit: string | null;
      displayOrder: number;
      isMostOrdered?: boolean;
    }>;
  }>;
};

/** Keep one in-stock variant per display name (lowest display_order / id). */
function dedupeVariantRows(rows: MenuItemVariantRow[]): MenuItemVariantRow[] {
  const seen = new Set<string>();
  const sorted = [...rows].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      (a.is_default === true ? -1 : 0) - (b.is_default === true ? -1 : 0) ||
      a.id - b.id
  );
  const out: MenuItemVariantRow[] = [];
  for (const v of sorted) {
    const key = String(v.variant_name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function dedupeAddonRows(rows: MenuItemAddonRow[]): MenuItemAddonRow[] {
  const seenId = new Set<number>();
  const seenName = new Set<string>();
  const sorted = [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id);
  const out: MenuItemAddonRow[] = [];
  for (const a of sorted) {
    const nameKey = stripEmbeddedPriceFromAddonName(a.addon_name).toLowerCase();
    if (!nameKey) continue;
    if (seenId.has(a.id)) continue;
    seenId.add(a.id);
    if (seenName.has(nameKey)) continue;
    seenName.add(nameKey);
    out.push(a);
  }
  return out;
}

const VARIANT_MIRROR_TITLES = new Set(["quantity", "size", "portion", "variant", "variants"]);

function isVariantMirrorCustomizationGroup(
  title: string,
  addonNames: string[],
  variantNames: Set<string>
): boolean {
  if (variantNames.size === 0 || addonNames.length === 0) return false;
  const t = title.trim().toLowerCase();
  if (!VARIANT_MIRROR_TITLES.has(t) && !t.includes("size")) return false;
  return addonNames.every((n) => variantNames.has(n));
}

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
    // postgres-js returns RowList directly (iterable); drizzle's execute()
    // returns it as-is. Coerce through unknown for typed access.
    const rows = (result as unknown) as Array<{ addon_id: number | string; order_count: number | string }>;
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
  source: "co_purchase" | "popular_fallback";
};

export type OrderedTogetherRecommendations = {
  pairs: OrderedTogetherPairRow[];
  byAnchorItemId: Record<string, OrderedTogetherPairRow[]>;
};


/** Keep only pairs whose both items are on this store's current in-stock menu. */
async function filterPairsToAvailableStoreMenu(
  storeId: string,
  pairs: OrderedTogetherPairRow[]
): Promise<OrderedTogetherPairRow[]> {
  if (pairs.length === 0) return pairs;
  const { items } = await getMenuByStoreId(storeId);
  if (items.length === 0) return [];

  const allowedPk = new Set(
    items.map((i) => Number(i.id)).filter((n) => Number.isFinite(n) && n > 0)
  );
  const allowedPublicId = new Set(
    items
      .map((i) => String(i.item_id ?? "").trim())
      .filter((id) => id.length > 0)
  );

  return pairs.filter(
    (p) =>
      allowedPk.has(p.item1MenuItemPk) &&
      allowedPk.has(p.item2MenuItemPk) &&
      allowedPublicId.has(p.item1Id) &&
      allowedPublicId.has(p.item2Id)
  );
}

async function resolveMenuItemPk(
  storePk: number,
  itemRef: string | number
): Promise<number | null> {
  const ref = String(itemRef ?? "").trim();
  if (!ref) return null;
  const asNum = Number(ref);
  try {
    const db = getDb();
    if (Number.isFinite(asNum) && asNum > 0) {
      const byPk = await db.execute(sql`
        SELECT id FROM merchant_menu_items
        WHERE store_id = ${storePk} AND id = ${asNum}
        LIMIT 1
      `);
      const pkRow = ((byPk as unknown) as Array<{ id: number | string }>)[0];
      if (pkRow?.id != null) return Number(pkRow.id);
    }
    const byItemId = await db.execute(sql`
      SELECT id FROM merchant_menu_items
      WHERE store_id = ${storePk} AND item_id = ${ref}
      LIMIT 1
    `);
    const idRow = ((byItemId as unknown) as Array<{ id: number | string }>)[0];
    return idRow?.id != null ? Number(idRow.id) : null;
  } catch {
    return null;
  }
}

function mapCoPurchaseRows(
  rows: Array<{
    item1_pk: number | string;
    item2_pk: number | string;
    order_count: number | string;
    item1_id: string;
    item2_id: string;
  }>,
  source: "co_purchase" | "popular_fallback"
): OrderedTogetherPairRow[] {
  return rows
    .map((row) => {
      const item1MenuItemPk = Number(row.item1_pk);
      const item2MenuItemPk = Number(row.item2_pk);
      const orderCount = Number(row.order_count);
      const item1Id = String(row.item1_id ?? "").trim();
      const item2Id = String(row.item2_id ?? "").trim();
      if (
        !Number.isFinite(item1MenuItemPk) ||
        !Number.isFinite(item2MenuItemPk) ||
        !Number.isFinite(orderCount) ||
        orderCount < 1 ||
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
        source,
      };
    })
    .filter((row): row is OrderedTogetherPairRow => row != null);
}

async function queryCoPurchasePairsFromStats(
  storePk: number,
  opts: { anchorMenuItemPk?: number | null; limit: number }
): Promise<OrderedTogetherPairRow[]> {
  const db = getDb();
  const pg = getSql();
  const effA = getMenuItemEffectiveInStockForAliases(pg, "a", "c_a");
  const effB = getMenuItemEffectiveInStockForAliases(pg, "b", "c_b");
  const limit = Math.min(Math.max(opts.limit, 1), 24);
  const anchorPk = opts.anchorMenuItemPk;

  if (anchorPk != null && Number.isFinite(anchorPk)) {
    const result = await db.execute(sql`
      SELECT
        cp.anchor_menu_item_id AS item1_pk,
        cp.paired_menu_item_id AS item2_pk,
        cp.co_order_count AS order_count,
        a.item_id AS item1_id,
        b.item_id AS item2_id
      FROM merchant_menu_item_co_purchases cp
      INNER JOIN merchant_menu_items a
        ON a.id = cp.anchor_menu_item_id
        AND a.store_id = ${storePk}
        AND a.is_active = TRUE
        AND COALESCE(a.is_deleted, FALSE) = FALSE
        AND a.approval_status = 'APPROVED' AND COALESCE(a.is_locked_by_plan, FALSE) = FALSE
      LEFT JOIN merchant_menu_categories c_a
        ON c_a.id = a.category_id
        AND c_a.store_id = ${storePk}
        AND COALESCE(c_a.is_deleted, FALSE) = FALSE
      INNER JOIN merchant_menu_items b
        ON b.id = cp.paired_menu_item_id
        AND b.store_id = ${storePk}
        AND b.is_active = TRUE
        AND COALESCE(b.is_deleted, FALSE) = FALSE
        AND b.approval_status = 'APPROVED' AND COALESCE(b.is_locked_by_plan, FALSE) = FALSE
      LEFT JOIN merchant_menu_categories c_b
        ON c_b.id = b.category_id
        AND c_b.store_id = ${storePk}
        AND COALESCE(c_b.is_deleted, FALSE) = FALSE
      WHERE cp.merchant_store_id = ${storePk}
        AND cp.anchor_menu_item_id = ${anchorPk}
        AND a.store_id = cp.merchant_store_id
        AND b.store_id = cp.merchant_store_id
        AND ${effA} = TRUE
        AND ${effB} = TRUE
      ORDER BY cp.co_order_count DESC, cp.paired_menu_item_id ASC
      LIMIT ${limit}
    `);
    return mapCoPurchaseRows(
      (result as unknown) as Array<{
        item1_pk: number | string;
        item2_pk: number | string;
        order_count: number | string;
        item1_id: string;
        item2_id: string;
      }>,
      "co_purchase"
    );
  }

  const result = await db.execute(sql`
    WITH deduped AS (
      SELECT
        LEAST(cp.anchor_menu_item_id, cp.paired_menu_item_id) AS item_a_pk,
        GREATEST(cp.anchor_menu_item_id, cp.paired_menu_item_id) AS item_b_pk,
        MAX(cp.co_order_count) AS order_count
      FROM merchant_menu_item_co_purchases cp
      WHERE cp.merchant_store_id = ${storePk}
      GROUP BY item_a_pk, item_b_pk
      ORDER BY order_count DESC, item_a_pk ASC
      LIMIT ${Math.min(limit * 2, 24)}
    )
    SELECT
      d.item_a_pk AS item1_pk,
      d.item_b_pk AS item2_pk,
      d.order_count,
      a.item_id AS item1_id,
      b.item_id AS item2_id
    FROM deduped d
    INNER JOIN merchant_menu_items a
      ON a.id = d.item_a_pk
      AND a.store_id = ${storePk}
      AND a.is_active = TRUE
      AND COALESCE(a.is_deleted, FALSE) = FALSE
      AND a.approval_status = 'APPROVED' AND COALESCE(a.is_locked_by_plan, FALSE) = FALSE
    LEFT JOIN merchant_menu_categories c_a
      ON c_a.id = a.category_id
      AND c_a.store_id = ${storePk}
      AND COALESCE(c_a.is_deleted, FALSE) = FALSE
    INNER JOIN merchant_menu_items b
      ON b.id = d.item_b_pk
      AND b.store_id = ${storePk}
      AND b.is_active = TRUE
      AND COALESCE(b.is_deleted, FALSE) = FALSE
      AND b.approval_status = 'APPROVED' AND COALESCE(b.is_locked_by_plan, FALSE) = FALSE
    LEFT JOIN merchant_menu_categories c_b
      ON c_b.id = b.category_id
      AND c_b.store_id = ${storePk}
      AND COALESCE(c_b.is_deleted, FALSE) = FALSE
    WHERE a.store_id = ${storePk}
      AND b.store_id = ${storePk}
      AND ${effA} = TRUE
      AND ${effB} = TRUE
    ORDER BY d.order_count DESC, d.item_a_pk ASC
    LIMIT ${limit}
  `);
  return mapCoPurchaseRows(
    (result as unknown) as Array<{
      item1_pk: number | string;
      item2_pk: number | string;
      order_count: number | string;
      item1_id: string;
      item2_id: string;
    }>,
    "co_purchase"
  );
}

async function queryPopularPairFallback(
  storePk: number,
  opts: { anchorMenuItemPk?: number | null; limit: number }
): Promise<OrderedTogetherPairRow[]> {
  const db = getDb();
  const pg = getSql();
  const effM = getMenuItemEffectiveInStockForAliases(pg, "m", "c");
  const limit = Math.min(Math.max(opts.limit, 1), 12);
  const anchorPk = opts.anchorMenuItemPk;

  if (anchorPk != null && Number.isFinite(anchorPk)) {
    const result = await db.execute(sql`
      WITH anchor AS (
        SELECT id, category_id FROM merchant_menu_items
        WHERE id = ${anchorPk} AND store_id = ${storePk}
        LIMIT 1
      ),
      item_scores AS (
        SELECT
          m.id,
          m.item_id,
          m.category_id,
          (
            COALESCE(oc_cnt.order_count, 0)
            + CASE WHEN COALESCE(m.is_popular, FALSE) THEN 8 ELSE 0 END
            + CASE WHEN COALESCE(m.is_recommended, FALSE) THEN 4 ELSE 0 END
          )::INT AS score
        FROM merchant_menu_items m
        LEFT JOIN merchant_menu_categories c
          ON c.id = m.category_id
          AND c.store_id = ${storePk}
          AND COALESCE(c.is_deleted, FALSE) = FALSE
        LEFT JOIN (
          SELECT oci.menu_item_id, COUNT(DISTINCT oci.order_id)::INT AS order_count
          FROM orders_core_items oci
          INNER JOIN orders_core oc ON oc.order_id = oci.order_id
          WHERE oc.merchant_store_id = ${storePk}
            AND oc.status IS DISTINCT FROM 'cancelled'
          GROUP BY oci.menu_item_id
        ) oc_cnt ON oc_cnt.menu_item_id = m.id
        WHERE m.store_id = ${storePk}
          AND m.is_active = TRUE
          AND COALESCE(m.is_deleted, FALSE) = FALSE
          AND m.approval_status = 'APPROVED'
          AND COALESCE(m.is_locked_by_plan, FALSE) = FALSE
          AND ${effM} = TRUE
          AND m.id <> ${anchorPk}
      ),
      ranked AS (
        SELECT s.*
        FROM item_scores s
        CROSS JOIN anchor a
        ORDER BY
          CASE WHEN s.category_id IS NOT NULL AND s.category_id = a.category_id THEN 0 ELSE 1 END,
          s.score DESC,
          s.id ASC
        LIMIT ${limit}
      )
      SELECT
        a.id AS item1_pk,
        r.id AS item2_pk,
        GREATEST(r.score, 1) AS order_count,
        anchor_item.item_id AS item1_id,
        r.item_id AS item2_id
      FROM ranked r
      CROSS JOIN anchor a
      INNER JOIN merchant_menu_items anchor_item ON anchor_item.id = a.id
    `);
    return mapCoPurchaseRows(
      (result as unknown) as Array<{
        item1_pk: number | string;
        item2_pk: number | string;
        order_count: number | string;
        item1_id: string;
        item2_id: string;
      }>,
      "popular_fallback"
    );
  }

  const result = await db.execute(sql`
    WITH item_scores AS (
      SELECT
        m.id,
        m.item_id,
        (
          COALESCE(oc_cnt.order_count, 0)
          + CASE WHEN COALESCE(m.is_popular, FALSE) THEN 8 ELSE 0 END
          + CASE WHEN COALESCE(m.is_recommended, FALSE) THEN 4 ELSE 0 END
        )::INT AS score
      FROM merchant_menu_items m
      LEFT JOIN merchant_menu_categories c
        ON c.id = m.category_id
        AND c.store_id = ${storePk}
        AND COALESCE(c.is_deleted, FALSE) = FALSE
      LEFT JOIN (
        SELECT oci.menu_item_id, COUNT(DISTINCT oci.order_id)::INT AS order_count
        FROM orders_core_items oci
        INNER JOIN orders_core oc ON oc.order_id = oci.order_id
        WHERE oc.merchant_store_id = ${storePk}
          AND oc.status IS DISTINCT FROM 'cancelled'
        GROUP BY oci.menu_item_id
      ) oc_cnt ON oc_cnt.menu_item_id = m.id
      WHERE m.store_id = ${storePk}
        AND m.is_active = TRUE
        AND COALESCE(m.is_deleted, FALSE) = FALSE
        AND m.approval_status = 'APPROVED'
        AND COALESCE(m.is_locked_by_plan, FALSE) = FALSE
        AND ${effM} = TRUE
      ORDER BY score DESC, m.id ASC
      LIMIT ${Math.max(limit * 2, 8)}
    ),
    paired AS (
      SELECT
        s1.id AS item1_pk,
        s2.id AS item2_pk,
        LEAST(s1.score, s2.score) AS order_count,
        s1.item_id AS item1_id,
        s2.item_id AS item2_id,
        ROW_NUMBER() OVER (ORDER BY LEAST(s1.score, s2.score) DESC, s1.id ASC) AS rn
      FROM item_scores s1
      INNER JOIN item_scores s2 ON s1.id < s2.id
    )
    SELECT item1_pk, item2_pk, order_count, item1_id, item2_id
    FROM paired
    WHERE rn <= ${limit}
    ORDER BY order_count DESC, item1_pk ASC
  `);
  return mapCoPurchaseRows(
    (result as unknown) as Array<{
      item1_pk: number | string;
      item2_pk: number | string;
      order_count: number | string;
      item1_id: string;
      item2_id: string;
    }>,
    "popular_fallback"
  );
}

async function ensureCoPurchaseStats(storePk: number): Promise<void> {
  try {
    const db = getDb();
    const existing = await db.execute(sql`
      SELECT 1 FROM merchant_menu_item_co_purchases
      WHERE merchant_store_id = ${storePk}
      LIMIT 1
    `);
    const rows = (existing as unknown) as unknown[];
    if (rows.length > 0) return;
    await db.execute(sql`SELECT refresh_merchant_co_purchase_stats(${storePk})`);
  } catch {
    // Table may not exist yet before migration — live queries used as fallback.
  }
}

/**
 * Pairs frequently ordered together at this store (from aggregated order history).
 * Optional anchor item returns pairs where item1 is the anchor.
 * Falls back to popular same-category / store items when co-purchase data is sparse.
 */
export async function getOrderedTogetherPairs(
  storeId: string,
  opts?: { anchorMenuItemId?: string | number; limit?: number }
): Promise<OrderedTogetherPairRow[]> {
  const store = await getStoreByStoreId(storeId);
  if (!store) return [];

  const storePk = Number(store.id);
  if (!Number.isFinite(storePk) || storePk <= 0) return [];

  const limit = opts?.limit ?? 8;
  const anchorMenuItemPk =
    opts?.anchorMenuItemId != null
      ? await resolveMenuItemPk(storePk, opts.anchorMenuItemId)
      : null;

  await ensureCoPurchaseStats(storePk);

  try {
    let pairs = await queryCoPurchasePairsFromStats(storePk, {
      anchorMenuItemPk,
      limit,
    });
    if (pairs.length === 0) {
      pairs = await queryPopularPairFallback(storePk, { anchorMenuItemPk, limit });
    }
    return filterPairsToAvailableStoreMenu(storeId, pairs);
  } catch {
    return filterPairsToAvailableStoreMenu(
      storeId,
      await queryPopularPairFallback(storePk, { anchorMenuItemPk, limit })
    );
  }
}

/** Store-level pairs plus top per-item recommendations for menu rows / sheets. */
export async function getOrderedTogetherRecommendations(
  storeId: string,
  opts?: { limit?: number; perAnchorLimit?: number }
): Promise<OrderedTogetherRecommendations> {
  const limit = opts?.limit ?? 8;
  const perAnchorLimit = opts?.perAnchorLimit ?? 3;
  const pairs = await getOrderedTogetherPairs(storeId, { limit });

  const store = await getStoreByStoreId(storeId);
  const storePk = store ? Number(store.id) : NaN;
  const byAnchorItemId: Record<string, OrderedTogetherPairRow[]> = {};

  if (!Number.isFinite(storePk) || storePk <= 0) {
    return { pairs, byAnchorItemId };
  }

  try {
    await ensureCoPurchaseStats(storePk);
    const db = getDb();
    const pg = getSql();
    const effA = getMenuItemEffectiveInStockForAliases(pg, "a", "c_a");
    const effB = getMenuItemEffectiveInStockForAliases(pg, "b", "c_b");
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          cp.anchor_menu_item_id,
          cp.paired_menu_item_id,
          cp.co_order_count,
          a.item_id AS anchor_item_id,
          b.item_id AS paired_item_id,
          ROW_NUMBER() OVER (
            PARTITION BY cp.anchor_menu_item_id
            ORDER BY cp.co_order_count DESC, cp.paired_menu_item_id ASC
          ) AS rn
        FROM merchant_menu_item_co_purchases cp
        INNER JOIN merchant_menu_items a
          ON a.id = cp.anchor_menu_item_id
          AND a.store_id = ${storePk}
          AND a.is_active = TRUE
          AND COALESCE(a.is_deleted, FALSE) = FALSE
          AND a.approval_status = 'APPROVED' AND COALESCE(a.is_locked_by_plan, FALSE) = FALSE
        LEFT JOIN merchant_menu_categories c_a
          ON c_a.id = a.category_id
          AND c_a.store_id = ${storePk}
          AND COALESCE(c_a.is_deleted, FALSE) = FALSE
        INNER JOIN merchant_menu_items b
          ON b.id = cp.paired_menu_item_id
          AND b.store_id = ${storePk}
          AND b.is_active = TRUE
          AND COALESCE(b.is_deleted, FALSE) = FALSE
          AND b.approval_status = 'APPROVED' AND COALESCE(b.is_locked_by_plan, FALSE) = FALSE
        LEFT JOIN merchant_menu_categories c_b
          ON c_b.id = b.category_id
          AND c_b.store_id = ${storePk}
          AND COALESCE(c_b.is_deleted, FALSE) = FALSE
        WHERE cp.merchant_store_id = ${storePk}
          AND a.store_id = cp.merchant_store_id
          AND b.store_id = cp.merchant_store_id
          AND ${effA} = TRUE
          AND ${effB} = TRUE
      )
      SELECT
        anchor_menu_item_id AS item1_pk,
        paired_menu_item_id AS item2_pk,
        co_order_count AS order_count,
        anchor_item_id AS item1_id,
        paired_item_id AS item2_id
      FROM ranked
      WHERE rn <= ${perAnchorLimit}
      ORDER BY co_order_count DESC
      LIMIT 120
    `);

    const rows = mapCoPurchaseRows(
      (result as unknown) as Array<{
        item1_pk: number | string;
        item2_pk: number | string;
        order_count: number | string;
        item1_id: string;
        item2_id: string;
      }>,
      "co_purchase"
    );

    for (const row of rows) {
      const key = row.item1Id;
      if (!byAnchorItemId[key]) byAnchorItemId[key] = [];
      if (byAnchorItemId[key].length < perAnchorLimit) {
        byAnchorItemId[key].push(row);
      }
    }
  } catch {
    // Non-fatal — store-level pairs still returned.
  }

  const filteredByAnchor: Record<string, OrderedTogetherPairRow[]> = {};
  for (const [anchorId, anchorPairs] of Object.entries(byAnchorItemId)) {
    const filtered = await filterPairsToAvailableStoreMenu(storeId, anchorPairs);
    if (filtered.length > 0) filteredByAnchor[anchorId] = filtered;
  }

  return { pairs, byAnchorItemId: filteredByAnchor };
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

  const menuItemPk = Number(item.id);

  const [variantRowsRaw, customizationsRes, addonOrderCounts] = await Promise.all([
    fetchVariantsForFullConfig(Number(item.id)),
    supabase
      .from("merchant_menu_item_customizations")
      .select("id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order")
      .eq("menu_item_id", item.id)
      .order("display_order", { ascending: true }),
    Number.isFinite(menuItemPk) && menuItemPk > 0
      ? fetchAddonOrderCounts(store.id, menuItemPk)
      : Promise.resolve(new Map<number, number>()),
  ]);

  const variants = dedupeVariantRows(
    variantRowsRaw.map(
      (row) =>
        ({
          id: Number(row.id),
          variant_id: String(row.variant_id ?? ""),
          menu_item_id: Number(item.id),
          variant_name: String(row.variant_name ?? ""),
          variant_type: row.variant_type != null ? String(row.variant_type) : null,
          variant_size_value: row.variant_size_value ?? null,
          variant_size_unit: row.variant_size_unit ?? null,
          variant_price: String(row.variant_price ?? "0"),
          price_difference: null,
          in_stock: row.in_stock !== false,
          display_order: Number(row.display_order ?? 0),
          is_default: row.is_default === true,
        }) as MenuItemVariantRow
    )
  );
  const variantNameSet = new Set(
    variants.map((v) => String(v.variant_name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const customizations = (customizationsRes.data ?? []) as MenuItemCustomizationRow[];

  const customizationPkIds = customizations.map((c) => c.id);
  const addonsByCustomizationPk = new Map<number, MenuItemAddonRow[]>();
  if (customizationPkIds.length > 0) {
    const allAddonRows = await fetchAddonsForCustomizationIds(customizationPkIds);
    for (const row of allAddonRows) {
      const cid = Number(row.customization_id);
      if (!Number.isFinite(cid)) continue;
      const list = addonsByCustomizationPk.get(cid) ?? [];
      list.push({
        id: Number(row.id),
        customization_id: cid,
        addon_id: String(row.addon_id ?? ""),
        addon_name: String(row.addon_name ?? ""),
        addon_price: String(row.addon_price ?? "0"),
        addon_image_url: row.addon_image_url != null ? String(row.addon_image_url) : null,
        addon_size_value: row.addon_size_value ?? null,
        addon_size_unit: row.addon_size_unit != null ? String(row.addon_size_unit) : null,
        display_order: Number(row.display_order ?? 0),
        in_stock: row.in_stock !== false,
      } as MenuItemAddonRow);
      addonsByCustomizationPk.set(cid, list);
    }
  }

  const customizationsWithAddons = customizations
    .map((c) => {
      const addons = dedupeAddonRows(addonsByCustomizationPk.get(c.id) ?? []);
      const mapped = addons.map((a) => ({
        numericId: a.id,
        id: String(a.id),
        name: stripEmbeddedPriceFromAddonName(a.addon_name),
        price: parseFloat(a.addon_price ?? "0"),
        imageUrl: toAbsoluteClientMediaUrl(a.addon_image_url ?? null),
        sizeValue:
          a.addon_size_value != null && String(a.addon_size_value).trim() !== ""
            ? String(a.addon_size_value).trim()
            : null,
        sizeUnit:
          a.addon_size_unit != null && String(a.addon_size_unit).trim() !== ""
            ? String(a.addon_size_unit).trim()
            : null,
        displayOrder: a.display_order ?? 0,
      }));
      return {
        id: String(c.id),
        title: c.customization_title,
        type: c.customization_type ?? null,
        isRequired: c.is_required === true,
        minSelection: c.min_selection ?? 0,
        maxSelection: c.max_selection ?? 1,
        displayOrder: c.display_order ?? 0,
        addons: markMostOrderedAddons(mapped, addonOrderCounts),
      };
    })
    .filter((c) => c.addons.length > 0)
    .filter((c) => {
      const addonNames = c.addons.map((a) => a.name.trim().toLowerCase()).filter(Boolean);
      return !isVariantMirrorCustomizationGroup(c.title, addonNames, variantNameSet);
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
      id: String(v.id),
      name: v.variant_name,
      type: v.variant_type ?? null,
      sizeValue:
        v.variant_size_value != null && String(v.variant_size_value).trim() !== ""
          ? String(v.variant_size_value).trim()
          : null,
      sizeUnit:
        v.variant_size_unit != null && String(v.variant_size_unit).trim() !== ""
          ? String(v.variant_size_unit).trim()
          : null,
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
  veg_mode?: boolean;
}): Promise<{
  dishes: MerchantMenuItemRow[];
  stores: MerchantStoreRow[];
}> {
  const supabase = getSupabase();
  const q = (params.q ?? "").trim();
  const limit = clampLimit(params.limit ?? SEARCH_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  const vegMode = params.veg_mode === true;
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

    if (!vegMode) return { dishes: items, stores };
    const storeIds = stores
      .map((s) => Number(s.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (storeIds.length === 0) return { dishes: [], stores: [] };
    const { data: pureRows, error: pureErr } = await supabase
      .from("merchant_stores")
      .select("id, is_pure_veg")
      .in("id", storeIds)
      .eq("is_pure_veg", true);
    if (pureErr) throw pureErr;
    const pureStoreIds = new Set(
      ((pureRows ?? []) as Array<{ id: number; is_pure_veg?: boolean | null }>)
        .filter((r) => r.is_pure_veg === true)
        .map((r) => Number(r.id))
    );
    return {
      stores: stores.filter((s) => pureStoreIds.has(Number(s.id))),
      dishes: items.filter((d) => pureStoreIds.has(Number(d.store_id))),
    };
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

  let storesQuery = supabase
    .from("merchant_stores")
    .select("id, store_id, store_name, store_display_name, store_description, banner_url, cuisine_types, city, is_active, is_accepting_orders, status")
    .in("id", storeIds)
    .eq("is_active", true);
  if (vegMode) storesQuery = storesQuery.eq("is_pure_veg", true);
  const { data: storeRows, error: storeError } = await storesQuery;

  if (storeError) throw storeError;
  const stores = (storeRows ?? []) as MerchantStoreRow[];
  if (!vegMode) return { dishes: items, stores };
  const pureStoreIdSet = new Set(stores.map((s) => Number(s.id)));
  return {
    dishes: items.filter((d) => pureStoreIdSet.has(Number(d.store_id))),
    stores,
  };
}
