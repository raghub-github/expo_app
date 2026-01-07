# Providers Domain - Complete Documentation

## 🔌 **PROVIDERS DOMAIN OVERVIEW**

The Providers Domain manages integration with external platforms (Swiggy, Zomato, Rapido, etc.) including order synchronization, webhooks, and conflict resolution.

**Total Tables**: 14 tables

---

## 📋 **CORE TABLES** (9 tables)

1. **`provider_configs`** - Provider configuration
   - API keys, secrets, tokens, rate limits
   - No foreign keys (configuration table)

2. **`webhook_events`** - Webhook events
   - Incoming webhooks from providers
   - References: `orders.id` (optional)

3. **`provider_order_mapping`** - Order mapping
   - Maps internal orders to provider orders
   - References: `orders.id`
   - Unique: `(provider_type, provider_order_id)`

4. **`provider_rider_mapping`** - Rider mapping
   - Maps internal riders to provider riders
   - References: `riders.id`

5. **`provider_order_status_sync`** - Status sync
   - Status synchronization tracking
   - References: `orders.id`

6. **`provider_order_payment_mapping`** - Payment mapping
   - Payment synchronization
   - References: `orders.id`, `order_payments.id`

7. **`provider_order_refund_mapping`** - Refund mapping
   - Refund synchronization
   - References: `orders.id`, `order_refunds.id`

8. **`provider_order_item_mapping`** - Item mapping
   - Item synchronization
   - References: `orders.id`, `order_items.id`

9. **`provider_order_conflicts`** - Order conflicts
   - Conflict detection and resolution
   - References: `orders.id`

10. **`provider_order_analytics`** - Provider analytics
    - Analytics data for providers
    - References: `orders.id` (optional)

---

## 📊 **LOGGING & MONITORING** (4 tables)

11. **`api_call_logs`** - API call logs
    - All API calls to providers
    - References: `orders.id` (optional)

12. **`order_sync_logs`** - Order sync logs
    - Order synchronization logs
    - References: `orders.id`

13. **`provider_rate_limits`** - Rate limits
    - Rate limit tracking
    - No foreign keys

14. **`webhook_configurations`** - Webhook configurations
    - Webhook endpoint configurations
    - No foreign keys

---

## 🔗 **RELATIONSHIPS**

```
orders (1)
    ↓
    ├─→ provider_order_mapping (many)
    ├─→ provider_order_status_sync (many)
    ├─→ provider_order_payment_mapping (many)
    ├─→ provider_order_refund_mapping (many)
    ├─→ provider_order_item_mapping (many)
    ├─→ provider_order_conflicts (many)
    ├─→ provider_order_analytics (many)
    └─→ order_sync_logs (many)

riders (1)
    └─→ provider_rider_mapping (many)

provider_configs (1)
    └─→ (referenced by all provider operations)
```

---

## 📊 **SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| Core Integration | 9 | Order/rider mapping, sync, conflicts |
| Logging & Monitoring | 4 | API logs, sync logs, rate limits, webhooks |

**Total**: 14 tables

---

## 📝 **NOTES**

1. **External Provider Integration**: Swiggy, Zomato, Rapido, etc.
2. **Order Synchronization**: Bidirectional sync with conflict resolution
3. **Webhook Support**: Incoming webhooks from providers
4. **Rate Limiting**: Provider-specific rate limit tracking

**For detailed attribute documentation**, refer to SQL migration files:
- `0006_external_providers_integration.sql`
- `0009_external_provider_order_enhancements.sql`
