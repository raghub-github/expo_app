# System Domain - Complete Documentation

## ⚙️ **SYSTEM DOMAIN OVERVIEW**

The System Domain manages system configuration, app versions, notifications, verification, and business logic.

**Total Tables**: 10 tables

---

## 📋 **CONFIGURATION & SETTINGS** (5 tables)

1. **`system_config`** - System configuration
   - Key-value configuration
   - No foreign keys

2. **`app_versions`** - App versions
   - Android/iOS version management
   - No foreign keys

3. **`notification_preferences`** - Notification preferences
   - User notification preferences
   - References: `riders.id` (or customers if exists)
   - Note: May be documented in Rider/Customer Domain

4. **`notification_logs`** - Notification logs
   - All notifications sent
   - References: Various entities (order_id, customer_id, etc.)
   - Note: May be documented in Rider/Customer Domain

5. **`api_rate_limits`** - API rate limits
   - Rate limit tracking
   - No foreign keys

---

## 🔐 **VERIFICATION & SECURITY** (2 tables)

6. **`otp_verification_logs`** - OTP verification logs
   - OTP send/verify tracking
   - No foreign keys

7. **`rider_vehicles`** - Rider vehicles
   - Vehicle registration and verification
   - References: `riders.id`
   - Note: Documented in Rider Domain

---

## 💼 **BUSINESS LOGIC** (3 tables)

8. **`order_cancellation_reasons`** - Cancellation reasons
   - Order cancellation tracking
   - References: `orders.id`
   - Note: May be documented in Orders Domain

9. **`insurance_policies`** - Insurance policies
   - Insurance policy management
   - References: `riders.id` (optional)
   - Note: Documented in Rider Domain

10. **`offers`** - Platform offers (if exists)
    - Platform-wide offers
    - No foreign keys (or references customers/orders)
    - Note: May be documented in Rider/Customer Domain

---

## 🔗 **RELATIONSHIPS**

```
system_config (standalone)
app_versions (standalone)
api_rate_limits (standalone)
otp_verification_logs (standalone)

riders (1)
    ├─→ notification_preferences (many) [if exists]
    ├─→ notification_logs (many) [if exists]
    ├─→ rider_vehicles (many)
    └─→ insurance_policies (many)

orders (1)
    └─→ order_cancellation_reasons (many) [if exists]
```

---

## 📊 **SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| Configuration & Settings | 5 | System config, app versions, notifications, rate limits |
| Verification & Security | 2 | OTP verification, vehicle verification |
| Business Logic | 3 | Cancellation reasons, insurance, offers |

**Total**: 10 tables

---

## 📝 **NOTES**

1. **System Configuration**: Key-value configuration store
2. **App Version Management**: Android/iOS version tracking
3. **Notifications**: May overlap with Rider/Customer Domain
4. **Verification**: OTP and vehicle verification
5. **Business Logic**: Cancellation reasons, insurance, offers

**Note**: Some tables may be documented in other domains (Rider, Customer, Orders).

**For detailed attribute documentation**, refer to SQL migration files:
- `0004_production_enhancements.sql`
- Domain-specific documentation for overlapping tables
