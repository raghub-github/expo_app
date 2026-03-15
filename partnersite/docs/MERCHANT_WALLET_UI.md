# Merchant Wallet UI – Rules & Conventions

## Overview

The merchant dashboard and payments experience use the **merchant_wallet** and **merchant_wallet_ledger** schema. All amounts shown must be accurate for the store and sourced from these tables (via the merchant wallet APIs).

## Dashboard – First State Box

- **Location:** First content section on `/mx/dashboard`, before “Ordering mode | Store Status | Delivery”.
- **Content:** Wallet & Earnings in a single row of small stat cards:
  - **Available balance** – from `merchant_wallet.available_balance` (primary, prominent).
  - **Today’s earning** – sum of CREDIT + ORDER_EARNING in `merchant_wallet_ledger` for the current UTC day.
  - **Yesterday’s earning** – same for the previous UTC day.
  - **Pending** – from `merchant_wallet.pending_balance`.
- **Data source:** `GET /api/merchant/wallet?storeId=<public_store_id>`.
- **Store resolution:** `store_id` (e.g. GMMC1015) is resolved to `merchant_stores.id`; wallet is keyed by `merchant_wallet.merchant_store_id`.
- **Formatting:** All amounts in INR with two decimal places and locale formatting (e.g. `toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`).

## Payments Page – `/mx/payments`

- **Balance & summary:** Use `GET /api/merchant/wallet?storeId=...` for available balance, today’s earning, yesterday’s earning, pending balance, and **pending withdrawal total** (sum of `merchant_payout_requests` with status PENDING). No hardcoded or demo balances.
- **Bank & UPI:** List all accounts (including disabled) via `GET /api/merchant/bank-accounts?storeId=...`. Add via `POST`, set default/disable via `PATCH /api/merchant/bank-accounts/[id]`. Accounts can be disabled but never deleted. One default per store. Withdraw modal shows bank selector.
- **Ledger:** Full history of credits and debits from `GET /api/merchant/wallet/ledger` with:
  - **Strong filters:** Date range (from, to), direction (All / CREDIT / DEBIT), category (dropdown of `wallet_transaction_category`), and search (description / reference_extra).
  - **Pagination:** `limit` (e.g. 50) and `offset`.
- **Columns:** Date, Type (category), Description, Direction, Amount (signed: + credit, − debit), Balance after.
- **UI:** Modern, clear layout; credit/debit visually distinct (e.g. green/red); filters in one bar with Apply and Clear.

## APIs

- **Wallet summary:** `GET /api/merchant/wallet?storeId=` – returns wallet row plus `today_earning`, `yesterday_earning`, and `pending_withdrawal_total` (from `merchant_payout_requests` where status = PENDING).
- **Bank accounts:** `GET /api/merchant/bank-accounts?storeId=`, `POST /api/merchant/bank-accounts`, `PATCH /api/merchant/bank-accounts/[id]` (set_default, set_disabled, or edit fields). Attachments (bank proof, UPI QR) stored in R2; use `getMerchantBankAttachmentPath` in `r2-paths.ts` for post-onboarding uploads.
- **Ledger:** `GET /api/merchant/wallet/ledger?storeId=&from=&to=&direction=&category=&search=&limit=&offset=` – paginated, filtered ledger entries.

## Schema Reference

- **merchant_wallet:** `merchant_store_id` (FK to `merchant_stores.id`), `available_balance`, `pending_balance`, `hold_balance`, `reserve_balance`, `total_earned`, `total_withdrawn`, etc.
- **merchant_wallet_ledger:** Immutable rows; `wallet_id`, `direction` (CREDIT/DEBIT), `category`, `amount`, `balance_after`, `reference_type`, `reference_id`, `description`, `created_at`.

Credits for merchant earnings are recorded when order status = DELIVERED (ORDER_EARNING). Withdrawals and other debits appear as DEBIT ledger entries.
