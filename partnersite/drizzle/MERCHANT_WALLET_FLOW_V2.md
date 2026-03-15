# Merchant Wallet – Industry-Standard Flows (Swiggy/Zomato-style)

This document describes the **correct financial separation** and **per-order settlement** so the system is audit-safe and GST-compliant. It aligns with the existing `merchant_wallet.sql` and the **V2 corrections** in `merchant_wallet_v2_industry_standard.sql`.

---

## 1. Financial Flows (Never Mix These)

| Flow | What it is | Where it lives |
|------|------------|----------------|
| **Customer Payment** | What the customer pays (order total, GST, delivery, etc.) | `order_payments`, bill generation |
| **Merchant Earning** | Merchant’s share: base + GST collected − commission − commission GST − TDS | `order_settlement_breakdown.merchant_net` → wallet |
| **Platform Revenue** | Commission, delivery fee, platform fee | Commission per order; delivery in order totals |
| **Tax Flow** | GST on food (merchant); GST on commission (merchant pays to platform) | `order_settlement_breakdown`, GST ledger |
| **Settlement Flow** | When and how wallet is credited and when merchant can withdraw | Wallet credit on DELIVERED; lock → release; withdrawal |

---

## 2. What the Merchant Wallet Shows

The wallet must show **NET_SETTLEMENT_AMOUNT**, not gross.

- **available_balance** – Withdrawable (after refund window).
- **locked_balance** – In refund window; moves to available after N days.
- **pending_settlement** – Optional T+1/T+3 not-yet-released.
- **lifetime_credit / lifetime_debit** – Audit totals.

Do **not** show full order value in the wallet. Credit only **merchant_net** per order.

---

## 3. Per-Order Calculation (Correct Formula)

### Inputs (example)

- Item: ₹100, Packaging: ₹10, Addon: ₹20 → **Subtotal ₹130**
- Merchant offer: ₹15
- Platform coupon: ₹10 (does not reduce merchant payout unless contract says so)
- Delivery: ₹25 (platform revenue)
- GST on food: 5%
- Commission: 15% on base (excluding GST)
- GST on commission: 18%
- TDS: 1%

### Step 1 – Merchant base (after merchant discount)

```
Item + Packaging + Addon = 130
130 − Merchant offer (15) = 115  →  merchant_base_after_discount = 115
```

### Step 2 – GST (food)

```
115 × 5% = 5.75  →  gst_collected = 5.75
Customer pays (food part) = 120.75
```

GST on food belongs to the merchant (if GST registered). Do not deduct it from the merchant.

### Step 3 – Commission (on base, excluding GST)

```
115 × 15% = 17.25  →  commission_amount
17.25 × 18% = 3.105  →  commission_gst_amount
```

### Step 4 – TDS

```
115 × 1% = 1.15  →  tds_amount
```

### Step 5 – Net settlement (credit to wallet)

```
merchant_base_after_discount    115.00
+ gst_collected                  5.75
− commission_amount            17.25
− commission_gst_amount         3.105
− tds_amount                    1.15
────────────────────────────────────
Net Settlement                  99.245  →  merchant_net
```

**Only this amount (99.245) is credited to the wallet**, not ₹115 or ₹130.

Store in `order_settlement_breakdown`:

- `merchant_base_after_discount`, `gst_collected`, `commission_amount`, `commission_gst_amount`, `tds_amount`, `merchant_net`, `refund_window_days`, `locked_until`.

---

## 4. When to Credit the Wallet

- Credit **only** when order status = **DELIVERED** (or pickup completed in self-delivery).
- Do **not** credit on order placement or payment.

Flow:

1. On **DELIVERED**: call `merchant_wallet_credit_to_locked(wallet_id, merchant_net, order_id, idempotency_key, gst_amount, commission_amount, tds_amount, ...)`.
2. Amount goes to **locked_balance** (refund window).
3. Set `order_settlement_breakdown.settled = TRUE`, `ledger_id`, `wallet_id`, `locked_until = delivered_at + refund_window_days`.
4. After **refund window** (e.g. 3 days): scheduler calls `merchant_wallet_release_locked(wallet_id, amount, order_id, idempotency_key)` to move from locked to **available_balance**.

---

## 5. Wallet Structure (After V2)

| Column | Meaning |
|--------|--------|
| **available_balance** | Withdrawable; can go negative on penalty if allowed |
| **locked_balance** | In refund window; not withdrawable |
| **pending_balance** | Legacy / optional T+1 |
| **pending_settlement** | Same idea (earnings not yet released) |
| **hold_balance** | Held for payout approval |
| **reserve_balance** | Disputes / chargebacks |
| **lifetime_credit** | Total ever credited |
| **lifetime_debit** | Total ever debited |
| **total_earned** | Order earnings |
| **total_withdrawn** | Withdrawals |
| **total_penalty** | Penalties |
| **total_commission_deducted** | Commission (per order) |

---

## 6. Transaction Types (Enums)

Use for ledger/transaction category:

