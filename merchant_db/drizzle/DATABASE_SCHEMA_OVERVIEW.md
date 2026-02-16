# Database Schema Overview - Complete Documentation

## 📊 **Database Statistics**

- **Total Tables**: 210+ tables
- **Total Indexes**: 800+ indexes
- **Total Enums**: 50+ custom types
- **Total Functions**: 20+ database functions
- **Total Triggers**: 50+ triggers
- **Materialized Views**: 3 analytics views

---

## 🗂️ **Database Organization by Domain**

The database is organized into **9 main domains**:

### 1. **RIDER DOMAIN** (20+ tables)
- Core rider profiles, onboarding, KYC
- Documents, devices, security
- Duty logs, location tracking
- Wallet, earnings, withdrawals
- Performance analytics

### 2. **CUSTOMER DOMAIN** (35+ tables)
- Customer profiles, authentication
- Addresses, contacts, preferences
- Wallet, payment methods
- Loyalty, rewards, referrals
- Ratings, reviews, favorites
- Support tickets, disputes

### 3. **MERCHANT DOMAIN** (30+ tables)
- Merchant parents (brands/chains)
- Merchant stores (outlets)
- Menu management (categories, items, variants)
- Offers, coupons, promotions
- Payouts, settlements, commissions
- Verification, documents, compliance

### 4. **ORDERS DOMAIN** (50+ tables)
- Core orders table (unified for all services)
- Service-specific details (food, parcel, ride)
- Order items, addons, instructions
- Order timeline (immutable history)
- Rider assignments (multi-rider support)
- Order ratings, remarks, notifications
- Order disputes, conflicts, sync logs

### 5. **PAYMENTS & FINANCIAL** (20+ tables)
- Order payments (multiple attempts)
- Order refunds (partial & full)
- Rider wallet ledger
- Withdrawal requests
- Settlement batches
- COD collections
- Commission history
- Customer wallet & transactions

### 6. **TICKETS & SUPPORT** (10+ tables)
- Unified tickets system
- Ticket messages, activities
- Ticket title configuration
- Auto-generation rules
- Legacy ticket migrations

### 7. **ACCESS MANAGEMENT** (25+ tables)
- System users, roles, permissions
- User sessions, login history
- API keys, IP whitelist
- Access controls (orders, tickets, riders, merchants)
- Area assignments, service scope
- Audit logs, activity logs
- Approval workflows, delegations
- Emergency mode, restrictions

### 8. **EXTERNAL PROVIDERS** (15+ tables)
- Provider order mapping
- Provider rider mapping
- Provider configs
- Webhook events, configurations
- API call logs, rate limits
- Order sync logs, conflicts
- Provider status sync

### 9. **SYSTEM & CONFIGURATION** (15+ tables)
- System configuration
- App versions
- OTP verification logs
- Payment webhooks
- Notification logs, preferences
- Offers, participation
- Analytics tables
- Compliance audit trails

---

## 📋 **Quick Reference by Service Type**

### **Food Delivery Service**
- `orders` (order_type = 'food')
- `order_food_details`
- `order_food_items`
- `merchant_menu_items`
- `merchant_menu_categories`
- `merchant_menu_item_variants`
- `merchant_menu_item_addons`

### **Parcel Delivery Service**
- `orders` (order_type = 'parcel')
- `order_parcel_details`
- `order_items`

### **Ride Booking Service**
- `orders` (order_type = 'ride')
- `order_ride_details`
- `ride_fare_breakdown`

### **3PL (Third-Party Logistics)**
- `orders` (order_type = '3pl')

---

## 🔗 **Core Relationships**

### **Order Flow**
```
customers → orders → order_rider_assignments → riders
                ↓
         order_payments
         order_refunds
         order_timeline
         order_items
```

### **Merchant Flow**
```
merchant_parents → merchant_stores → orders
                              ↓
                    merchant_store_payouts
                    merchant_store_settlements
```

### **Rider Flow**
```
riders → order_rider_assignments → orders
    ↓
wallet_ledger → withdrawal_requests
```

### **Customer Flow**
```
customers → customer_addresses → orders
        ↓
customer_wallet → customer_wallet_transactions
customer_loyalty → customer_reward_transactions
```

---

## 📚 **Documentation Files**

Detailed documentation is split into domain-specific files:

1. **DATABASE_SCHEMA_RIDER_DOMAIN.md** - All rider-related tables
2. **DATABASE_SCHEMA_CUSTOMER_DOMAIN.md** - All customer-related tables
3. **DATABASE_SCHEMA_MERCHANT_DOMAIN.md** - All merchant-related tables
4. **DATABASE_SCHEMA_ORDERS_DOMAIN.md** - All order-related tables
5. **DATABASE_SCHEMA_PAYMENTS_DOMAIN.md** - All payment & financial tables
6. **DATABASE_SCHEMA_TICKETS_DOMAIN.md** - All ticket & support tables
7. **DATABASE_SCHEMA_ACCESS_DOMAIN.md** - All access management tables
8. **DATABASE_SCHEMA_PROVIDERS_DOMAIN.md** - All external provider tables
9. **DATABASE_SCHEMA_SYSTEM_DOMAIN.md** - All system & configuration tables

---

## 🎯 **Key Design Principles**

1. **Single Source of Truth**: `orders` table is the master for all order types
2. **Immutable History**: Timeline and assignments are never deleted
3. **Multi-Rider Support**: Multiple riders can be assigned to one order
4. **Multi-Payment Support**: Multiple payment attempts tracked
5. **Full Audit Trail**: Every action logged with actor information
6. **Soft Deletes**: Most tables use `deleted_at` instead of hard deletes
7. **Partitioning**: Large tables (location_logs, wallet_ledger) are partitioned
8. **JSONB Metadata**: Flexible data storage for provider-specific fields

---

## 🔍 **How to Use This Documentation**

1. **Find a Table**: Use the domain-specific files to locate tables
2. **Understand Purpose**: Each table has a clear description
3. **Check Attributes**: All columns are documented with types and purposes
4. **See Relationships**: Foreign keys and relationships are explained
5. **Know When to Update**: Each attribute indicates if it's auto-updated or manual

---

**Next Steps**: Read the domain-specific documentation files for detailed table information.
