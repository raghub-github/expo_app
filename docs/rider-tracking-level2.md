# GatiMitra Rider Tracking System — Level-2 Architecture

## Goal

- Live rider movement
- Real-time map updates
- Accurate ETA calculation
- Shortest route tracking
- Battery-efficient updates
- Shareable tracking link
- High traffic scaling

---

## System overview

```
Rider App GPS
      ↓
POST /v1/rider/location/update (every 3–5 sec)
      ↓
rider_live_locations (UPSERT) + order_rider_tracking (INSERT) + rider_location_history (INSERT)
      ↓
Customer: GET /v1/orders/:id/tracking (poll every 5s) or future WebSocket/Supabase Realtime
      ↓
Customer Tracking Page (map, ETA, timeline)
```

---

## 1. Core table — `delivery_assignments`

Connects rider ↔ order. Use when a rider is assigned to an order.

| Column | Type | Role |
|--------|------|------|
| order_id | TEXT | Unique; links to orders_core.order_id (e.g. GM10000001) |
| rider_id | INTEGER | FK riders.id |
| assignment_status | TEXT | ASSIGNED, ACCEPTED, ARRIVED_AT_STORE, PICKED_UP, ON_THE_WAY, DELIVERED |
| assigned_at, accepted_at, picked_up_at, delivered_at | TIMESTAMPTZ | State timestamps |
| current_eta_minutes | INTEGER | Live ETA for customer |
| distance_remaining_km | NUMERIC | For display / recalculation |
| route_polyline | TEXT | Encoded polyline (e.g. Google Directions) |

**Migration:** `backend/drizzle/0093_rider_tracking_level2.sql`

---

## 2. Live rider location — `rider_live_locations`

**One row per rider.** Fast lookup for “where is this rider now”.

| Column | Type |
|--------|------|
| rider_id | INTEGER PK |
| latitude, longitude | NUMERIC(10,7) |
| speed_kmh, heading, accuracy_meters | NUMERIC (optional) |
| updated_at | TIMESTAMPTZ |

Updated by `POST /v1/rider/location/update` (UPSERT).

---

## 3. Location history — `rider_location_history`

Rider-centric history for replay, analytics, and future route AI.

| Column | Type |
|--------|------|
| rider_id, order_id | INTEGER, TEXT (optional) |
| latitude, longitude, speed_kmh, heading, accuracy_meters | NUMERIC |
| recorded_at | TIMESTAMPTZ |

Appended on every location update.

---

## 4. Rider location update API

**Endpoint:** `POST /v1/rider/location/update`  
**Auth:** Rider (Bearer token).  
**Body:**

```json
{
  "lat": 24.82671,
  "lng": 85.34492,
  "order_id": "GM-1771769058262-428bbd31",
  "speed": 32,
  "heading": 140,
  "accuracy": 10
}
```

**Backend logic:**

1. Resolve auth to `rider_id` (integer).
2. **UPSERT** `rider_live_locations` (one row per rider).
3. If `order_id` present: **INSERT** `order_rider_tracking` (customer tracking reads latest from here).
4. **INSERT** `rider_location_history`.

**Response:** `200 { "ok": true }`

---

## 5. Customer tracking

- **GET /v1/orders/:id/tracking** (customer auth)  
  Returns latest rider position from `order_rider_tracking` (order_id, lat, lng, heading, updatedAt).

- Customer app: **orders/[id]** screen shows map, rider marker, ETA; polls tracking every 5s when order is active.

- **GlobalFloatingCart** shows “Order arriving in X mins” and “Track Live →” when there is an active order; tap navigates to order tracking.

---

## 6. ETA and route (existing + future)

- **order_eta_snapshots** and **recalc_order_eta** (migration 0086): ETA recalculated on order_events (e.g. status changes).
- **delivery_assignments.current_eta_minutes** can be updated by a separate ETA job (e.g. when rider moves > 50 m or on timer).
- **delivery_assignments.route_polyline**: to be filled by Google Directions (origin = rider_live_locations, destination = order drop).

---

## 7. Shareable tracking link — `order_tracking_tokens`

| Column | Type |
|--------|------|
| order_id | TEXT PK |
| tracking_token | TEXT UNIQUE (e.g. GMTRK_xxx) |
| expires_at | TIMESTAMPTZ |

Public URL: `https://gatimitra.app/track/GMTRK_xxx`  
Shows map + ETA + status; no phone numbers or payment info.

*(Token generation and public track page are not yet implemented; table is ready.)*

---

## 8. Battery optimization (rider app)

| State | Suggested interval |
|-------|--------------------|
| Waiting | 15 s |
| En route | 5 s |
| Near customer (&lt;1 km) | 2 s |

Rider app should send `order_id` only when the rider has an active delivery for that order.

---

## 9. Delivery state machine

```
ASSIGNED → ACCEPTED → ARRIVED_AT_STORE → PICKED_UP → ON_THE_WAY → DELIVERED
```

Each transition can update `delivery_assignments` timestamps and emit events for customer UI / realtime.

---

## Implemented in codebase

| Component | Location |
|-----------|----------|
| Tables (delivery_assignments, rider_live_locations, rider_location_history, order_tracking_tokens) | `backend/drizzle/0093_rider_tracking_level2.sql` |
| Drizzle schema | `backend/src/db/schema.ts` |
| POST /v1/rider/location/update | `backend/src/modules/rider/rider.routes.ts` |
| GET /v1/orders/:id/tracking | `backend/src/modules/orders/order.routes.ts` |
| order_rider_tracking (existing) | `backend/drizzle/0084_live_rider_tracking.sql` |
| ETA snapshots + recalc | `backend/drizzle/0086_eta_recalculation.sql` |
| Customer tracking page | `apps/customer_app/app/orders/[id].tsx` |
| “Track Live” bar | `apps/customer_app/components/GlobalFloatingCart.tsx` |

---

## Next steps (recommended)

1. **Dispatch:** When an order is assigned a rider, insert into `delivery_assignments` and set `assignment_status = 'ASSIGNED'`.
2. **Realtime:** Emit `RIDER_LOCATION_UPDATED` (WebSocket or Supabase Realtime) on each location update so the customer app can update the map without polling.
3. **ETA engine:** Update `delivery_assignments.current_eta_minutes` from Directions API or distance-based recalc when rider position changes.
4. **Route polyline:** Call Directions API (rider → drop), store in `delivery_assignments.route_polyline`, return in tracking API for map polyline.
5. **Shareable link:** Generate token (e.g. GMTRK_xxx), store in `order_tracking_tokens`, implement public `/track/:token` page.
