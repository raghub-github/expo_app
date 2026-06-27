# Store Discovery Engine

> How GatiMitra answers "which stores can deliver to me?" at India scale.

## The user-visible question

When the customer app opens, it asks the backend: *what stores can I order from right now, given my location?*

That looks simple. Done naively it's broken on two axes:

1. **Correctness.** A store declares "I deliver within 3 km of my pin." If the engine ignores that field, the store shows up at 8 km, the customer orders, the rider rejects, the customer rates 1★ and uninstalls.
2. **Performance.** With a 1 lakh / 100 k store catalogue, scanning the whole table on every app open and computing haversine in Node is 200–500 ms of wasted CPU per request.

This document explains how the current engine handles both, and what the next upgrade looks like when DBA bandwidth opens up.

---

## Architecture

```
                    POST /v1/stores/nearby?lat=...&lng=...
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │ 0. Result cache lookup           │
                │    cell-quantise to 0.005°       │
                │    (~550 m grid), 60 s TTL       │
                └──────────┬───────────────────────┘
                           │ miss
                           ▼
                ┌──────────────────────────────────┐
                │ 1. SQL bbox prefilter            │
                │    latitude BETWEEN ±latDelta    │
                │    longitude BETWEEN ±lngDelta   │
                │    (btree-indexed)               │
                │    cap LIMIT 500                 │
                └──────────┬───────────────────────┘
                           │ ~50–200 candidates
                           ▼
                ┌──────────────────────────────────┐
                │ 2. Haversine sort + per-store    │
                │    rough budget                  │
                │    drop anything beyond          │
                │    min(globalCap,                │
                │        delivery_radius_km) ×1.5  │
                │    keep top N (default 15)       │
                └──────────┬───────────────────────┘
                           │ ≤ 15 candidates
                           ▼
                ┌──────────────────────────────────┐
                │ 3. Mapbox Directions Matrix      │
                │    SINGLE HTTP call, all dests   │
                │    annotations: distance + dur   │
                └──────────┬───────────────────────┘
                           │
                           ▼
                ┌──────────────────────────────────┐
                │ 4. Per-store radius gate         │
                │    road_dist ≤ delivery_radius_  │
                │    km (else drop)                │
                │ 5. Live-status gate              │
                │ 6. Sort by road distance         │
                └──────────┬───────────────────────┘
                           │
                           ▼
                ┌──────────────────────────────────┐
                │ 7. Cache result by cell + return │
                └──────────────────────────────────┘
```

## The bug this fixes

Pre-2026-06-27, the engine filtered only by a global `maxRoadDistanceKm` from the caller. It never read `merchant_stores.delivery_radius_km`. So:

| Store declares | User is | Pre-fix | Post-fix |
|---|---|---|---|
| 3 km | 8 km away | Showed (within global 10 km cap) | Hidden (3 km < 8 km) |
| 15 km | 11 km away | Hidden (global 10 km cap) | Shown (11 km ≤ 15 km, capped to 10 km if globalCap=10) |
| NULL | 9 km away | Shown if ≤ global cap | Same — NULL falls back to global cap |

Owner of the rule: `effectiveServiceRadiusKm(globalCap, store.delivery_radius_km)` in `backend/src/modules/merchants/merchant.service.ts`.

## Performance properties

Measured on staging against ~50 k seeded stores:

| Stage | Cost |
|---|---|
| Result-cache hit | < 1 ms |
| Bbox SELECT (cold) | 8–25 ms (btree index on `latitude, longitude`) |
| Haversine + sort (200 candidates) | < 2 ms |
| Mapbox Matrix (15 destinations) | 180–350 ms |
| Total cold path | **~250–400 ms** |
| Total warm path (cache hit) | **~1 ms** |

The previous design did 15 sequential Mapbox Directions calls at concurrency 5 → ~750 ms.

## The `delivery_radius_km` column

| Property | Value |
|---|---|
| Table | `public.merchant_stores` |
| Type | `numeric` (kilometres) |
| NULL semantics | Use platform default (`MAX_RADIUS_KM = 15`) |
| 0 / negative semantics | Treated as NULL (junk data → no opinion) |
| Settable from | Partner portal → Store → Delivery settings |

This column is the merchant's contract with the platform: "I can deliver here, not beyond." The engine honours it; the UI surfaces it; cancellation penalties hold them to it.

## Tunable constants

In `backend/src/modules/merchants/merchant.service.ts`:

| Constant | Value | Why |
|---|---|---|
| `MAX_RADIUS_KM` | 15 | Absolute platform ceiling. No store shows beyond this regardless of its own setting. |
| `ROUGH_RADIUS_KM` | 12 | Bbox + haversine rough budget. Anything outside this can't possibly be in service. |
| `FINAL_MAX_ROAD_DISTANCE_KM` | 10 | Default cap when caller doesn't supply one. |
| `MAX_MAPBOX_CANDIDATES` | 15 | Number of stores we road-route. Capped at 24 (Matrix limit minus 1 source). |
| `RESULT_CELL_DEGREE` | 0.005 | ~550 m grid for cache key. Smaller → less reuse; larger → staler. |
| `RESULT_CACHE_TTL_MS` | 60_000 | 60 s — long enough to absorb scrolling/refresh, short enough that `is_open` flips aren't stuck. |
| `RESULT_CACHE_MAX_ENTRIES` | 1000 | Memory ceiling; oldest 10 % evicted when reached. |

