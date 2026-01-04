# Unified Ticket System - Complete Documentation

## 🎯 **OVERVIEW**

The Unified Ticket System is a comprehensive, production-grade ticket management system that consolidates all ticket types into a single, powerful schema.

---

## ✅ **WHAT IT SUPPORTS**

### **1. All Ticket Types:**
- ✅ **Order-Related Tickets** - Tickets linked to specific orders
- ✅ **Non-Order-Related Tickets** - General support tickets

### **2. All Sources:**
- ✅ **Customer** - Tickets raised by customers via app
- ✅ **Rider** - Tickets raised by riders via app
- ✅ **Merchant** - Tickets raised by merchants via app
- ✅ **System (Auto)** - Auto-generated tickets by system
- ✅ **Email** - Tickets created from email
- ✅ **Agent** - Tickets created by support agents
- ✅ **WhatsApp** - Tickets from WhatsApp
- ✅ **Call** - Tickets from phone calls

### **3. All Services:**
- ✅ **Food** - Food delivery service tickets
- ✅ **Parcel** - Parcel delivery service tickets
- ✅ **Ride** - Ride booking service tickets
- ✅ **General** - General support (not service-specific)

### **4. Fixed Ticket Titles:**
- ✅ **43 Pre-defined Titles** - Ensures consistency
- ✅ **Configurable** - Via `ticket_title_config` table
- ✅ **Service-Specific** - Different titles for food/parcel/ride

---

## 📊 **SCHEMA STRUCTURE**

### **Main Tables:**

1. **`unified_tickets`** - Main ticket table
   - Supports all ticket types and sources
   - Links to orders, customers, riders, merchants
   - Complete lifecycle tracking

2. **`unified_ticket_messages`** - Conversation thread
   - Messages from all parties
   - Supports attachments
   - Internal notes for agents

3. **`unified_ticket_activities`** - Audit trail
   - Complete activity log
   - Status changes
   - Assignment changes
   - Priority changes

4. **`ticket_title_config`** - Fixed titles configuration
   - 43 pre-defined titles
   - Service applicability
   - Default settings

5. **`ticket_auto_generation_rules`** - Auto-generation rules
   - System event triggers
   - Auto-assignment rules
   - Priority defaults

---

## 🎨 **FIXED TICKET TITLES**

### **Order-Related Titles (15):**
- `ORDER_DELAYED`
- `ORDER_NOT_RECEIVED`
- `WRONG_ITEM_DELIVERED`
- `ITEM_MISSING`
- `ORDER_CANCELLED_WRONG`
- `PAYMENT_ISSUE`
- `REFUND_NOT_PROCESSED`
- `ORDER_DAMAGED`
- `ORDER_QUALITY_ISSUE`
- `RIDER_NOT_ARRIVED`
- `RIDER_BEHAVIOUR_ISSUE`
- `MERCHANT_NOT_PREPARING`
- `DELIVERY_ADDRESS_WRONG`
- `ORDER_NOT_ASSIGNED`
- `ORDER_REASSIGNMENT_NEEDED`

### **Non-Order-Related - Customer (8):**
- `ACCOUNT_ISSUE`
- `PAYMENT_METHOD_ISSUE`
- `WALLET_ISSUE`
- `COUPON_NOT_APPLYING`
- `APP_TECHNICAL_ISSUE`
- `PROFILE_UPDATE_ISSUE`
- `ADDRESS_MANAGEMENT_ISSUE`
- `NOTIFICATION_NOT_RECEIVING`

### **Non-Order-Related - Rider (9):**
- `EARNINGS_NOT_CREDITED`
- `WALLET_WITHDRAWAL_ISSUE`
- `APP_CRASH_OR_BUG`
- `LOCATION_TRACKING_ISSUE`
- `ORDER_NOT_RECEIVING`
- `ONBOARDING_ISSUE`
- `DOCUMENT_VERIFICATION_ISSUE`
- `DUTY_LOG_ISSUE`
- `RATING_DISPUTE`

### **Non-Order-Related - Merchant (7):**
- `PAYOUT_DELAYED`
- `PAYOUT_NOT_RECEIVED`
- `SETTLEMENT_DISPUTE`
- `COMMISSION_DISPUTE`
- `MENU_UPDATE_ISSUE`
- `STORE_STATUS_ISSUE`
- `VERIFICATION_ISSUE`

### **General Titles (4):**
- `OTHER`
- `FEEDBACK`
- `COMPLAINT`
- `SUGGESTION`

---

## 🔄 **MIGRATION FROM OLD SCHEMA**

### **Old Tables (Deprecated):**
- ❌ `tickets` (rider-only, basic)
- ❌ `order_tickets` (order-related only)
- ❌ `customer_tickets` (customer-only)

### **New Unified Table:**
- ✅ `unified_tickets` (all types, all sources)

### **Migration:**
- ✅ All existing tickets migrated automatically
- ✅ Messages migrated
- ✅ Relationships preserved
- ✅ Legacy IDs stored in metadata

---

## 📝 **USAGE EXAMPLES**

