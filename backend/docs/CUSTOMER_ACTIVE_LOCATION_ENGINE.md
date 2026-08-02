# Customer Active Location Engine

**Canonical architecture guideline for all GatiMitra customer-facing location behaviour.**

Single source of truth for the customer browsing / checkout delivery pin across the entire ecosystem.

---

## Final Production Rule (Must Follow)

This Customer Active Location Engine is the **only** location engine used across the GatiMitra ecosystem.

The following modules must **never** implement their own location selection, address retention, or GPS reconciliation logic:

- Food Delivery
- Grocery
- Pharmacy
- Parcel Delivery
- Hyperlocal Delivery
- Future Commerce Modules
- Any new customer-facing service

Every module must consume the same backend Customer Active Location Engine APIs and respect the backend as the single source of truth for:

| Concern | Backend owns |
|---------|----------------|
| Active Delivery Address | `customer_active_location` + `address_id` |
| Current Location | `address_id = null` + GPS pin |
| Saved Address Binding | `PUT /active-location` with `addressId` |
| Address Retention | `ACTIVE_SAVED_ADDRESS_RETENTION_RADIUS_M` |
| GPS Reconciliation | `POST /active-location/reconcile` |
| Restaurant / Store Filtering | Client passes pin from engine; never invents far defaults |
| Serviceability | Quotes / checkout against bound or nearby saved address |
| Checkout Validation | Prefer bound `addressId` when set |
| Order Creation | Pending/create freezes **checkout `addressId`** + store row coords into `orders_core`; bumps MRU |
| Order Tracking Map | **Only** `orders_core` pickup/drop snapshots — never live GPS / active location / live store |

The frontend must remain a **pure rendering layer**. It must not introduce:

- Duplicate location state that conflicts with the backend
- Custom GPS decisions that override reconcile outcomes
- Conflicting business logic (e.g. inventing a far Saved Address)
- Tracking maps that read `locationStore`, live GPS, or current merchant store coords

---

## Immutable order location snapshots (P0)

When a food order is created, persist and never rewrite:

| Field | Source at placement |
|-------|---------------------|
| `drop_lat` / `drop_lon` (+ `delivery_*`) | `customer_addresses` row for **checkout `addressId`** |
| `delivery_address` / `drop_address_raw` | Same address row text |
| `pickup_lat` / `pickup_lon` | `merchant_stores` row at place time (then client echo) |
| `pickup_address_raw` | Store address at place time |

**Tracking must never use:**

- Customer live GPS / `locationStore`
- `customer_active_location` lat/lng (may be GPS while a Saved Address is bound elsewhere)
- Current Saved Address selection after place
- Current Location mode after place
- Live merchant store GPS after place

Checkout `addressId` wins over active-location binding when they diverge (e.g. race while placing “order for someone else”).

---

## Future Development Policy

Before any new service or feature is released:

1. It **must** integrate with this Customer Active Location Engine.
2. It **must not** create a parallel location system.
3. Any location-related enhancement **must** be implemented in the shared backend engine so every service benefits automatically.

Enhancements land in:

- `backend/src/modules/addresses/` (service + routes)
- Shared customer app helpers (`reconcileActiveLocationFromGps`, `applySelectedDeliveryAddress`, `applyActiveLocationFromBackend`, `ensureActiveLocationValidated`)
- This document (update reconcile / retention / cart policies when behaviour changes)

---

## Regression Requirement (Merge Gate)

Every future change affecting location must pass an end-to-end regression covering:

- Current Location
- Saved Address
- Add New Address
- Address Edit / Delete (active)
- Auto Restore (within retention radius)
- Auto Switch (outside retention radius)
- MRU
- Order for Someone Else (remote Saved Address)
- Cart (no silent clear; gate when unserviceable)
- Checkout
- Order Placement
- Multi-device
- Deep Links / Notifications
- Cold Start
- App Resume
- Force Close
- GPS Permission Changes
- Background Movement (decision on next foreground)

**No location-related feature should be merged unless it passes this shared regression suite.**

---

## Tables & APIs

| Piece | Role |
|-------|------|
| `customer_active_location.address_id` | Bound Saved Address (null = Current Location mode) |
| `GET/PUT /v1/me/active-location` | Read/write pin; omit `addressId` to preserve binding |
| `POST /v1/me/active-location/reconcile` | GPS vs retention → keep or switch |
| `ACTIVE_SAVED_ADDRESS_RETENTION_RADIUS_M` | Default 500m; production often 300m |

---

## Reconcile triggers (when GPS retention runs)

| Event | Triggers reconcile? | Notes |
|-------|---------------------|-------|
| Cold start / force-close reopen | **Yes** | Always. Keep if GPS ≤ radius of bound address; else Current Location. |
| App resume (foreground) | **Yes** | First applies backend pin (multi-device), then reconcile. Remote in-session selection preserved. |
| GPS Off → On / Denied → Granted | **Yes** | Via permission sheet / resume when device becomes ready. |
| Background while app suspended | **No continuous poll** | No background GPS reconcile loop. Decision runs on next **foreground** resume. |
| Significant move while foreground + Current Location | Watch updates coords only | Does **not** clear `addressId`. Selected pin is not overwritten by watch. |
| User travels 15–20 km in background | On next resume | Nearby selection → `switched_far` → Current. Remote “order for someone else” → restored for this session until force-close. |

**Policy:** Background movement alone never silently switches location. Switching happens on **cold start** or **resume** when GPS is available and the user is outside the retention radius (except in-session remote selections).

---

## Edit / delete

- **Edit** of the bound address updates `customer_active_location` lat/lng/text on the server.
- **Delete** of the bound address rebinds to the next MRU Saved Address, or clears `addressId` if none remain.

## Cart

Location changes never silently clear the cart. If the cart store becomes unserviceable (or pin moves >15 km from the cart anchor), the Outside Delivery Range gate is shown so the user can change address or clear cart.

## Multi-device

Device B picks up Device A’s active pin on **AppState → active** via `GET /active-location` before GPS reconcile.

## Logout / login / session

- Logout clears local pin + reconcile gate.
- Login with a new session resets local pin; bootstrap loads fresh backend SoT.
- Token refresh must **not** clear location (401 revoke uses logout which correctly clears).

## Deep links

Merchant detail validates backend active location on open (`ensureActiveLocationValidated`) so quotes use the correct drop even when entered from a notification/share link.

## Saved Address MRU ordering

Backend is the single source of truth for Saved Address list order.

| Piece | Role |
|-------|------|
| `customer_addresses.last_used_at` | Persistent MRU timestamp (survives logout / multi-device) |
| `customer_addresses.is_last_used` | Convenience flag for the single most-recent row |
| `GET /v1/me/addresses` | Returns rows already sorted: selected → `last_used_at` desc → created_at |

**Bump `last_used_at` when:**

- User selects a Saved Address (`PUT /active-location` with positive `addressId`) — including re-select of the same id
- User places an order that uses a Saved Address
- Backend auto-restores a nearby Saved Address (`reconcile` → `kept_nearby`)

**Do not bump when:**

- GPS-only coord sync (`PUT` omits `addressId`)
- User switches to Current Location (`addressId: null`)
- Reconcile `switched_far` / `no_bound_address`

Frontend must render the list in API order (dedupe only). Never sort by distance or `isDefault` for the Saved Addresses section.
