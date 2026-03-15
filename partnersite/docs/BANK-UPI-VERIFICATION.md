# Bank & UPI Verification (No Payout)

Real-time verification using **Razorpay Fund Account Validation API**. No money is transferred.

## API Keys & Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `RAZORPAY_KEY_ID` | Yes | Razorpay API Key ID (Dashboard → Settings → API Keys) |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay API Key Secret (keep backend-only) |
| `RAZORPAY_X_ACCOUNT_NUMBER` | Yes | RazorpayX Lite **Customer Identifier** (Dashboard → Banking → My Account → Customer Identifier). Used as `source_account_number` for validation; no debit. |
| `BANK_VERIFICATION_ENCRYPTION_KEY` | No | 32-byte hex (64 chars) or 32-char string for AES-256 encryption of `account_number` at rest. If unset, account number is stored in plaintext (not recommended for production). |
| `CRON_SECRET` | No | Optional secret for cron endpoint; send `Authorization: Bearer <CRON_SECRET>` when calling reset-verification-limits. |

## Razorpay Setup

1. **RazorpayX Lite** – Fund Account Validation (including pennyless bank validation) is available only on **RazorpayX Lite**. Enable it from the Razorpay Dashboard if needed.
2. **Customer Identifier** – In RazorpayX Dashboard: **My Account & Settings** → **Banking** → copy **Customer Identifier** and set as `RAZORPAY_X_ACCOUNT_NUMBER`. This is the “source account” for validation; no actual transfer is made when using `validation_type: "pennyiless"`.

## API Endpoints

### POST /api/merchant/bank-account/verify-bank

**Body:** `{ storeId, account_holder_name, account_number, ifsc_code, bank_name, branch_name?, bankAccountId? }`

- **Limits:** 3 bank attempts per store per day; 3 bank accounts per store; 10s cooldown between attempts.
- **Response:** `{ success, verification_status: "verified"|"failed"|"pending", message, beneficiary_name? }`

### POST /api/merchant/bank-account/verify-upi

**Body:** `{ storeId, upi_id, holder_name? }`

- **Limits:** 5 UPI attempts per store per day; 5 UPI IDs per store; 10s cooldown.
- **Response:** `{ success, verification_status: "verified"|"failed"|"pending", message, beneficiary_name? }`

### GET/POST /api/cron/reset-verification-limits

Resets daily attempt counters when `last_reset_date` < current date. Call once per day (e.g. cron). Optional: `Authorization: Bearer <CRON_SECRET>`.

## Business Rules

- **Bank:** Razorpay composite validation with `validation_type: "pennyiless"` (no transfer). Beneficiary name must match store/owner name. Full Razorpay response stored in `verification_response`.
- **UPI:** Razorpay VPA composite validation (no amount). Mark verified only when VPA is active.
- **Audit:** Every attempt is logged in `merchant_verification_attempts`.
- **Daily reset:** Cron (or scheduled job) should call `/api/cron/reset-verification-limits` so that `bank_attempts_today` and `upi_attempts_today` reset each day.

## Database

- **merchant_store_bank_accounts** – New columns: `beneficiary_name`, `verification_response`, `attempt_count`, `last_attempt_at`, `razorpay_validation_id`. Existing `verification_status`, `verified_at` used.
- **merchant_store_upi_accounts** – New table for UPI IDs and their validation state.
- **merchant_verification_limits** – Per-store daily attempt counters.
- **merchant_verification_attempts** – Audit log for every attempt.

Run migration: `drizzle/0100_bank_upi_validation_no_payout.sql`.
