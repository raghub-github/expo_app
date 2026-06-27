# Order Domain — Hybrid Architecture (orders_core + service-specific)

This document describes the **hybrid order schema** introduced in migrations 0067–0069: `orders_core`, service-specific tables (`orders_food`, `orders_parcel`, `orders_ride`), provider mapping, OTPs, delivery images, and route snapshots. The existing wide `orders` table remains for backward compatibility until cutover.

---

## 1. High-level architecture

```
orders_core (1) ──┬── (0..1) orders_food     [when order_type = 'food']
                  ├── (0..1) orders_parcel    [when order_type = 'parcel']
                  ├── (0..1) orders_ride      [when order_type = 'person_ride']
                  ├── (many) order_provider_mapping
                  ├── (many) order_otps
                  ├── (many) order_delivery_images
                  └── (many) order_route_snapshots

order_provider_mapping (many) ──→ (1) order_providers

Existing (unchanged for now):
  orders (legacy wide table)
  order_items, order_timeline, order_remarks, order_cancellation_reasons
  order_rider_assignments, order_events, order_payments, webhook_events, tickets
  → After migration cutover, these will reference orders_core.id
```

- **orders_core**: Single source of truth per order; identity, parties, locations (6-decimal lat/lon), status, payment, risk/bulk flags, distance mismatch flag.
- **orders_food / orders_parcel / orders_ride**: 1:1 with `orders_core` by `order_type`; no null-column explosion.
- **order_providers**: Registry (internal, swiggy, zomato, rapido, ondc, shiprocket, other).
- **order_provider_mapping**: Replaces provider-specific columns; one row per order–provider pair; unique on `(provider_id, provider_order_id)`.

---

## 2. Table list and responsibilities

| Table | Responsibility |
|-------|----------------|
| **order_providers** | Registry of order sources (internal, swiggy, zomato, etc.). |
| **orders_core** | Core order row: id, order_uuid, order_type, order_source, party FKs, pickup/drop addresses (raw, normalized, geocoded), lat/lon (6 decimals), distance/ETA, deviation/mismatch flags, amounts, status, payment, risk/bulk, cancellation, timestamps. |
| **orders_food** | Food-only: merchant/store, prep time, item count, fragile/high-value, utensils, veg_non_veg, delivery_instructions. |
| **orders_parcel** | Parcel-only: weight, dimensions, type, value, insurance, COD, signature/OTP, instructions, scheduled pickup/delivery. |
| **orders_ride** | Ride-only: passenger, ride_type, vehicle, waiting/toll/parking, scheduled, return trip. |
| **order_provider_mapping** | Per-order–provider: provider_order_id, status, sync, metadata, fare/commission. Replaces swiggy_order_id, zomato_order_id, etc. |
| **order_otps** | OTP for pickup / delivery / rto; code, verified_at, bypass_reason (e.g. image_uploaded). |
| **order_delivery_images** | Rider images: order_id, image_type (pickup | delivery | rto), url, taken_at; optional rider_assignment_id. |
| **order_route_snapshots** | Mapbox (or app) route result: distance_km, duration_seconds, polyline, mapbox_response; used for distance_mismatch_flagged on orders_core when deviation > 700m. |

Related (existing): `order_items`, `order_timeline`, `order_remarks`, `order_cancellation_reasons`, `order_rider_assignments`, `order_events`, `order_payments`, `order_refunds`, `webhook_events`, `action_audit_log`, tickets. After cutover they reference **orders_core.id**.

---

## 3. Status lifecycle (order_status_type)

Allowed transitions (application or trigger enforces):

- **assigned** → accepted | rejected (timeout/cancel)
- **accepted** → reached_store
- **reached_store** → picked_up
- **picked_up** → in_transit
- **in_transit** → delivered | cancelled | failed
- **delivered**, **cancelled**, **failed** → terminal (no further status change)

RTO: Model as in_transit (return) then cancelled or delivered with metadata; use `order_timeline` and service-specific fields for RTO reason.

---

## 4. Location and distance rules

- **Lat/lon**: Stored with **minimum 6 decimal places** (e.g. `numeric(9,6)` in DB).
- **Addresses**: On `orders_core`: pickup/drop `_raw`, `_normalized`, `_geocoded` for mismatch comparison.
- **Distance mismatch**: `pickup_address_deviation_meters`, `drop_address_deviation_meters`, `distance_mismatch_flagged` (true when deviation > 700m). Mapbox result stored in `order_route_snapshots` (distance_km, duration_seconds, polyline, mapbox_response).

---

## 5. Migration strategy (from current wide `orders`)

1. **Create new tables** (0067–0069): `orders_core`, `orders_food`, `orders_parcel`, `orders_ride`, `order_providers`, `order_provider_mapping`, `order_otps`, `order_delivery_images`, `order_route_snapshots`; add `order_core_id` to `order_notifications` where applicable.
2. **Backfill**: From `orders` into `orders_core` (identity, parties, locations with 6-decimal lat/lon, status, payment, amounts, risk/bulk); into `orders_food` / `orders_parcel` / `orders_ride` by `order_type`; into `order_provider_mapping` from swiggy_order_id, zomato_order_id, rapido_*, etc.
3. **Migrate FKs**: Add `order_core_id` (or equivalent) to `order_items`, `order_timeline`, `order_remarks`, `order_cancellation_reasons`, `order_rider_assignments`, `webhook_events`, tickets; backfill from current order id; then switch FKs and drop old column (or keep same id if 1:1 cutover).
4. **Dual-write**: Application writes to both legacy `orders` and `orders_core` + service + provider mapping for a transition period.
5. **Cutover**: Reads/writes use new tables only; rename `orders` → `orders_legacy`; optionally rename `orders_core` → `orders` or expose `orders` as a view over `orders_core` + joins.
6. **Cleanup**: Drop `orders_legacy` after validation.

---

## 6. Migrations reference

- **0067_orders_hybrid_core_and_services.sql**: order_providers, orders_core, orders_food, orders_parcel, orders_ride, order_provider_mapping; enums (order_source_type, payment_status_type, payment_mode_type, veg_non_veg_type).
- **0068_order_otps_delivery_images_route_snapshots.sql**: order_otp_type enum, order_otps, order_delivery_images, order_route_snapshots.
- **0069_order_notifications_orders_core_id.sql**: order_notifications.order_core_id (optional FK to orders_core).

---

## 7. Drizzle / codebase

- **Dashboard**: [dashboard/src/lib/db/schema.ts](../../../src/lib/db/schema.ts) — `orderProviders`, `ordersCore`, `ordersFood`, `ordersParcel`, `ordersRide`, `orderProviderMapping`, `orderOtps`, `orderDeliveryImages`, `orderRouteSnapshots` and relations.
- **Backend**: [backend/src/db/schema.ts](../../../../backend/src/db/schema.ts) — same tables and relations.
- **APIs**: Rider summary and orders APIs currently use legacy `orders`; after cutover they should query `orders_core` (+ optional joins to service tables and provider mapping).
