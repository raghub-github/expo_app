# Order Placement Flow

This document describes the **order placement** system after the migration to `orders_core` as the single source of truth: DB schema, transaction flow, table relations, API lifecycle, success navigation, and rollback logic.

---

## 1. Database Schema (orders_core as main table)

### 1.1 Main order table: `orders_core`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key (legacy / rider flow). |
| **`order_id`** | TEXT UNIQUE | **Canonical order id** (e.g. `GM10000001`, `GM10000002`). From sequence `order_id_seq`. |
| `order_uuid` | UUID | Internal UUID. |
| `order_type` | order_type | e.g. FOOD. |
| `order_source` | order_source_type | e.g. internal. |
| `customer_id` | BIGINT | FK customers. |
| `merchant_store_id` | BIGINT | Store. |
| `merchant_parent_id` | BIGINT | Optional. |
| `status` | order_status_type | assigned, accepted, delivered, etc. |
| `current_status` | TEXT | e.g. PLACED. |
| `item_total` | NUMERIC(12,2) | From placement. |
| `addon_total` | NUMERIC(12,2) | From placement. |
| `grand_total` | NUMERIC(12,2) | From placement. |
| `tip_amount` | NUMERIC(12,2) | From placement. |
| `placed_at` | TIMESTAMPTZ | When order was placed. |
| `payment_status` | payment_status_type | completed, pending, etc. |
| `payment_method` | payment_method_type | upi, card, etc. |
| `pickup_address_raw`, `pickup_lat`, `pickup_lon` | — | Required. |
| `drop_address_raw`, `drop_lat`, `drop_lon` | — | Required. |
| `delivery_address` | TEXT | Snapshot. |
| `distance_km` | NUMERIC | Optional. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Audit. |

**Order ID format:** `GM` + next value from `order_id_seq` (sequence starts at `10000001`). Example: `GM10000001`, `GM10000002`. One increment per new order.

### 1.2 Related tables (all reference `orders_core.order_id`)

| Table | Role | FK |
|-------|------|-----|
| **orders_core_items** | Line items per order | `order_id` → `orders_core.order_id` (CASCADE) |
| **orders_core_item_addons** | Addons per line item | `order_item_id` → `orders_core_items.id` (CASCADE) |
| **orders_core_payments** | Payment record per order | `order_id` → `orders_core.order_id` (SET NULL) |
| **pending_orders** | Locked cart until payment | `finalized_order_id` stores `orders_core.order_id` after finalize |
| **order_events** | Audit / realtime events | `order_id` (text), `order_source` = `'orders_core'` |
| **orders_food** | Food view for kitchen/rider | `core_order_id` = `orders_core.order_id` (trigger-populated) |

### 1.3 Schema diagram (logical)

```
order_id_seq (10000001, 10000002, ...)
       │
       ▼
orders_core (id, order_id UNIQUE, customer_id, merchant_store_id, item_total, addon_total, grand_total, tip_amount, placed_at, current_status, ...)
       │
       ├── orders_core_items (order_id → orders_core.order_id)
       │        └── orders_core_item_addons (order_item_id → orders_core_items.id)
       │
       ├── orders_core_payments (order_id → orders_core.order_id)
       │
       ├── order_events (order_id, order_source = 'orders_core')
       │
       └── orders_food (core_order_id = orders_core.order_id, via trigger)
```

---

## 2. Transaction flow (finalizeOrder)

Single **atomic** transaction; if any step fails, **full ROLLBACK**.

```
BEGIN;
  1. SELECT ('GM' || nextval('order_id_seq'))::text AS order_id   -- e.g. GM10000001
  2. INSERT INTO orders_core (order_id, customer_id, merchant_store_id, ..., item_total, addon_total, grand_total, tip_amount, placed_at, current_status, ...)
  3. INSERT INTO orders_core_items (order_id, menu_item_id, item_name, quantity, base_price, addon_price, total_price, ...)  -- one per line
  4. INSERT INTO orders_core_item_addons (order_item_id, addon_id, addon_name, addon_price, quantity)  -- for each addon
  5. INSERT INTO orders_core_payments (order_id, payment_gateway, transaction_id, amount, payment_status, paid_at, ...)
  6. UPDATE pending_orders SET finalized_order_id = order_id, finalized_at = now() WHERE pending_id = ?
  7. Trigger(s): after_orders_core_insert_push_food → INSERT orders_food; after_orders_core_insert_emit_placed → INSERT order_events (PLACED)
COMMIT;
```

- **Idempotency:** If `pending_orders.finalized_order_id` is already set, finalize returns existing order without running the transaction again.
- **Rollback:** Any constraint failure, duplicate key, or thrown error inside the transaction causes full rollback; no partial order is left.

---

## 3. Table relations summary