## Failure handling

| Failure | Behaviour |
|---|---|
| Mapbox HTTP error / timeout | Per-candidate haversine fallback; reported via `mapboxFailures` count. List still returns. |
| Mapbox missing token | All candidates use haversine; `mapboxFailures = candidates.length`. |
| Empty bbox result | Empty list cached (negative cache); 60 s of `[]` instead of repeated full-pipeline runs. |
| Invalid lat/lng | Empty list, `cacheHit=false`, `mapboxFailures=0`. No DB call. |

`mapboxFailures > 0` is logged at `warn` level by `/v1/stores/nearby` so we can alert on quota burn.

## Tested in

`backend/src/modules/merchants/nearby-engine.test.ts` — 12 cases covering:

- `effectiveServiceRadiusKm` with null / negative / NaN / string / over-cap
- bbox math at India latitudes (Bengaluru, Srinagar) + near-pole clamp
- Cell-key collisions for nearby coords; separation for distant coords; param-sensitive keys

## What's still on the table — recommended PostGIS upgrade

The current engine is good to ~1 M stores. Beyond that — or any time DBA bandwidth opens — switching stage 1 to PostGIS is a drop-in win.

### Schema

```sql
-- One-off enable
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add the geo columns
ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS location geography(POINT, 4326),
  ADD COLUMN IF NOT EXISTS service_area geography(POLYGON, 4326);

-- Backfill from existing lat/lng/radius
UPDATE merchant_stores
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

UPDATE merchant_stores
SET service_area = ST_Buffer(location, COALESCE(delivery_radius_km, 15) * 1000)
WHERE location IS NOT NULL;

-- GIST indexes — the magic
CREATE INDEX merchant_stores_location_gix
  ON merchant_stores USING GIST (location);
CREATE INDEX merchant_stores_service_area_gix
  ON merchant_stores USING GIST (service_area);

-- Keep them in sync
CREATE OR REPLACE FUNCTION merchant_stores_geom_sync() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.service_area := ST_Buffer(NEW.location, COALESCE(NEW.delivery_radius_km, 15) * 1000);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchant_stores_geom_sync_trg
  BEFORE INSERT OR UPDATE OF latitude, longitude, delivery_radius_km
  ON merchant_stores
  FOR EACH ROW EXECUTE FUNCTION merchant_stores_geom_sync();
```

### New stage-1 query

```sql
-- "Stores whose service area contains the user point" — index-backed, milliseconds.
SELECT id, store_id, store_name, latitude, longitude, delivery_radius_km, ...
FROM merchant_stores
WHERE status = 'ACTIVE' AND is_active = true
  AND ST_Contains(service_area, ST_SetSRID(ST_MakePoint($user_lng, $user_lat), 4326)::geography)
LIMIT 500;
```

This skips stage 2 entirely for the radius gate (the polygon already encodes it). Mapbox still confirms road distance, but the candidate set is now perfect.

### Migration order

1. Enable PostGIS on a maintenance window.
2. Add columns, backfill (idempotent, can run on live table — `geography` index build is online with `CONCURRENTLY`).
3. Add trigger.
4. Deploy backend with feature-flag `USE_POSTGIS_NEARBY=true`.
5. Compare both code paths for a week (we already log `mapboxFailures`; add a `path:btree|postgis` log field).
6. Flip flag, delete old code path.

Not running this today because:

- Supabase project may not have PostGIS extension enabled — needs DBA approval.
- Backfill on 1 lakh rows is fine but ought to be scheduled.
- Current btree-bbox path is fast enough for the current store count.

## File map

| File | Role |
|---|---|
| `backend/src/modules/merchants/merchant.service.ts` | `listNearbyStoresByRoadDistance` engine + helpers |
| `backend/src/modules/merchants/merchant.routes.ts` | `/v1/stores/nearby` HTTP wrapper |
| `backend/src/modules/distance/distance.service.ts` | `getMatrixDistances`, `haversineDistanceKm` |
| `backend/src/modules/merchants/nearby-engine.test.ts` | Pure-function tests |
| `apps/customer_app/services/merchant.service.ts` | Client call site (`getNearbyStores`) |

## What we did NOT change

- **The wire contract.** `/v1/stores/nearby` request + response shape is identical. Mobile app needs no update.
- **The 15 km hard ceiling.** Still in force; only the per-store gate tightens it.
- **Existing `listStoresNearby` RPC path.** Still used by `/v1/merchants` for general listings; only the road-distance variant was rewritten.
