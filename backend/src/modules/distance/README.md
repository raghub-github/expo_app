# Distance Service — Architecture

Single source of truth for distance/ETA across **Customer**, **Rider**, and **Merchant** apps. All apps call the backend; no distance logic in clients.

## Two-stage design

1. **Stage 1 — Fast geographic filtering**  
   Haversine (or DB spatial index via `get_nearby_merchant_stores`) to quickly filter nearby merchants/stores. Used for listing and as fallback when routing fails.

2. **Stage 2 — Real road routing**  
   OSRM (or Valhalla/GraphHopper) for:
   - Real road distance (meters/km)
   - ETA (duration, minutes)
   - Route geometry (optional, for map display)

## API

- **POST /v1/distance/route**  
  Body: `{ origin: { lat, lng }, destination: { lat, lng }, profile?: "driving" | "bike", skipCache?: boolean }`  
  Response: `{ distanceMeters, durationSeconds, distanceKm, etaMinutes, geometry?, fromRoutingEngine }`

## Env

- **OSRM_BASE_URL** (optional): e.g. `https://router.project-osrm.org`. If unset, all routes use Haversine fallback.
- **REDIS_URL** (optional): For production, replace in-memory cache with Redis (same key shape: `route:{profile}:{lat}:{lng}:{lat}:{lng}`).

## Caching

- In-memory TTL cache (5 min) per process. For multi-instance production, use Redis with the same key and TTL.
- Cache key: rounded coordinates (4 decimals) + profile to avoid unbounded keys.

## Failure fallback

If OSRM request fails (timeout, 5xx, or missing base URL), the service returns Haversine-based distance and an estimated ETA (e.g. 25 km/h driving, 15 km/h bike).

## Scalability

- **Listing (Stage 1):** Already handled by DB RPC + Haversine; no change.
- **Single route (Stage 2):** One request per origin/destination pair; cache reduces OSRM load.
- **Rider / Merchant:** Same `POST /v1/distance/route`; no new endpoints. Rider app can call with `profile: "bike"` for delivery ETA; four-wheeler later with same API and profile.

## Performance

- OSRM timeout: 5s; then fallback.
- Cache TTL: 5 minutes (configurable in code).
- For high QPS, add Redis and consider batching if needed later.
