# Order Placement Flow – Database Tables

This document lists **all database tables** involved in the order placement flow (cart → payment → finalize → success → tracking). Tables are grouped by role.

---

## 1. Tables Used in Payment-First Order Placement

### 1.1 Pending order (lock cart until payment)

| Table | Role |
|-------|------|
| **pending_orders** | Stores cart snapshot, address, amounts, Razorpay order id, expiry. After payment: `finalizedOrderId` and `finalizedAt` are set. |

**Key columns (pending_orders):**  
`pending_id`, `customer_id`, `merchant_store_id`, `items_snapshot`, `address_id_used`, `payment_method`, `tip_amount`, `donation_amount`, `item_total`, `addon_total`, `grand_total`, `currency`, `delivery_address`, `drop_lat`, `drop_lon`, `pickup_*`, `razorpay_order_id`, `finalized_order_id`, `finalized_at`, `expires_at`.

---

### 1.2 Core order (created on finalize)

| Table | Role |
|-------|------|
| **core_orders** | Master order row: order_id (e.g. GM-&lt;ts&gt;-&lt;hex&gt;), customer, store, totals, payment status, addresses, placed_at. |
| **core_order_items** | Line items: order_id, menu_item_id, item_name, quantity, base_price, addon_price, total_price, item_snapshot. |
| **core_order_item_addons** | Addons per line item: order_item_id, addon_id/addon_name, addon_price, quantity. |
| **core_payments** | Payment record: order_id, gateway (razorpay), transaction_id, amount, currency, payment_status, gateway_response, paid_at. |

**Flow:** One transaction in `finalizeOrder`: insert into `core_orders` → `core_order_items` → `core_order_item_addons` → `core_payments` → update `pending_orders` → insert `order_events`.

---

### 1.3 Events and audit

| Table | Role |
|-------|------|
| **order_events** | Audit log: order_id, order_source (`core_orders`), event_type (e.g. PLACED), from_status, to_status, payload, actor_type/actor_id, created_at. |

---

## 2. Tables Used for Order Tracking / Realtime (post-placement)

| Table | Role |
|-------|------|
| **order_events** | Status changes and events for live UI. |
| **order_rider_tracking** | Rider location: order_id, rider_id, lat/lng, heading, speed, accuracy, created_at. |
| **order_kitchen_timeline** | Kitchen steps: order_id, step, started_at, completed_at, metadata. |
| **order_eta_snapshots** | ETA history: order_id, eta_seconds, eta_at, trigger_event, distance_km. |

---

## 3. Related Tables (read-only or indirect in placement)

| Table | Role |
|-------|------|
| **orders_core** | Legacy/hybrid order master (different from `core_orders`); used by some service-specific flows. |
| **orders_food** | Food-specific order view: links to `orders_core.id`, core_order_id, merchant_store_id, restaurant_name, order_status, etc. May be populated by triggers or downstream jobs after `core_orders` insert. |
| **customers** | Resolve auth sub → customer id for pending/finalize. |
| **customer_addresses** | Address used in pending order (`address_id_used`). |
| **merchant_stores** | Store and merchant info for the order. |

---

## 4. Complete List (Order Placement + Tracking)

- **pending_orders**
- **core_orders**
- **core_order_items**
- **core_order_item_addons**
- **core_payments**
- **order_events**
- **order_rider_tracking**
- **order_kitchen_timeline**
- **order_eta_snapshots**
- **orders_core** (legacy/hybrid)
- **orders_food**
- **customers**
- **customer_addresses**
- **merchant_stores** (and related merchant tables as needed for display)

---

## 5. Write Path Summary (Finalize Transaction)

On `POST /v1/orders/finalize` success, a single transaction:

1. **INSERT** `core_orders` (one row).
2. **INSERT** `core_order_items` (one per line item).
3. **INSERT** `core_order_item_addons` (for each addon on items).
4. **INSERT** `core_payments` (one row, Razorpay).
5. **UPDATE** `pending_orders` SET finalized_order_id, finalized_at.
6. **INSERT** `order_events` (one row, event_type = PLACED).

No app reload; frontend navigates to success screen only after this response.
