# Order Placement Flow – Database Tables

This document lists **all database tables** involved in the order placement flow (cart → payment → finalize → success → tracking). **orders_core** is the **primary** order table. All relations, SQL, triggers, and placement flow use **orders_core** only (canonical `order_id` e.g. GM10000001).

---

## 1. Tables Used in Payment-First Order Placement

### 1.1 Pending order (lock cart until payment)

| Table | Role |
|-------|------|
| **pending_orders** | Stores cart snapshot, address, amounts, Razorpay order id, expiry. After payment: `finalized_order_id` (orders_core.order_id) and `finalized_at` are set. |

**Key columns (pending_orders):**  
`pending_id`, `customer_id`, `merchant_store_id`, `items_snapshot`, `address_id_used`, `payment_method`, `tip_amount`, `donation_amount`, `item_total`, `addon_total`, `grand_total`, `currency`, `delivery_address`, `drop_lat`, `drop_lon`, `pickup_*`, `razorpay_order_id`, `finalized_order_id`, `finalized_at`, `expires_at`.

---

### 1.2 Core order (created on finalize)

| Table | Role |
|-------|------|
| **orders_core** | Main order table. `order_id` (e.g. GM10000001) from sequence; customer, store, totals, payment status, addresses, placed_at. |
| **orders_core_items** | Line items: order_id → orders_core.order_id, menu_item_id, item_name, quantity, base_price, addon_price, total_price, item_snapshot. |
| **orders_core_item_addons** | Addons per line item: order_item_id → orders_core_items.id, addon_id/addon_name, addon_price, quantity. |
| **orders_core_payments** | Payment record: order_id → orders_core.order_id, gateway (razorpay), transaction_id, amount, currency, payment_status, gateway_response, paid_at. |

**Flow:** One transaction in `finalizeOrder`: INSERT → orders_core → orders_core_items → orders_core_item_addons → orders_core_payments → UPDATE pending_orders → triggers insert orders_food + order_events.

---

### 1.3 Events and audit

| Table | Role |
|-------|------|
| **order_events** | Audit log: order_id, order_source (`orders_core`), event_type (e.g. PLACED), from_status, to_status, payload, actor_type/actor_id, created_at. |

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
| **orders_food** | Food-specific view: core_order_id = orders_core.order_id (or order_id = orders_core.id for legacy); merchant_store_id, restaurant_name, order_status; populated by trigger on orders_core INSERT. |
| **customers** | Resolve auth sub → customer id for pending/finalize. |
| **customer_addresses** | Address used in pending order (`address_id_used`). |
| **merchant_stores** | Store and merchant info for the order. |

---

## 4. Complete List (Order Placement + Tracking)

- **pending_orders**
- **orders_core**
- **orders_core_items**
- **orders_core_item_addons**
- **orders_core_payments**
- **order_events**
- **order_rider_tracking**
- **order_kitchen_timeline**
- **order_eta_snapshots**
- **orders_food**
- **customers**
- **customer_addresses**
- **merchant_stores** (and related merchant tables as needed for display)

---

## 5. Write Path Summary (Finalize Transaction)

On `POST /v1/orders/finalize` success, a single transaction:

1. **SELECT** next `order_id` from sequence: `'GM' || nextval('order_id_seq')` (e.g. GM10000001).
2. **INSERT** `orders_core` (one row).
3. **INSERT** `orders_core_items` (one per line item).
4. **INSERT** `orders_core_item_addons` (for each addon on items).
5. **INSERT** `orders_core_payments` (one row, Razorpay).
6. **UPDATE** `pending_orders` SET finalized_order_id, finalized_at.
7. **Triggers:** INSERT into `orders_food`, INSERT into `order_events` (PLACED).

No app reload; frontend navigates to success screen only after this response.

See **docs/order-placement-flow.md** for full schema diagram, API lifecycle, and success navigation flow.
