# Payout (Withdrawal) System – How It Works

This document explains **how payout is calculated**, **when** commission (and optionally TDS/tax) are deducted, and **which tables** store the data.

---

## 1. When are deductions applied?

- **Commission**: Deducted **at withdrawal request time** (not when order earnings are credited). When the merchant clicks “Withdraw”, we compute commission from `platform_commission_rules` and show: Requested amount − Commission = Net payout. The same commission % and amount are saved with the payout request.
- **TDS / Tax (GST)**: **Not applied in the current payout flow.** The schema and design (e.g. `merchant_wallet_v2_industry_standard.sql`) define TDS/GST for a future “per order settlement” model; the live withdrawal API and UI only use **commission** for now. TDS and tax can be added later using the same pattern (rules table + columns on payout request).

---

## 2. How is payout calculated?

1. Merchant enters **requested amount** (e.g. ₹500).
2. **Commission %** is read from `platform_commission_rules` (by `merchant_store_id` or `merchant_parent_id`, with `effective_from` ≤ today and `effective_to` either NULL or ≥ today). If no rule exists, commission = 0%.
3. **Commission amount** = requested amount × (commission_percentage / 100).
4. **Net payout** = requested amount − commission amount. (When TDS/tax are implemented: net payout = requested − commission − tds − tax.)
5. This breakdown is returned by **GET /api/merchant/payout-quote** and, on submit, saved by **POST /api/merchant/payout-request**.

---

## 3. Which tables are responsible?

| Table | Responsibility |
|-------|----------------|
| **platform_commission_rules** | Stores **commission %** per store or parent: `merchant_store_id` or `merchant_parent_id`, `commission_percentage`, `effective_from`, `effective_to`. Used by payout-quote and payout-request to compute commission at withdrawal time. |
| **merchant_payout_requests** | One row per withdrawal request. Stores **requested amount** and **deductions at request time**: `amount`, `commission_percentage`, `commission_amount`, `net_payout_amount`, plus status, bank_account_id, timestamps. No TDS/tax columns yet; can be added when we implement them. |
| **merchant_wallet** | Holds balance and aggregates: `available_balance`, `total_earned`, `total_withdrawn`, `total_commission_deducted`. Commission is deducted from available when payout is processed (approval flow); `total_commission_deducted` is updated when commission is actually debited. |
| **merchant_wallet_ledger** | Immutable log of every credit/debit. Order earnings create CREDIT entries; withdrawal and commission create DEBIT entries (e.g. WITHDRAWAL, COMMISSION_DEDUCTION). Ledger entries reference `merchant_payout_requests.id` where applicable. |
| **order_settlement_breakdown** (optional/future) | Per-order breakdown: merchant_gross, commission_percentage/amount, merchant_net. In current design, **commission is not deducted at order credit time**; it is deducted at **withdrawal** time. The v2 schema adds TDS/GST columns here for a possible “deduct at settlement” model later. |

---

## 4. Why do I see “Requested amount = You receive” (no deduction)?

If **Requested amount** and **You receive (net payout)** are equal, it means **commission is 0%** for this store. That happens when:

- There is **no row** in `platform_commission_rules` for this `merchant_store_id` (or its `merchant_parent_id`), or  
- The only matching row has `commission_percentage = 0`.

**To apply commission:** Insert (or update) a row in `platform_commission_rules` with the desired `commission_percentage`, and set `effective_from` (and optionally `effective_to`). The next time the merchant opens the withdrawal dialog or requests a payout, the quote and saved request will include that commission.

---

## 5. Where is commission/TDS/tax data when we have already deducted?

- **Commission**: Stored in **merchant_payout_requests** for each withdrawal: `commission_percentage`, `commission_amount`, `net_payout_amount`. Also reflected in **merchant_wallet_ledger** as DEBIT entries (e.g. COMMISSION_DEDUCTION) and in **merchant_wallet.total_commission_deducted** when the payout is processed.
- **TDS / Tax**: Not currently deducted or stored in the payout flow. When implemented, they can be: (1) added as columns on `merchant_payout_requests` (e.g. `tds_amount`, `tax_amount` or `gst_amount`), and (2) returned by payout-quote and shown in the withdrawal calculation UI.

---

## 6. API and UI flow (current)

- **GET /api/merchant/payout-quote?storeId=…&amount=…**  
  Returns: `requested_amount`, `commission_percentage`, `commission_amount`, `net_payout_amount`. Used by the Payments page to show “Withdrawal calculation” in the dialog.

- **POST /api/merchant/payout-request**  
  Body: `storeId`, `amount`, `bank_account_id`. Looks up commission from `platform_commission_rules`, computes commission and net payout, inserts into **merchant_payout_requests**, returns the same breakdown.

- **Payments page (mx/payments)**  
  Withdrawal dialog shows: Requested amount, Commission (if % > 0), You receive (net payout). We can extend this to always show Commission (0% when no rule) and placeholder lines for TDS/Tax so the full structure is visible.

---

## 7. Summary

| Item | When deducted | Where stored |
|------|----------------|--------------|
| **Commission** | At withdrawal request (and on payout processing) | `platform_commission_rules` (%), `merchant_payout_requests` (%), `merchant_wallet_ledger` (DEBIT), `merchant_wallet.total_commission_deducted` |
| **TDS** | Not yet | To be added (e.g. `merchant_payout_requests.tds_amount` + ledger) |
| **Tax / GST** | Not yet | To be added (e.g. `merchant_payout_requests.tax_amount` or per-order in `order_settlement_breakdown`) |

Commission is **not** deducted when order earnings are credited; it is deducted **at withdrawal time** and the details are saved in **merchant_payout_requests** and the ledger.

---

## 8. Wallet and ledger behaviour

- **On withdrawal request:** The **main wallet** (`available_balance`) is debited by the **requested amount** (before commission) as soon as the request is created. A **WITHDRAWAL** ledger entry is written and linked via `merchant_payout_requests.debit_ledger_id`. Transaction history shows this debit immediately.
- **Who requested:** Each payout row stores **requested_by_id** (auth user id) and **requested_by_email** (denormalized) so you can see who initiated the withdrawal. Audit log also records the action and actor.
- **Failed or reversed payout:** When a payout is marked **FAILED** or **REVERSED**, the system should **credit back** the wallet by the original requested amount using category **FAILED_WITHDRAWAL_REVERSAL**, with idempotency key tied to the payout request id so the credit is applied only once. This is not yet implemented in the API that updates payout status; add it when building admin/ops flows that set status to FAILED or REVERSED.
