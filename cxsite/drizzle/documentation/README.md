# Database Schema Documentation

This folder contains comprehensive documentation for all database domains, organized by domain for easy navigation.

---

## 📁 **FOLDER STRUCTURE**

```
documentation/
├── merchant_domain/          # Merchant Domain (35 tables)
├── rider_domain/              # Rider Domain (20+ tables)
├── customer_domain/           # Customer Domain (44 tables)
├── orders_domain/             # Orders Domain (28 tables)
├── tickets_domain/            # Tickets Domain (5 tables)
├── access_management/         # Access Management (36 tables)
├── providers_domain/          # Providers Domain (14 tables)
├── payments_domain/           # Payments Domain (5 tables)
└── system_domain/             # System Domain (10 tables)
```

---

## 📚 **DOCUMENTATION TYPES**

### **1. Workflow Documentation** (Step-by-Step)
- **Purpose**: Explains which tables are used and in which order during business processes
- **Format**: `DATABASE_SCHEMA_[DOMAIN]_WORKFLOW_PART[X].md`
- **Available for**:
  - ✅ Merchant Domain (3 parts)
  - ✅ Rider Domain (3 parts)
  - ⏳ Customer Domain (coming soon)
  - ⏳ Orders Domain (coming soon)

### **2. Technical Documentation** (Table Details)
- **Purpose**: Detailed table attributes, relationships, and technical details
- **Format**: `DATABASE_SCHEMA_[DOMAIN]_PART[X].md` or `DATABASE_SCHEMA_[DOMAIN].md`
- **Available for**: All domains

---

## 🏪 **MERCHANT DOMAIN**

### **Workflow Documentation** (Step-by-Step Process)
1. **Part 1**: Registration & Onboarding (8 tables)
   - Parent registration → Store registration → Documents → Verification → Tax → Bank → Services → Status
2. **Part 2**: Menu & Operations (11 tables)
   - Categories → Items → Customizations → Addons → Variants → Hours → Availability → Prep times → Offers → Coupons
3. **Part 3**: Financial, Access & Ongoing Operations (16 tables)
   - Commission → Settlements → Payouts → Users → Access → Managers → Holidays → Settings → Logs → Blocks → Compliance → Integration

### **Technical Documentation**
- `DATABASE_SCHEMA_MERCHANT_DOMAIN_PART1_CORE.md` - Core structure
- `DATABASE_SCHEMA_MERCHANT_DOMAIN_PART2_MENU.md` - Menu management
- `DATABASE_SCHEMA_MERCHANT_DOMAIN_PART3_OPERATIONS_FINANCIAL.md` - Operations & financial

**Total**: 35 tables

---

## 🏍️ **RIDER DOMAIN**

### **Workflow Documentation** (Step-by-Step Process)
1. **Part 1**: Registration & Onboarding (8 tables)
   - Registration → Documents → Device → Vehicle → Insurance → Bank → Payment → Verification → Block
2. **Part 2**: Operations & Earnings (9 tables)
   - Duty → Location → Orders → Actions → Events → Wallet → Withdrawal → Settlement → Commission
3. **Part 3**: Analytics & Rewards (7 tables)
   - Analytics → Ratings → Offers → Participation → Notifications → Preferences

### **Technical Documentation**
- `DATABASE_SCHEMA_RIDER_DOMAIN.md` - Complete rider domain

**Total**: 20+ tables

---

## 👤 **CUSTOMER DOMAIN**

### **Technical Documentation** (5 parts)
- `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART1_CORE_AUTH.md` - Core & Auth (5 tables)
- `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART2_ADDRESSES_PREFERENCES.md` - Addresses & Preferences (7 tables)
- `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART3_WALLET_PAYMENTS.md` - Wallet & Payments (5 tables)
- `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART4_LOYALTY_REWARDS.md` - Loyalty & Rewards (8 tables)
- `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART5_SUPPORT_ANALYTICS.md` - Support & Analytics (19 tables)

**Total**: 44 tables

---

## 📦 **ORDERS DOMAIN**

### **Technical Documentation** (4 parts)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART1_CORE.md` - Core orders table (1 table)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART2_ITEMS_SERVICES.md` - Items & service-specific (10 tables)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART3_ASSIGNMENTS_TIMELINE.md` - Assignments & timeline (11 tables)
- `DATABASE_SCHEMA_ORDERS_DOMAIN_PART4_PAYMENTS_DISPUTES.md` - Payments, disputes, conflicts (6 tables)

**Total**: 28 tables

---

## 🎫 **TICKETS DOMAIN**

### **Technical Documentation**
- `DATABASE_SCHEMA_TICKETS_DOMAIN.md` - Unified ticket system

**Total**: 5 tables

---

## 🔐 **ACCESS MANAGEMENT**

### **Technical Documentation**
- `DATABASE_SCHEMA_ACCESS_MANAGEMENT.md` - Complete access management system

**Total**: 36 tables

---

## 🔌 **PROVIDERS DOMAIN**

### **Technical Documentation**
- `DATABASE_SCHEMA_PROVIDERS_DOMAIN.md` - External provider integration

**Total**: 14 tables

---

## 💳 **PAYMENTS DOMAIN**

### **Technical Documentation**
- `DATABASE_SCHEMA_PAYMENTS_DOMAIN.md` - Payment processing
- Note: Core payment tables are in Orders Domain Part 4

**Total**: 5 tables (additional to Orders Domain)

---

## ⚙️ **SYSTEM DOMAIN**

### **Technical Documentation**
- `DATABASE_SCHEMA_SYSTEM_DOMAIN.md` - System configuration and business logic

**Total**: 10 tables

---

## 🗺️ **NAVIGATION GUIDE**

### **By Business Process**
- **Merchant Onboarding**: `merchant_domain/DATABASE_SCHEMA_MERCHANT_DOMAIN_WORKFLOW_PART1_REGISTRATION_ONBOARDING.md`
- **Rider Onboarding**: `rider_domain/DATABASE_SCHEMA_RIDER_DOMAIN_WORKFLOW_PART1_REGISTRATION_ONBOARDING.md`
- **Order Processing**: `orders_domain/DATABASE_SCHEMA_ORDERS_DOMAIN_PART3_ASSIGNMENTS_TIMELINE.md`

### **By Table Name**
- Use `DATABASE_SCHEMA_INDEX.md` in parent `drizzle/` folder for master index

### **By Domain**
- Navigate to respective domain folder
- Check workflow documentation for step-by-step process
- Check technical documentation for detailed attributes

---

## 📊 **STATISTICS**

- **Total Tables**: 217 tables
- **Total Domains**: 9 domains
- **Workflow Documentation**: 2 domains (Merchant, Rider)
- **Technical Documentation**: All domains

---

**Last Updated**: 2025-01-XX