- **ORDER_CREDIT** → ORDER_EARNING (credit to locked)
- **ORDER_LOCK** / **ORDER_RELEASE** → Refund window lock/release
- **WITHDRAWAL_DEBIT** → Withdrawal
- **WITHDRAWAL_REVERSAL** → Failed payout reversal
- **PENALTY_DEBIT** / **PENALTY_REVERSAL**
- **SUBSCRIPTION_DEBIT** / **BONUS_CREDIT**
- **REFUND_DEBIT** → Deduct from locked or available on refund
- **COMMISSION_DEBIT** / **TDS_DEBIT** / **GST_DEBIT** / **GST_CREDIT**
- **ADJUSTMENT_CREDIT** / **ADJUSTMENT_DEBIT**
- **HOLD_LOCK** / **HOLD_RELEASE**
- **FAILED_SETTLEMENT_REVERSAL**

(V2 migration adds these to `wallet_transaction_category` where missing.)

---

## 7. Locked Amount (Refund Window)

- On **order delivered** → credit **merchant_net** to **locked_balance**.
- On **refund** → debit from **locked_balance** (or available if already released).
- After **refund_window_days** (e.g. 3–7) → run `merchant_wallet_release_locked` to move amount to **available_balance**.

---

## 8. GST Handling

- **Merchant GST registered**: GST on food is merchant’s; GST on commission is payable by merchant to platform. Keep separate GST ledger entries (GST_DEBIT / GST_CREDIT).
- **Merchant not GST registered**: Platform handles GST as per policy (e.g. absorb or simplified).

---

## 9. Withdrawal Flow (No Commission at Withdrawal)

Commission is **already deducted per order**. At withdrawal:

1. Check **available_balance**.
2. Debit **available_balance** (withdrawal amount).
3. Create **merchant_payout_requests** (amount = requested; commission_amount = 0; net_payout_amount = amount).
4. If payout **fails** → reverse: credit back with category **WITHDRAWAL_REVERSAL** (idempotency by request id).
5. Generate **merchant_commission_invoices** as snapshot for the period (for reporting, not for deducting again).

---

## 10. Penalties

- Create **merchant_penalties** row and call **merchant_wallet_debit** (category PENALTY, balance_type AVAILABLE).
- If **available_balance** is insufficient, allow **negative** balance (V2 drops the >= 0 check on available_balance).

---

## 11. Database Tables (Summary)

| Table | Purpose |
|-------|--------|
| **merchant_wallet** | One per store; balances + lifetime stats |
| **merchant_wallet_ledger** | Immutable ledger; balance_before/after, gst/commission/tds, order_id |
| **merchant_wallet_transactions** | Log per credit/debit; links to ledger |
| **order_settlement_breakdown** | Per-order: base, GST, commission, TDS, merchant_net, locked_until |
| **merchant_settlement_batches** | Settlement cycle batches (V2) |
| **merchant_commission_invoices** | Invoice snapshot per period/withdrawal (V2) |
| **merchant_payout_requests** | Withdrawal requests (no commission at withdrawal) |
| **merchant_penalties** | Penalty records; balance change via ledger |
| **platform_commission_rules** | Commission % by store/parent/date |

---

## 12. Automation (Application + DB)

1. **Order DELIVERED** → Compute `merchant_net` (and components), upsert `order_settlement_breakdown`, call `merchant_wallet_credit_to_locked`, update breakdown `settled`, `ledger_id`, `wallet_id`, `locked_until`.
2. **Refund** → Debit from locked (or available) with REFUND_DEBIT; link to order/refund.
3. **Refund window expiry** → Scheduler: for each `order_settlement_breakdown` where `locked_until <= NOW()` and not yet released, call `merchant_wallet_release_locked`.
4. **Withdrawal** → Debit available; create payout request; on failure, credit WITHDRAWAL_REVERSAL.
5. **Penalty** → Insert penalty row; call `merchant_wallet_debit` (PENALTY).

All in **transaction-safe** blocks (single DB transaction per operation).

---

## 13. Existing vs V2 Changes

| Aspect | Existing (merchant_wallet.sql) | V2 (industry standard) |
|--------|--------------------------------|--------------------------|
| Commission | “At withdrawal” | **Per order** (in merchant_net) |
| Wallet credit | merchant_net to AVAILABLE | merchant_net to **LOCKED** first, then release to AVAILABLE |
| Balance types | AVAILABLE, PENDING, HOLD, RESERVE | + **LOCKED**, + pending_settlement, lifetime_credit/debit |
| order_settlement_breakdown | commission_amount, merchant_net | + tds_amount, commission_gst_amount, gst_collected, merchant_base_after_discount, refund_window_days, locked_until |
| Ledger | amount, balance_after | + balance_before, gst_amount, commission_amount, tds_amount, order_id |
| Payout | commission at withdrawal | **No** commission at withdrawal; net_payout = amount |
| Negative balance | available_balance >= 0 | Allowed (e.g. for penalties) |
| New tables | — | **merchant_settlement_batches**, **merchant_commission_invoices** |
| New functions | credit, debit | **merchant_wallet_credit_to_locked**, **merchant_wallet_release_locked** |

---

**Last updated:** 2025-02-21
