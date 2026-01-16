# Customer Domain - Part 3: Wallet & Payments

## 💰 **WALLET & PAYMENT TABLES**

### 1. **`customer_payment_methods`** - Saved Payment Methods
**Purpose**: Stores customer's saved payment methods (cards, UPI, wallets).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `payment_type` (ENUM) - `CARD`, `UPI`, `WALLET`, `NETBANKING`, `COD`
- `provider` (TEXT) - `RAZORPAY`, `STRIPE`, `PAYTM`, `PHONEPE`, `GPAY`
- `card_token` (TEXT) - Tokenized card token (for security)
- `card_last4` (TEXT) - Last 4 digits of card
- `card_brand` (TEXT) - `VISA`, `MASTERCARD`, `RUPAY`
- `card_expiry_month`, `card_expiry_year` (INTEGER) - Card expiry
- `card_holder_name` (TEXT) - Cardholder name
- `upi_id` (TEXT) - UPI ID (e.g., "user@paytm")
- `upi_verified` (BOOLEAN) - Whether UPI is verified
- `wallet_provider`, `wallet_phone` (TEXT) - Wallet details
- `bank_name` (TEXT) - Bank name (for netbanking)
- `is_default` (BOOLEAN) - Whether this is default payment method
- `is_verified` (BOOLEAN) - Whether payment method is verified
- `is_active` (BOOLEAN) - Whether payment method is active
- `token_reference` (TEXT) - Gateway token reference
- `usage_count` (INTEGER) - Number of times used
- `last_used_at` (TIMESTAMP) - When last used
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed
- `deleted_at` (TIMESTAMP) - Soft delete

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `usage_count`, `last_used_at` (on usage)
- ⚠️ Manual update: `is_default`, `is_active`, `is_verified` (by customer or system)
- 🔒 Never update: `id`, `customer_id`, `card_token`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Payment processing, order checkout

**Security Note**: Card details are tokenized. Never store full card numbers.

---

### 2. **`customer_wallet`** - Wallet Balance
**Purpose**: Stores customer wallet balance and limits.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One wallet per customer
- `current_balance` (NUMERIC) - Total wallet balance
- `locked_amount` (NUMERIC) - Amount locked (for pending orders)
- `available_balance` (NUMERIC) - Available balance (current - locked)
- `max_balance` (NUMERIC) - Maximum allowed balance (default: 10000)
- `min_transaction_amount` (NUMERIC) - Minimum transaction amount (default: 1)
- `max_transaction_amount` (NUMERIC) - Maximum transaction amount (default: 10000)
- `is_active` (BOOLEAN) - Whether wallet is active
- `kyc_verified` (BOOLEAN) - Whether KYC is verified (affects limits)
- `last_transaction_at` (TIMESTAMP) - When last transaction occurred
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `current_balance`, `locked_amount`, `available_balance`, `last_transaction_at`, `updated_at` (via triggers on transactions)
- ⚠️ Manual update: `max_balance`, `is_active`, `kyc_verified` (by admin/system)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)
- Used by: Wallet transactions, order payments

**Note**: Balance is calculated from `customer_wallet_transactions` ledger.

---

### 3. **`customer_wallet_transactions`** - Wallet Transaction Ledger
**Purpose**: Immutable ledger of all wallet transactions.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `transaction_id` (TEXT, UNIQUE) - Unique transaction ID
- `transaction_type` (ENUM) - `CREDIT`, `DEBIT`, `REFUND`, `TOPUP`, `CASHBACK`, `BONUS`, `ADJUSTMENT`
- `amount` (NUMERIC) - Transaction amount (positive for credit, negative for debit)
- `balance_before` (NUMERIC) - Balance before transaction
- `balance_after` (NUMERIC) - Balance after transaction
- `reference_id` (TEXT) - Reference ID (order_id, refund_id, etc.)
- `reference_type` (TEXT) - `ORDER`, `REFUND`, `TOPUP`, `CASHBACK`, `BONUS`
- `description` (TEXT) - Human-readable description
- `status` (TEXT) - `PENDING`, `COMPLETED`, `FAILED`, `REVERSED`
- `pg_transaction_id` (TEXT) - Payment gateway transaction ID (for topup)
- `pg_response` (JSONB) - Gateway response
- `transaction_metadata` (JSONB) - Additional transaction details
- `created_at` (TIMESTAMP) - When transaction occurred

**When to Update**:
- ✅ Auto-updated: All fields (by system when transaction occurs)
- 🔒 Never update: This is an **immutable ledger** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: Wallet balance calculation, transaction history, financial audits

**Note**: This is the source of truth for wallet balance. Balance in `customer_wallet` is derived from this.

---

### 4. **`customer_payment_history`** - Payment History
**Purpose**: Complete history of all payments made by customer.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id) - Order for which payment was made
- `payment_id` (TEXT, UNIQUE) - Unique payment ID
- `payment_method` (ENUM) - `CARD`, `UPI`, `WALLET`, `NETBANKING`, `COD`, `WALLET_BALANCE`
- `payment_provider` (TEXT) - Payment gateway/provider
- `payment_amount` (NUMERIC) - Payment amount
- `payment_status` (TEXT) - `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`
- `pg_order_id`, `pg_payment_id`, `pg_transaction_id` (TEXT) - Gateway IDs
- `failure_reason`, `failure_code` (TEXT) - Failure details
- `payment_metadata` (JSONB) - Additional payment details
- `created_at` (TIMESTAMP) - When payment was initiated

**When to Update**:
- ✅ Auto-updated: `payment_status`, `pg_payment_id`, `pg_transaction_id` (by payment gateway webhook)
- 🔒 Never update: `id`, `customer_id`, `order_id`, `payment_id`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`
- Used by: Payment tracking, refund processing, financial reports

---

### 5. **`customer_tips_given`** - Tips to Riders
**Purpose**: Tracks tips given by customers to riders.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `order_id` (BIGINT, FK → orders.id)
- `rider_id` (INTEGER, FK → riders.id)
- `tip_amount` (NUMERIC) - Tip amount
- `tip_message` (TEXT) - Optional tip message
- `tip_paid` (BOOLEAN) - Whether tip was paid
- `paid_at` (TIMESTAMP) - When tip was paid
- `created_at` (TIMESTAMP) - When tip was given

**When to Update**:
- ✅ Auto-updated: `tip_paid`, `paid_at` (when payment is processed)
- 🔒 Never update: `id`, `customer_id`, `order_id`, `rider_id`, `tip_amount`, `created_at`

**Relationships**:
- References: `customers.id`, `orders.id`, `riders.id`
- Used by: Rider earnings calculation, customer generosity tracking

---

## 🔗 **RELATIONSHIPS**

```
customers (1) ──→ (1) customer_wallet
customers (1) ──→ (many) customer_payment_methods
customers (1) ──→ (many) customer_wallet_transactions
customers (1) ──→ (many) customer_payment_history
customers (1) ──→ (many) customer_tips_given
orders (1) ──→ (many) customer_payment_history
orders (1) ──→ (many) customer_tips_given
riders (1) ──→ (many) customer_tips_given
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `customer_payment_methods` | Saved payment methods | Cards, UPI, wallets, tokenized storage |
| `customer_wallet` | Wallet balance | Current balance, locked amount, limits |
| `customer_wallet_transactions` | Wallet ledger | Immutable transaction history |
| `customer_payment_history` | Payment history | All payments, gateway integration |
| `customer_tips_given` | Tips to riders | Tip tracking, payment status |

**Total**: 5 tables in Part 3

---

**Next**: See `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART4_LOYALTY_REWARDS.md` for loyalty and rewards tables.
