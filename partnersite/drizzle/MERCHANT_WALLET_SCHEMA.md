# Merchant Wallet – Complete Schema Documentation

Production-grade merchant wallet system (Swiggy/Zomato-style): double-entry style ledger, balance buckets, commission at withdrawal, penalties as debits, freeze logic.

**Source file:** `drizzle/merchant_wallet.sql`

---

## Table of Contents

1. [Overview & ER](#1-overview--er)
2. [Enums Reference](#2-enums-reference)
3. [Table Definitions](#3-table-definitions)
4. [Indexes](#4-indexes)
5. [Functions](#5-functions)
6. [Triggers](#6-triggers)
7. [Row Level Security](#7-row-level-security)
8. [Business Flows](#8-business-flows)
9. [Best Practices](#9-best-practices)

---

## 1. Overview & ER

### Entity Relationship

- **merchant_wallet** – One row per `merchant_store_id`. Holds balance summary (available, pending, hold, reserve), lifetime aggregates (total_earned, total_withdrawn, total_penalty, total_commission_deducted), and `status` (ACTIVE, SUSPENDED, FROZEN, BLOCKED). Concurrency via `version`.
- **merchant_wallet_ledger** – Immutable append-only log. Each row: direction (CREDIT/DEBIT), category, balance_type, amount, **balance_after** (running snapshot), reference_type + reference_id, optional idempotency_key. No UPDATEs.
- **merchant_wallet_transactions** – One row per logical transaction; links to `ledger_id` for audit.
- **order_settlement_breakdown** – Per-order bill: item_total, packaging, discounts, **merchant_gross**, commission_percentage/amount, **merchant_net**. Only **merchant_net** is credited to wallet; commission is applied at **withdrawal** time.
- **platform_commission_rules** – Commission % by store/parent and date range.
- **merchant_payout_requests** – Withdrawal requests: amount, commission deducted at payout, net_payout_amount, hold_ledger_id / debit_ledger_id, status (PENDING → APPROVED → PROCESSING → COMPLETED).
- **merchant_penalties** – Penalty record; actual balance change is a **DEBIT** ledger entry (reference_type ORDER, reference_id = order_id), not a direct balance update.
- **merchant_subscription** – Placeholder for subscription linkage.

### Relationships

| From | To | Relationship |
|------|-----|--------------|
| merchant_wallet.merchant_store_id | merchant_stores.id | FK |
| merchant_wallet.merchant_parent_id | merchant_parents.id | FK (optional) |
| merchant_wallet_ledger.wallet_id | merchant_wallet.id | FK |
| merchant_wallet_transactions.wallet_id | merchant_wallet.id | FK |
| merchant_wallet_transactions.ledger_id | merchant_wallet_ledger.id | FK (optional) |
| order_settlement_breakdown.order_id | orders.id | FK |
| order_settlement_breakdown.ledger_id | merchant_wallet_ledger.id | FK (optional) |
| order_settlement_breakdown.wallet_id | merchant_wallet.id | FK (optional) |
| merchant_payout_requests.wallet_id | merchant_wallet.id | FK |
| merchant_payout_requests.hold_ledger_id | merchant_wallet_ledger.id | FK (optional) |
| merchant_payout_requests.debit_ledger_id | merchant_wallet_ledger.id | FK (optional) |
| merchant_penalties.wallet_id | merchant_wallet.id | FK |
| merchant_penalties.ledger_id | merchant_wallet_ledger.id | FK (optional) |
| merchant_subscription.merchant_parent_id | merchant_parents.id | FK |
| merchant_subscription.merchant_store_id | merchant_stores.id | FK (optional) |

---

## 2. Enums Reference

### wallet_transaction_direction

| Value   | Description |
|---------|-------------|
| CREDIT  | Money in    |
| DEBIT   | Money out   |

### wallet_transaction_category

| Value                     | Direction | Description |
|---------------------------|-----------|-------------|
| ORDER_EARNING             | CREDIT    | Order settlement (merchant_net) |
| ORDER_ADJUSTMENT          | CREDIT    | Order-related adjustment |
| REFUND_REVERSAL           | CREDIT    | Reversal of refund |
| FAILED_WITHDRAWAL_REVERSAL| CREDIT    | Reversal of failed payout |
| BONUS                     | CREDIT    | Bonus credit |
| CASHBACK                  | CREDIT    | Cashback |
| MANUAL_CREDIT              | CREDIT    | Admin manual credit |
| SUBSCRIPTION_REFUND       | CREDIT    | Subscription refund |
| WITHDRAWAL                 | DEBIT     | Payout to merchant |
| PENALTY                    | DEBIT     | Penalty deduction |
| SUBSCRIPTION_FEE          | DEBIT     | Subscription fee |
| COMMISSION_DEDUCTION      | DEBIT     | Commission at withdrawal |
| ADJUSTMENT                 | DEBIT     | Adjustment |
| REFUND_TO_CUSTOMER        | DEBIT     | Refund to customer |
| MANUAL_DEBIT               | DEBIT     | Admin manual debit |
| TAX_ADJUSTMENT             | DEBIT     | Tax adjustment |

### wallet_balance_type

| Value    | Description |
|----------|-------------|
| AVAILABLE| Withdrawable |
| PENDING  | Earned but not yet released (e.g. T+1/T+3) |
| HOLD     | Held (e.g. pending payout approval) |
| RESERVE  | Disputes / chargebacks |

### wallet_reference_type

| Value       | Description |
|-------------|-------------|
| ORDER       | Order reference |
| WITHDRAWAL  | Withdrawal reference |
| SUBSCRIPTION| Subscription reference |
| PENALTY     | Penalty reference |
| SYSTEM      | System reference |
| ADMIN       | Admin reference |
| REFUND      | Refund reference |

### wallet_status_type

| Value     | Description |
|-----------|-------------|
| ACTIVE    | Normal operations |
| SUSPENDED | Suspended |
| FROZEN    | No debit/withdrawal; credits allowed |
| BLOCKED   | Fully blocked |

### payout_request_status_type

| Value      | Description |
|------------|-------------|
| PENDING    | Awaiting approval |
| APPROVED   | Approved |
| PROCESSING | Being processed |
| COMPLETED  | Successfully completed |
| FAILED     | Failed |
| CANCELLED  | Cancelled |
| REVERSED   | Reversed |

---

## 3. Table Definitions

### 3.1 merchant_wallet

One wallet per merchant store. Ledger-based; balances are snapshots updated atomically with ledger inserts.

| Column                  | Type                 | Nullable | Default | Constraints / Notes |
|-------------------------|----------------------|----------|---------|----------------------|
| id                      | BIGSERIAL            | NO       | nextval | PRIMARY KEY |
| merchant_store_id       | BIGINT               | NO       | -       | UNIQUE, FK → merchant_stores(id) ON DELETE CASCADE |
| merchant_parent_id      | BIGINT               | YES      | -       | FK → merchant_parents(id) ON DELETE SET NULL |
| available_balance       | NUMERIC(14,2)        | NO       | 0       | CHECK (>= 0) |
| pending_balance        | NUMERIC(14,2)        | NO       | 0       | CHECK (>= 0) |
| hold_balance            | NUMERIC(14,2)        | NO       | 0       | CHECK (>= 0) |
| reserve_balance        | NUMERIC(14,2)        | NO       | 0       | CHECK (>= 0) |
| total_earned            | NUMERIC(14,2)        | NO       | 0       | Lifetime aggregate |
| total_withdrawn         | NUMERIC(14,2)        | NO       | 0       | Lifetime aggregate |
| total_penalty           | NUMERIC(14,2)        | NO       | 0       | Lifetime aggregate |
| total_commission_deducted| NUMERIC(14,2)        | NO       | 0       | Lifetime aggregate |
| status                  | wallet_status_type   | NO       | 'ACTIVE'| FROZEN = no withdrawal/debit |
| version                 | INTEGER              | NO       | 0       | Optimistic locking |
| created_at              | TIMESTAMPTZ          | NO       | NOW()   | |
| updated_at              | TIMESTAMPTZ          | NO       | NOW()   | |

---

### 3.2 merchant_wallet_ledger

Immutable ledger. Only INSERT; never UPDATE. Each row has balance_after snapshot.

| Column         | Type                        | Nullable | Default | Constraints / Notes |
|----------------|-----------------------------|----------|---------|----------------------|
| id             | BIGSERIAL                   | NO       | nextval | PRIMARY KEY |
| wallet_id      | BIGINT                      | NO       | -       | FK → merchant_wallet(id) ON DELETE CASCADE |
| direction      | wallet_transaction_direction| NO       | -       | CREDIT or DEBIT |
| category       | wallet_transaction_category | NO       | -       | |
| balance_type   | wallet_balance_type         | NO       | -       | AVAILABLE, PENDING, HOLD, RESERVE |
| amount         | NUMERIC(14,2)               | NO       | -       | CHECK (amount > 0) |
| balance_after  | NUMERIC(14,2)               | NO       | -       | Running balance snapshot |
| reference_type | wallet_reference_type       | NO       | -       | |
| reference_id   | BIGINT                      | YES      | -       | |
| reference_extra| TEXT                        | YES      | -       | |
| idempotency_key| TEXT                        | YES      | -       | UNIQUE; duplicate insert skip |
| description    | TEXT                        | YES      | -       | |
| metadata       | JSONB                       | YES      | '{}'    | |
| created_at     | TIMESTAMPTZ                 | NO       | NOW()   | |

---

### 3.3 merchant_wallet_transactions

Log of every credit/debit; links to ledger row.

| Column         | Type                        | Nullable | Default | Constraints / Notes |
|----------------|-----------------------------|----------|---------|----------------------|
| id             | BIGSERIAL                   | NO       | nextval | PRIMARY KEY |
| wallet_id      | BIGINT                      | NO       | -       | FK → merchant_wallet(id) ON DELETE CASCADE |
| ledger_id      | BIGINT                      | YES      | -       | FK → merchant_wallet_ledger(id) ON DELETE SET NULL |
| direction      | wallet_transaction_direction| NO       | -       | |
| category       | wallet_transaction_category | NO       | -       | |
| amount         | NUMERIC(14,2)               | NO       | -       | CHECK (amount > 0) |
| reference_type | wallet_reference_type       | NO       | -       | |
| reference_id   | BIGINT                      | YES      | -       | |
| reference_extra | TEXT                        | YES      | -       | |
| idempotency_key| TEXT                        | YES      | -       | UNIQUE |
| description    | TEXT                        | YES      | -       | |
| metadata       | JSONB                       | YES      | '{}'    | |
| created_at     | TIMESTAMPTZ                 | NO       | NOW()   | |

---

### 3.4 order_settlement_breakdown

Per-order bill breakdown. merchant_net = amount credited to wallet. Commission deducted at withdrawal, not at credit.

| Column                   | Type          | Nullable | Default | Constraints / Notes |
|--------------------------|---------------|----------|---------|----------------------|
| id                       | BIGSERIAL     | NO       | nextval | PRIMARY KEY |
| order_id                  | BIGINT        | NO       | -       | FK → orders(id) ON DELETE CASCADE, UNIQUE |
| item_total               | NUMERIC(12,2) | NO       | 0       | |
| gst_amount               | NUMERIC(12,2) | NO       | 0       | |
| packaging_charge         | NUMERIC(12,2) | NO       | 0       | |
| delivery_fee             | NUMERIC(12,2) | NO       | 0       | |
| platform_fee             | NUMERIC(12,2) | NO       | 0       | |
| coupon_discount          | NUMERIC(12,2) | NO       | 0       | |
| merchant_funded_discount | NUMERIC(12,2) | NO       | 0       | |
| merchant_gross           | NUMERIC(12,2) | NO       | 0       | item_total + packaging - merchant_funded_discount |
| commission_percentage     | NUMERIC(5,2)  | NO       | 0       | |
| commission_amount        | NUMERIC(12,2) | NO       | 0       | |
| merchant_net             | NUMERIC(12,2) | NO       | 0       | Credited to wallet |
| settled                  | BOOLEAN       | NO       | FALSE   | |
| settled_at               | TIMESTAMPTZ   | YES      | -       | |
| ledger_id                | BIGINT        | YES      | -       | FK → merchant_wallet_ledger(id) ON DELETE SET NULL |
| wallet_id                | BIGINT        | YES      | -       | FK → merchant_wallet(id) ON DELETE SET NULL |
| created_at               | TIMESTAMPTZ   | NO       | NOW()   | |
| updated_at               | TIMESTAMPTZ   | NO       | NOW()   | |

---

### 3.5 platform_commission_rules

Commission % by store/parent and date range.

| Column                | Type          | Nullable | Default       | Constraints / Notes |
|-----------------------|---------------|----------|---------------|----------------------|
| id                    | BIGSERIAL     | NO       | nextval       | PRIMARY KEY |
| merchant_parent_id    | BIGINT        | YES      | -             | FK → merchant_parents(id) ON DELETE CASCADE |
| merchant_store_id     | BIGINT        | YES      | -             | FK → merchant_stores(id) ON DELETE CASCADE |
| commission_percentage  | NUMERIC(5,2)  | NO       | -             | CHECK (0–100) |
| effective_from        | DATE          | NO       | CURRENT_DATE  | |
| effective_to          | DATE          | YES      | -             | |
| is_default            | BOOLEAN       | NO       | FALSE         | |
| created_at            | TIMESTAMPTZ   | NO       | NOW()         | |
| updated_at            | TIMESTAMPTZ   | NO       | NOW()         | |

Constraint: at least one of merchant_store_id or merchant_parent_id must be NOT NULL.

---

### 3.6 merchant_payout_requests

Withdrawal flow; hold until approval, then debit on completion.

| Column             | Type                      | Nullable | Default | Constraints / Notes |
|--------------------|---------------------------|----------|---------|----------------------|
| id                 | BIGSERIAL                 | NO       | nextval | PRIMARY KEY |
| wallet_id          | BIGINT                    | NO       | -       | FK → merchant_wallet(id) ON DELETE CASCADE |
| amount             | NUMERIC(14,2)             | NO       | -       | CHECK (amount > 0) |
| status             | payout_request_status_type| NO       | 'PENDING' | |
| commission_percentage| NUMERIC(5,2)             | NO       | 0       | |
| commission_amount  | NUMERIC(14,2)             | NO       | 0       | |
| net_payout_amount  | NUMERIC(14,2)             | NO       | -       | |
| hold_ledger_id     | BIGINT                    | YES      | -       | FK → merchant_wallet_ledger(id) ON DELETE SET NULL |
| debit_ledger_id    | BIGINT                    | YES      | -       | FK → merchant_wallet_ledger(id) ON DELETE SET NULL |
| bank_account_id    | BIGINT                    | YES      | -       | |
| utr_reference      | TEXT                      | YES      | -       | |
| failure_reason     | TEXT                      | YES      | -       | |
| requested_at       | TIMESTAMPTZ               | NO       | NOW()   | |
| approved_at        | TIMESTAMPTZ               | YES      | -       | |
| processed_at       | TIMESTAMPTZ               | YES      | -       | |
| completed_at       | TIMESTAMPTZ               | YES      | -       | |
| created_at         | TIMESTAMPTZ               | NO       | NOW()   | |
| updated_at         | TIMESTAMPTZ               | NO       | NOW()   | |

---

### 3.7 merchant_penalties

Penalty creates a DEBIT ledger entry; balance is reduced via ledger, not by direct update.

| Column        | Type                  | Nullable | Default  | Constraints / Notes |
|---------------|-----------------------|----------|----------|----------------------|
| id            | BIGSERIAL             | NO       | nextval  | PRIMARY KEY |
| wallet_id     | BIGINT                | NO       | -        | FK → merchant_wallet(id) ON DELETE CASCADE |
| amount        | NUMERIC(14,2)         | NO       | -        | CHECK (amount > 0) |
| reason        | TEXT                  | NO       | -        | |
| penalty_type  | TEXT                  | YES      | -        | |
| reference_type| wallet_reference_type | NO       | 'ORDER'  | |
| reference_id  | BIGINT                | YES      | -        | e.g. order_id |
| ledger_id     | BIGINT                | YES      | -        | FK → merchant_wallet_ledger(id) ON DELETE SET NULL |
| status        | TEXT                  | NO       | 'APPLIED'| |
| created_at    | TIMESTAMPTZ           | NO       | NOW()    | |

---

### 3.8 merchant_subscription

Minimal placeholder for wallet context; can align with existing merchant_subscriptions.

| Column             | Type        | Nullable | Default | Constraints / Notes |
|--------------------|-------------|----------|---------|----------------------|
| id                 | BIGSERIAL   | NO       | nextval | PRIMARY KEY |
| merchant_parent_id  | BIGINT      | NO       | -       | FK → merchant_parents(id) ON DELETE CASCADE |
| merchant_store_id  | BIGINT      | YES      | -       | FK → merchant_stores(id) ON DELETE SET NULL |
| plan_id            | BIGINT      | YES      | -       | |
| status             | TEXT        | NO       | 'ACTIVE'| |
| started_at         | TIMESTAMPTZ | NO       | NOW()   | |
| ends_at            | TIMESTAMPTZ | YES      | -       | |
| created_at         | TIMESTAMPTZ | NO       | NOW()   | |
| updated_at         | TIMESTAMPTZ | NO       | NOW()   | |

---

## 4. Indexes

| Table                         | Index Name                                      | Columns / Condition |
|-------------------------------|--------------------------------------------------|----------------------|
| merchant_wallet               | merchant_wallet_merchant_store_id_idx            | merchant_store_id |
| merchant_wallet               | merchant_wallet_merchant_parent_id_idx           | merchant_parent_id WHERE merchant_parent_id IS NOT NULL |
| merchant_wallet               | merchant_wallet_status_idx                      | status |
| merchant_wallet_ledger        | merchant_wallet_ledger_idempotency_key_idx      | idempotency_key WHERE idempotency_key IS NOT NULL (UNIQUE) |
| merchant_wallet_ledger        | merchant_wallet_ledger_wallet_id_created_idx    | wallet_id, created_at DESC |
| merchant_wallet_ledger        | merchant_wallet_ledger_reference_idx            | reference_type, reference_id WHERE reference_id IS NOT NULL |
| merchant_wallet_ledger        | merchant_wallet_ledger_created_at_idx           | created_at |
| merchant_wallet_transactions  | merchant_wallet_transactions_wallet_id_created_idx | wallet_id, created_at DESC |
| merchant_wallet_transactions  | merchant_wallet_transactions_reference_idx      | reference_type, reference_id WHERE reference_id IS NOT NULL |
| merchant_wallet_transactions  | merchant_wallet_transactions_idempotency_key_idx| idempotency_key WHERE idempotency_key IS NOT NULL (UNIQUE) |
| order_settlement_breakdown    | order_settlement_breakdown_order_id_idx         | order_id |
| order_settlement_breakdown    | order_settlement_breakdown_settled_idx          | settled WHERE settled = FALSE |
| order_settlement_breakdown    | order_settlement_breakdown_wallet_id_idx        | wallet_id WHERE wallet_id IS NOT NULL |
| platform_commission_rules    | platform_commission_rules_store_id_idx          | merchant_store_id WHERE merchant_store_id IS NOT NULL |
| platform_commission_rules    | platform_commission_rules_parent_id_idx        | merchant_parent_id WHERE merchant_parent_id IS NOT NULL |
| platform_commission_rules    | platform_commission_rules_effective_idx        | effective_from, effective_to |
| merchant_payout_requests      | merchant_payout_requests_wallet_id_idx         | wallet_id |
| merchant_payout_requests      | merchant_payout_requests_status_idx             | status |
| merchant_payout_requests      | merchant_payout_requests_requested_at_idx       | requested_at DESC |
| merchant_penalties            | merchant_penalties_wallet_id_idx                | wallet_id |
| merchant_penalties            | merchant_penalties_reference_idx                | reference_type, reference_id WHERE reference_id IS NOT NULL |
| merchant_penalties            | merchant_penalties_created_at_idx               | created_at DESC |
| merchant_subscription        | merchant_subscription_merchant_store_id_idx     | merchant_store_id WHERE merchant_store_id IS NOT NULL |
| merchant_subscription        | merchant_subscription_merchant_parent_id_idx    | merchant_parent_id |

---

## 5. Functions

### get_or_create_merchant_wallet(p_merchant_store_id BIGINT) RETURNS BIGINT

- **Purpose:** Returns wallet id for the given merchant store; creates one if missing.
- **Logic:** SELECT wallet id by merchant_store_id; if not found, get parent_id from merchant_stores, INSERT into merchant_wallet (with ON CONFLICT on merchant_store_id DO UPDATE updated_at), RETURNING id.
- **Security:** SECURITY DEFINER.

---

### merchant_wallet_credit(...) RETURNS BIGINT

**Parameters:**

- p_wallet_id BIGINT  
- p_amount NUMERIC(14,2)  
- p_category wallet_transaction_category  
- p_balance_type wallet_balance_type  
- p_reference_type wallet_reference_type  
- p_reference_id BIGINT  
- p_idempotency_key TEXT DEFAULT NULL  
- p_description TEXT DEFAULT NULL  
- p_metadata JSONB DEFAULT '{}'

**Behavior:**

- Validates amount > 0.
- If p_idempotency_key is set and already exists in ledger, returns existing ledger id (idempotent).
- Locks wallet row (FOR UPDATE), reads balances and version.
- Computes new balance for the chosen balance_type (AVAILABLE, PENDING, HOLD, RESERVE).
- Inserts one row into merchant_wallet_ledger (CREDIT, balance_after).
- Updates merchant_wallet: balances, total_earned (if category = ORDER_EARNING), version = version + 1, updated_at. Fails if version changed (optimistic lock).
- Inserts one row into merchant_wallet_transactions.
- Returns new ledger id.

**Security:** SECURITY DEFINER.

---

### merchant_wallet_debit(...) RETURNS BIGINT

**Parameters:** Same as credit (p_wallet_id, p_amount, p_category, p_balance_type, p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata).

**Behavior:**

- Validates amount > 0.
- Idempotency: if p_idempotency_key exists in ledger, returns existing ledger id.
- Locks wallet, reads balances, version, and **status**.
- If status IN ('FROZEN','BLOCKED','SUSPENDED'), raises exception (debit not allowed).
- For chosen balance_type, checks sufficient balance, computes balance_after (subtract).
- Inserts one row into merchant_wallet_ledger (DEBIT, balance_after).
- Updates merchant_wallet: balances, total_withdrawn (if WITHDRAWAL), total_penalty (if PENALTY), total_commission_deducted (if COMMISSION_DEDUCTION), version, updated_at. Fails if version changed.
- Inserts one row into merchant_wallet_transactions.
- Returns new ledger id.

**Security:** SECURITY DEFINER.

---

## 6. Triggers

| Table            | Trigger Name                      | When       | Function                          |
|------------------|-----------------------------------|------------|-----------------------------------|
| merchant_wallet  | merchant_wallet_updated_at_trigger| BEFORE UPDATE | update_merchant_wallet_updated_at() |

**update_merchant_wallet_updated_at():** Sets NEW.updated_at = NOW().

---

## 7. Row Level Security

RLS is **enabled** on:

- merchant_wallet  
- merchant_wallet_ledger  
- merchant_wallet_transactions  
- order_settlement_breakdown  
- merchant_payout_requests  
- merchant_penalties  

Policies must be added as per application requirements.

---

## 8. Business Flows

### Order Earning (when order status = DELIVERED)

- **merchant_gross** = item_total + packaging_charge − merchant_funded_discount  
- **platform_commission** = merchant_gross × commission_percentage (applied at **withdrawal**)  
- **merchant_net** = amount credited to wallet when order is settled  

1. Ensure `order_settlement_breakdown` exists for the order (e.g. from bill generation).  
2. On DELIVERED, call `merchant_wallet_credit` with category ORDER_EARNING, balance_type AVAILABLE (or PENDING for T+1), reference_type ORDER, reference_id = order_id, idempotency_key = `order_settle_<order_id>`.  
3. Update `order_settlement_breakdown`: set settled = TRUE, settled_at = NOW(), ledger_id = return value, wallet_id = wallet id.

### Penalty Flow

- Do **not** update wallet balance directly.  
- Call `merchant_wallet_debit` with category PENALTY, balance_type AVAILABLE, reference_type ORDER, reference_id = order_id, idempotency_key = e.g. `penalty_<order_id>_<reason>`.  
- Insert into **merchant_penalties** with same amount, reason, reference_type, reference_id, ledger_id (returned from debit), status = 'APPLIED'.

### Withdrawal Flow (commission at withdrawal)

1. **Request:** Insert `merchant_payout_requests` (amount, status = PENDING). Optionally move amount from AVAILABLE to HOLD (credit HOLD + debit AVAILABLE).  
2. **Approval:**  
   - Compute commission (e.g. from `platform_commission_rules`).  
   - net_payout = amount − commission.  
   - Debit COMMISSION_DEDUCTION from AVAILABLE (commission_amount).  
   - Debit WITHDRAWAL from AVAILABLE (net_payout_amount).  
   - Update `merchant_payout_requests`: debit_ledger_id(s), commission_amount, net_payout_amount, status = COMPLETED, completed_at = NOW().  
3. **Failed payout:** Credit back with category FAILED_WITHDRAWAL_REVERSAL (idempotency by request id).

---

## 9. Best Practices

- **Immutable ledger:** Never UPDATE `merchant_wallet_ledger`; only INSERT. Use `balance_after` for audit and reconciliation.  
- **Idempotency:** Always pass `idempotency_key` for order settlement and penalties (e.g. `order_settle_<order_id>`, `penalty_<order_id>_<reason>`) so retries do not double-credit or double-debit.  
- **Atomicity:** Use a single DB transaction for: ledger INSERT → wallet summary UPDATE → transaction log INSERT. The provided `merchant_wallet_credit` and `merchant_wallet_debit` functions do this with row-level locking.  
- **Concurrency:** Wallet row is locked with `FOR UPDATE` and `version` is incremented; if version check fails, application should retry.  
- **Audit:** Use `merchant_wallet_transactions` and `merchant_wallet_ledger` for history; `order_settlement_breakdown` for per-order breakdown and `merchant_net` credited.  
- **Freeze:** When status = FROZEN (or BLOCKED/SUSPENDED), debits and withdrawals are disallowed; credits are still allowed (enforced in `merchant_wallet_debit`).

---

**Last Updated:** 2025-02-18
