# Order management tables — purpose and when they are used

This document describes **PostgreSQL tables and views** involved in **creating, paying, fulfilling, and auditing** food orders in the GatiMitra stack. It complements [`ORDER_DOMAIN_SCHEMA.md`](./ORDER_DOMAIN_SCHEMA.md) with a **table-centric** checklist so nothing is skipped at checkout.

**Canonical order reference:** `orders_core.order_id` (text, e.g. `GM…`). Most order-scoped rows use this string as `order_id` or `core_order_id`.

---

## Customer checkout (happy path)

| When | Table / view | Purpose |
|------|----------------|--------|
| User opens checkout | *(none)* | Quotes come from `POST /v1/billing/calculate` only (not persisted as an order). |
| User taps Pay (payment-first) | **`pending_orders`** | Locks cart JSON (`items_snapshot`), computed totals, `billing_snapshot`, optional `checkout_metadata`, TTL, Razorpay order id when created. |
| After successful Razorpay | **`orders_core`** | **Primary** row: money, addresses, distance, `billing_snapshot`, `items` (cart JSON copy), `checkout_metadata`, `donation_amount`, status. |
| Same transaction as core | **`orders_core_items`** | One row per line: names, prices, `item_snapshot`, optional category / veg flags. |
| Same transaction | **`orders_core_item_addons`** | Add-ons per line. |
| Same transaction | **`orders_core_payments`** | Gateway ids, amount, status (`PAID` / `PENDING`). |
| After `orders_core` insert (DB trigger) | **`orders_food`** | Vertical extension: restaurant display, kitchen/OTP fields; app **updates** counts, food subtotal, delivery instructions from checkout metadata. |
| Same transaction (finalize / direct create) | **`order_events`** | Append-only timeline (e.g. `ORDER_FINALIZED`). |

---

## Core tables (detail)

### `pending_orders`

- **Purpose:** Short-lived checkout session before payment completes.
- **When:** `POST /v1/orders/pending` creates/updates; cleared or linked after finalize.
- **Must not skip:** `items_snapshot`, `billing_snapshot`, `grand_total`, address/pickup fields, `checkout_metadata` if the client sends delivery preferences.

### `orders_core`

- **Purpose:** System of record for every placed order.
- **When:** Insert on finalize (pending flow) or on legacy `POST /v1/orders` (single-step).
- **Must not skip:** `order_id`, `grand_total`, `billing_snapshot`, line totals, tip/donation as applicable, `items` (full cart JSON), `checkout_metadata`, delivery coordinates and formatted address.

### `orders_core_items` / `orders_core_item_addons`

- **Purpose:** Normalized line items for reporting, refunds, and kitchen; add-ons per line.
- **When:** Same transaction as `orders_core` insert.
- **Must not skip:** `item_snapshot`; category / veg fields when present on the snapshot.

### `orders_core_payments`

- **Purpose:** Payment attempt and proof (Razorpay ids, amount, status).
- **When:** Same transaction as order creation when payment is known.

### `orders_food`

- **Purpose:** Food-specific columns (restaurant name, item counts, OTP, delivery instructions).
- **When:** Row created by trigger from `orders_core`; application **updates** item counts, food subtotal, and delivery instructions after insert where needed.

### `order_events`

- **Purpose:** Audit trail and status-oriented history (`order_id` text).
- **When:** On finalize and aligned direct-create flows when an order becomes real.

---

## Billing / OMS / ledger (additive)

These attach to the same `orders_core.order_id` for **audit, reconciliation, and refunds**. They are populated when the OMS ledger shadow write is enabled and billing snapshots contain structured lines (see migration `0182` and finalize logic).

| Table | Purpose | When |
|-------|---------|------|
| `order_version_snapshots` | Immutable bill version | After finalize (if enabled) |
| `order_charge_lines` | Charge breakdown | Same |
| `order_tax_lines` | Tax lines | Same |
| `order_discount_lines` | Discount lines | Same |
| `order_bill_summary_versions` | Summary snapshots | Same |
| `payment_intents`, `payment_transactions`, … | Payment state machine | Gateway integrations |
| `refund_intents`, `refund_transactions`, … | Refunds | Refund flows |
| `ledger_*` | Double-entry shadow | If enabled |

---

## Operations and dispatch

| Table | Purpose | When |
|-------|---------|------|
| `delivery_assignments` | Rider assignment | Dispatch |
| `order_rider_tracking` | Live points | Tracking |
| `order_eta_snapshots` | ETA history | ETA updates |

(Exact usage depends on rider/dispatch modules.)

---

## Reporting views

| View | Purpose |
|------|---------|
| `v_order_domain_food` | Join-friendly `orders_core` + `orders_food` for analytics (migration `0189`). |
| `v_order_core_payments_latest` | Latest payment row per order. |

---

## Legacy / parallel objects

| Object | Note |
|--------|------|
| Wide legacy `orders` (if present in DB) | Not the primary write path for this app; prefer reads from `orders_core` + vertical tables. |
| `orders_core_backup` | Backup only. |
| `provider_order_*` | External marketplace IDs. |

---

## Nothing skipped — checklist

For **every** paid food order, ensure persistence of:

1. **`orders_core`** — totals, snapshot, cart JSON, checkout metadata, donation if any.  
2. **`orders_core_items` + addons** — every line and add-on.  
3. **`orders_core_payments`** — at least one row with correct amount and status.  
4. **`orders_food`** — trigger row exists; counts/subtotal/instructions updated as needed.  
5. **`order_events`** — at least one meaningful event for the placement path you use.  
6. **`pending_orders`** — finalized pointer (`finalized_order_id`) when using the pending flow.

Run [`scripts/audit-order-tables.sql`](../scripts/audit-order-tables.sql) periodically to compare database reality to this model.