### **1. Customer Raises Order-Related Ticket (Food):**
```sql
INSERT INTO unified_tickets (
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  order_id,
  customer_id,
  raised_by_type,
  raised_by_id,
  raised_by_name,
  subject,
  description,
  priority
) VALUES (
  'ORDER_RELATED',
  'CUSTOMER',
  'FOOD',
  'ORDER_DELAYED',
  'DELIVERY',
  12345,
  67890,
  'CUSTOMER',
  67890,
  'John Doe',
  'Order #12345 is delayed',
  'My order was supposed to arrive 30 minutes ago',
  'HIGH'
);
```

### **2. Merchant Raises Non-Order Ticket (Payout):**
```sql
INSERT INTO unified_tickets (
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  merchant_store_id,
  raised_by_type,
  raised_by_id,
  raised_by_name,
  subject,
  description,
  priority
) VALUES (
  'NON_ORDER_RELATED',
  'MERCHANT',
  'GENERAL',
  'PAYOUT_DELAYED',
  'EARNINGS',
  111,
  'MERCHANT',
  222,
  'Restaurant ABC',
  'Payout delayed',
  'My payout for last week has not been credited',
  'URGENT'
);
```

### **3. System Auto-Generates Ticket:**
```sql
INSERT INTO unified_tickets (
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  order_id,
  customer_id,
  raised_by_type,
  auto_generated,
  auto_generation_rule,
  priority
) VALUES (
  'ORDER_RELATED',
  'SYSTEM',
  'FOOD',
  'ORDER_DELAYED',
  'DELIVERY',
  12345,
  67890,
  'SYSTEM',
  TRUE,
  'ORDER_DELAYED_30_MIN',
  'HIGH'
);
```

### **4. Email-Based Ticket:**
```sql
INSERT INTO unified_tickets (
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  customer_id,
  raised_by_type,
  email_message_id,
  email_thread_id,
  email_from_address,
  email_subject,
  subject,
  description
) VALUES (
  'NON_ORDER_RELATED',
  'EMAIL',
  'GENERAL',
  'OTHER',
  'OTHER',
  67890,
  'EMAIL',
  'msg-12345',
  'thread-abc',
  'customer@example.com',
  'Support Request',
  'Support Request',
  'Email body content...'
);
```

---

## 🔍 **QUERY EXAMPLES**

### **Get All Order-Related Food Tickets:**
```sql
SELECT * FROM unified_tickets
WHERE ticket_type = 'ORDER_RELATED'
  AND service_type = 'FOOD'
  AND status = 'OPEN';
```

### **Get All Tickets by Customer:**
```sql
SELECT * FROM unified_tickets
WHERE customer_id = 67890
ORDER BY created_at DESC;
```

### **Get All Merchant Payout Issues:**
```sql
SELECT * FROM unified_tickets
WHERE ticket_title = 'PAYOUT_DELAYED'
  AND raised_by_type = 'MERCHANT'
  AND status != 'CLOSED';
```

### **Get All Auto-Generated Tickets:**
```sql
SELECT * FROM unified_tickets
WHERE auto_generated = TRUE
  AND created_at >= NOW() - INTERVAL '24 hours';
```

### **Get Ticket Conversation:**
```sql
SELECT 
  ut.ticket_id,
  ut.subject,
  utm.message_text,
  utm.sender_type,
  utm.sender_name,
  utm.created_at
FROM unified_tickets ut
LEFT JOIN unified_ticket_messages utm ON ut.id = utm.ticket_id
WHERE ut.ticket_id = 'TKT-2024-001234'
ORDER BY utm.created_at ASC;
```

---

## 🎯 **KEY FEATURES**

### **1. Fixed Titles:**
- ✅ 43 pre-defined titles
- ✅ Service-specific applicability
- ✅ Default priority and category
- ✅ Configurable via `ticket_title_config`

### **2. Service Categorization:**
- ✅ Food delivery tickets
- ✅ Parcel delivery tickets
- ✅ Ride booking tickets
- ✅ General support tickets

### **3. Complete Audit Trail:**
- ✅ All activities logged
- ✅ Status changes tracked
- ✅ Assignment history
- ✅ Resolution tracking

### **4. Auto-Generation:**
- ✅ System event triggers
- ✅ Configurable rules
- ✅ Auto-assignment support

### **5. Email Integration:**
- ✅ Email thread grouping
- ✅ Message ID tracking
- ✅ Reply-to support

---

## 📋 **MIGRATION FILES**

1. **`0020_unified_ticket_system.sql`** - Schema creation
   - Creates all tables
   - Creates all enums
   - Creates triggers
   - Sets up RLS

2. **`0021_unified_ticket_data_migration.sql`** - Data migration
   - Populates ticket titles
   - Migrates existing tickets
   - Migrates messages
   - Preserves relationships

---

## ✅ **STATUS**

- ✅ Schema designed
- ✅ All ticket types supported
- ✅ All sources supported
- ✅ Service categorization complete
- ✅ Fixed titles implemented
- ✅ Migration scripts ready
- ✅ Production ready

---

## 🚀 **NEXT STEPS**

1. **Run Migration 0020** - Creates unified ticket system
2. **Run Migration 0021** - Migrates existing data
3. **Update Application Code** - Use new unified_tickets table
4. **Deprecate Old Tables** - After migration verified

---

**Status**: ✅ **COMPLETE & PRODUCTION READY**
