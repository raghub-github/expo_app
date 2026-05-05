# Canonical Distance + Delivery Fee Engine

Single source of truth for **distance_km**, **duration_min**, **delivery_fee**,
**delivery_gst**, **final_delivery_fee**, and **serviceable** across the entire
customer app and rider payout flow.

## Why this engine exists

Before this, different customer app screens computed distance from slightly
different origins (device GPS vs. saved-address vs. map-pin), producing
different numbers per page (e.g. 1.3 km on the home list but 3.2 km on
checkout). Every page now calls the same backend engine with the same
`(storeId, addressId|coords)` pair, so the values render identically.

## Endpoint

`POST /v1/distance/store-quote`

### Request body

```json id="req-body"
{
  "storeId": "str-abc123",
  "addressId": 42,
  "drop": { "lat": 12.93, "lng": 77.62, "pincode": "560034" },
  "actor": "customer",
  "serviceType": "FOOD",
  "riderWaitingMinutes": 0,
  "skipCache": false
}
```

Send **either** `addressId` (preferred — requires auth) **or** `drop` coords
(open; for guest/list-before-address flows).

### Response body

```json id="resp-body"
{
  "store_id": "str-abc123",
  "actor": "customer",
  "distance_km": 3.05,
  "duration_min": 8.4,
  "delivery_fee": 41,
  "delivery_gst": 2.05,
  "final_delivery_fee": 43.05,
  "serviceable": true,
  "unserviceable_reason": null,
  "service_radius_km": 15,
  "source": "mapbox",
  "cached": false,
  "approximate": false,
  "pricing_engine": "slab_geo",
  "slab_quote": { "...": "raw slab math for debugging" }
}
```

## Distance resolution

Order (short-circuits on success):

1. **Mapbox Directions API** — `driving`/`bike` profile.
   Input: `merchant_lng,merchant_lat;customer_lng,customer_lat`
   Output: `routes[0].distance` (m → km), `routes[0].duration` (s → min).
2. **OSRM** — when `OSRM_BASE_URL` is set and Mapbox fails.
3. **Haversine × 1.3 multiplier** — last-resort fallback when both fail.

### Cache layers

- In-memory map keyed by `(origin, destination, profile)`.
- Postgres-backed `route_distance_cache` — persists across restarts.
- When `addressId` is supplied, these keys effectively pin to
  `(store_lat,store_lng, address_lat,address_lng)` so repeat calls across
  pages are served from cache within a session.

## Serviceability

```text
effective_radius_km = store.delivery_radius_km ?? env.SERVICE_RADIUS_KM_DEFAULT  // default 15
serviceable = store.active AND distance_km <= effective_radius_km
```

Reasons emitted on `unserviceable_reason`:

- `store_inactive` — merchant is not accepting orders.
- `out_of_range` — distance exceeds the effective radius.

## Delivery fee resolution

Geo-slab engine first (`delivery_rate_slabs_effective` matched via the
drop pincode → post_office → … → state fallback), then env-based fallback.

### Customer formula (non-progressive)

```text
first slab:  delivery_fee = max(min_charge, base_fare + distance × per_km)
next slabs:  delivery_fee = max(min_charge, distance × per_km)
```

Example with the product-spec slabs (0–5: base 23, per_km 6, min 25;
5–10: per_km 6, min 26; 10–15: per_km 7, min 30):

| distance_km | slab | calc                | delivery_fee |
| ----------- | ---- | ------------------- | ------------ |
| 0.1         | 0–5  | max(25, 23+0.6)     | 25           |
| 3.0         | 0–5  | max(25, 23+18)      | 41           |
| 7.0         | 5–10 | max(26, 42)         | 42           |
| 12.0        | 10–15| max(30, 84)         | 84           |

### Rider formula (progressive)

Base fare applied once; per-segment per-km summed; min-charge floor; then
optional waiting (min × per-min rate) and surge multiplier from the first
slab row.

### GST

When `APPLY_GST_ON_DELIVERY_FEE=true`:

```text
delivery_gst       = delivery_fee × DELIVERY_FEE_GST_PERCENT / 100
final_delivery_fee = delivery_fee + delivery_gst
```

### Env fallback

Used when no slabs match or the drop pincode is unknown:

```text
delivery_fee = max(DELIVERY_MIN_FEE_INR, DELIVERY_DEFAULT_BASE_INR + distance × DELIVERY_DEFAULT_PER_KM_INR)
```

Defaults in code: `base=25`, `per_km=5`.

## Billing integration

`POST /v1/billing/calculate` now also returns:

- `serviceable: boolean`
- `serviceRadiusKm: number | null`
- `unserviceableReason: "out_of_range" | "store_inactive" | null`
- `durationMin: number | null`

The checkout screen uses `serverBill.serviceable` (authoritative) instead of
a frontend-side hardcoded `SERVICE_RADIUS_KM` comparison.

## Customer-app consumption

```tsx id="hook-usage"
import { useStoreDeliveryQuote } from "@/hooks/useStoreDeliveryQuote";

const { data: quote } = useStoreDeliveryQuote({
  storeId,
  addressId: selectedAddress?.id,
  drop: selectedAddress == null && pin ? { lat: pin.lat, lng: pin.lng } : null,
});

// quote.distance_km, quote.duration_min, quote.final_delivery_fee, quote.serviceable
```

Pages using the hook:

- `app/home/merchant/[id].tsx` (store details)
- _(next)_ `app/checkout/index.tsx` — currently uses the billing endpoint which
  embeds the same numbers via `serverBill`.
- _(next)_ home/search listings — merchants endpoint already calls the same
  `getRoute` engine for road distance; the hook is available for any per-card
  live updates.

## Rider payout

`actor: "rider"` switches the slab engine to progressive math and enables
rider extras (waiting minutes, surge multiplier) stored on the first slab
row. Payout = `final_delivery_fee` in the response.

## Testing

Unit tests:

- `backend/src/modules/delivery-slab-pricing/deliverySlabPricing.service.test.ts`
  — slab math (customer selected + rider progressive).
- `backend/src/modules/distance/storeQuote.service.test.ts` — product-spec
  slab values + serviceability decision table.
- `backend/src/modules/distance/distance.service.test.ts` — Haversine fallback.

Integration tests live with the orders module and exercise the billing pipeline
end-to-end against a real Postgres instance when one is available.