| From | To | Relation |
|------|-----|----------|
| orders_core_items | orders_core | order_id → orders_core.order_id, ON DELETE CASCADE |
| orders_core_item_addons | orders_core_items | order_item_id → orders_core_items.id, ON DELETE CASCADE |
| orders_core_payments | orders_core | order_id → orders_core.order_id, ON DELETE SET NULL |
| pending_orders | (logical) | finalized_order_id stores orders_core.order_id |
| order_events | (logical) | order_id = orders_core.order_id, order_source = 'orders_core' |
| orders_food | (logical) | core_order_id = orders_core.order_id (trigger on orders_core INSERT) |

---

## 4. API lifecycle

### 4.1 Payment-first (recommended)

1. **POST /v1/orders/pending**  
   Creates a row in `pending_orders`; returns `pendingId`, `amount`, `currency`.

2. **POST /v1/payment/create-order**  
   Creates Razorpay order; returns Razorpay `orderId`, `keyId`, `amount`.

3. **Customer pays** in Razorpay WebView.

4. **POST /v1/orders/finalize**  
   - Verifies Razorpay signature.  
   - Loads pending order; if already finalized, returns existing order (idempotent).  
   - Runs the single atomic transaction above.  
   - Returns:

   ```json
   {
     "success": true,
     "order_id": "GM10000001",
     "orderId": "GM10000001",
     "status": "PLACED",
     "totalAmount": 450.00,
     "createdAt": "2025-02-23T..."
   }
   ```

5. **Frontend** uses this response **only**: no reload; navigate to Order Success screen with `orderId`; show confetti, order summary, Track Order button.

### 4.2 Legacy single-call create

- **POST /v1/orders** with payment params in body still supported; uses same sequence and inserts into `orders_core` + `orders_core_items` + `orders_core_item_addons` + `orders_core_payments` in one transaction.

### 4.3 Read APIs

- **GET /v1/orders** — List orders: from `orders_core` for customer; order by `placed_at` / `created_at`; display id = `order_id` ?? `id`.
- **GET /v1/orders/:id** — Detail: resolve by numeric `id` or text `order_id` (e.g. GM10000001) against `orders_core`; items from `orders_core_items` when `order_id` is set.
- **GET /v1/orders/:id/events** — Events for that order (resolve :id to canonical order_id for lookup in `order_events`).
- **GET /v1/orders/:id/eta** — ETA snapshots (same order_id resolution).
- **GET /v1/orders/:id/tracking** — Rider tracking (same order_id resolution).

---

## 5. Success navigation flow

1. **Payment success** (Razorpay callback) → app does **not** reload; WebView closes.
2. **finalizeOrder** mutation **onSuccess** with response `{ orderId, status }`:
   - Close payment modal.
   - Set active order (orderId, status, etc.).
   - Clear cart; invalidate "my-orders".
   - **Navigate immediately:** `navigation.replace("success", { orderId })`.
3. **Order Success screen**:
   - Confetti / success animation.
   - Order summary (order_id, items, total).
   - **Track Order** → `router.replace("/(tabs)/")` then `router.push(\`/orders/${orderId}\`)` (tracking page).
   - **Back to Home** → `router.replace("/(tabs)/")`.

**Forbidden:** App reload after payment; auto redirect to home; delayed redirect (e.g. 2–3 minutes). Navigation is driven **only** by the finalize response and user taps.

---

## 6. Rollback logic

- **Transaction:** All writes (orders_core, orders_core_items, orders_core_item_addons, orders_core_payments, pending_orders update, and trigger-generated orders_food / order_events) happen inside one `db.transaction()`. On any error, the entire transaction is rolled back; no partial order.
- **Application:** On finalize failure, frontend shows error; no navigation to success; user can retry or go back. Idempotency (same payment verified twice) returns existing order instead of failing.

---

## 7. Migration notes (orders_core as primary table)

- **orders_core** is the **primary** order table. All relations, SQL, triggers, and placement flow use **orders_core** only.
- **core_orders** has been **dropped**. All new and migrated orders use **orders_core** with **order_id** (GM10000001 format).
- Tables **orders_core_items**, **orders_core_item_addons**, **orders_core_payments** reference **orders_core.order_id**.
- Triggers on `orders_core`: `after_orders_core_insert_push_food`, `after_orders_core_insert_emit_placed`. Event/ETA functions use only `orders_core`.
- **order_events**, **order_eta_snapshots**, **order_rider_tracking**, **order_kitchen_timeline**: **order_source** default is `'orders_core'`.

---

## 8. Summary checklist

- [x] **orders_core** is the main order table; **order_id** (GM10000001) from **order_id_seq**.
- [x] **orders_core_items**, **orders_core_item_addons**, **orders_core_payments** reference **orders_core.order_id**.
- [x] **finalizeOrder** runs one atomic transaction; full rollback on any failure.
- [x] API returns `{ success: true, order_id, status: "PLACED" }`; frontend navigates with this only.
- [x] Success screen shows immediately after finalize; no app reload; Track Order → tracking page.
- [x] **core_orders** removed; no remaining references.
