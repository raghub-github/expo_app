# Payments Domain - Complete Documentation

## 💳 **PAYMENTS DOMAIN OVERVIEW**

The Payments Domain manages payment processing, webhooks, and settlement batches. Core payment tables are documented in Orders Domain Part 4.

**Total Tables**: 5 tables (additional to Orders Domain)

---

## 📋 **ADDITIONAL PAYMENT TABLES** (5 tables)

### **Payment Processing** (Already documented in Orders Domain)
- `order_payments` - Payment attempts (Orders Domain Part 4)
- `order_refunds` - Refunds (Orders Domain Part 4)

### **Additional Tables**

1. **`payment_webhooks`** - Payment webhooks
   - Webhook events from payment gateways
   - No foreign keys (webhook processing)

2. **`rider_wallet_ledger`** - Rider wallet ledger (if exists)
   - Rider wallet transactions
   - References: `riders.id`
   - Note: This may be the same as `wallet_ledger` in Rider Domain

3. **`rider_withdrawal_requests`** - Withdrawal requests (if exists)
   - Rider withdrawal requests
   - References: `riders.id`
   - Note: This may be the same as `withdrawal_requests` in Rider Domain

4. **`settlement_batches`** - Settlement batches
   - Batch settlement processing
   - No foreign keys (batch processing)
   - Note: This may be documented in Rider Domain

5. **`commission_history`** - Commission history
   - Commission calculation history
   - References: `orders.id`, `riders.id` (optional)
   - Note: This may be documented in Rider Domain

---

## 🔗 **RELATIONSHIPS**

```
orders (1)
    ├─→ order_payments (many) [Orders Domain]
    └─→ order_refunds (many) [Orders Domain]

riders (1)
    ├─→ rider_wallet_ledger (many) [if exists]
    └─→ rider_withdrawal_requests (many) [if exists]

payment_webhooks (standalone)
settlement_batches (standalone)
commission_history (references orders, riders)
```

---

## 📊 **SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| Payment Processing | 2 | Order payments, refunds (Orders Domain) |
| Webhooks | 1 | Payment gateway webhooks |
| Wallet & Withdrawals | 2 | Rider wallet, withdrawals (Rider Domain) |
| Settlement | 2 | Settlement batches, commission history |

**Total**: 5 tables (additional to Orders Domain)

---

## 📝 **NOTES**

1. **Payment Processing**: Integrated with Orders Domain
2. **Webhooks**: Payment gateway webhook processing
3. **Wallet & Withdrawals**: May overlap with Rider Domain
4. **Settlement**: Batch processing for payouts

**For detailed attribute documentation**, refer to:
- Orders Domain Part 4 for `order_payments` and `order_refunds`
- Rider Domain for wallet and withdrawal tables
- SQL migration files for payment webhooks
