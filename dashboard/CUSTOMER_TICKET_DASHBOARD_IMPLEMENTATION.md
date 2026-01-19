# Customer and Ticket Dashboard Separation Implementation

## Overview
This document describes the implementation of separated customer and ticket dashboards by order type (food, parcel, person_ride), similar to how orders were separated.

## Changes Made

### 1. Database Schema Updates

#### Dashboard Types Added
**Customer Dashboards:**
- `CUSTOMER` - General customer dashboard (all customers)
- `CUSTOMER_FOOD` - Customers with food orders
- `CUSTOMER_PARCEL` - Customers with parcel orders
- `CUSTOMER_PERSON_RIDE` - Customers with person_ride orders

**Ticket Dashboards:**
- `TICKET` - General ticket dashboard (all tickets)
- `TICKET_FOOD` - All food-related tickets (customer, rider, merchant, order & non-order)
- `TICKET_PARCEL` - All parcel-related tickets
- `TICKET_PERSON_RIDE` - All person_ride-related tickets
- `TICKET_GENERAL` - Non-order-related tickets (all sources)

**Granular Ticket Dashboards (by source):**
- `TICKET_CUSTOMER_FOOD` - Customer food tickets
- `TICKET_CUSTOMER_PARCEL` - Customer parcel tickets
- `TICKET_CUSTOMER_PERSON_RIDE` - Customer person_ride tickets
- `TICKET_CUSTOMER_GENERAL` - Customer non-order tickets
- `TICKET_RIDER_FOOD` - Rider food tickets
- `TICKET_RIDER_PARCEL` - Rider parcel tickets
- `TICKET_RIDER_PERSON_RIDE` - Rider person_ride tickets
- `TICKET_RIDER_GENERAL` - Rider non-order tickets
- `TICKET_MERCHANT_FOOD` - Merchant food tickets
- `TICKET_MERCHANT_PARCEL` - Merchant parcel tickets
- `TICKET_MERCHANT_PERSON_RIDE` - Merchant person_ride tickets
- `TICKET_MERCHANT_GENERAL` - Merchant non-order tickets

#### Database Tables Updated

**unified_tickets table:**
- Added `order_type` column (TEXT, nullable)
  - Values: `food`, `parcel`, `person_ride`, or NULL (for non-order-related tickets)
  - Automatically set based on `service_type` or linked `order.order_type`
  - Used for filtering tickets by order type in dashboards

**ticket_access_controls table:**
- Added `order_type` column (TEXT, nullable)
  - NULL = access to all order types
  - Specific value = access to that order type only

**action_audit_log table:**
- Already has `order_type` column (added in previous migration)
- Used for auditing ticket actions by order type

### 2. Migration Files Created

#### `0050_add_order_type_to_tickets.sql`
- Adds `order_type` column to `unified_tickets` table
- Updates existing tickets based on `service_type` or linked orders
- Creates indexes for performance
- Adds trigger function to validate and set `order_type` automatically

#### `0051_migrate_customer_ticket_dashboard_access.sql`
- Migrates existing `CUSTOMER` dashboard access to `CUSTOMER_FOOD`, `CUSTOMER_PARCEL`, `CUSTOMER_PERSON_RIDE`
- Migrates existing `TICKET` dashboard access to `TICKET_FOOD`, `TICKET_PARCEL`, `TICKET_PERSON_RIDE`, `TICKET_GENERAL`
- Migrates access points for both customer and ticket dashboards
- Preserves existing access while creating new granular access

### 3. Frontend Updates

#### Dashboard Access Selector (`DashboardAccessSelector.tsx`)
- Added definitions for all new customer dashboard types
- Added definitions for all new ticket dashboard types (both main and granular)
- Each dashboard type has appropriate access points and descriptions

#### Customer Pages Created
- `/dashboard/customers` - Main page with cards for each customer type
- `/dashboard/customers/all` - All customers (requires `CUSTOMER` access)
- `/dashboard/customers/food` - Food customers (requires `CUSTOMER_FOOD` access)
- `/dashboard/customers/parcel` - Parcel customers (requires `CUSTOMER_PARCEL` access)
- `/dashboard/customers/person-ride` - Person ride customers (requires `CUSTOMER_PERSON_RIDE` access)

#### Ticket Pages Created
- `/dashboard/tickets` - Main page with cards for ticket categories
- `/dashboard/tickets/food` - All food tickets (requires `TICKET_FOOD` access)
- `/dashboard/tickets/parcel` - All parcel tickets (requires `TICKET_PARCEL` access)
- `/dashboard/tickets/person-ride` - All person_ride tickets (requires `TICKET_PERSON_RIDE` access)
- `/dashboard/tickets/general` - Non-order-related tickets (requires `TICKET_GENERAL` access)
- `/dashboard/tickets/customer/food` - Customer food tickets (requires `TICKET_CUSTOMER_FOOD` access)
- `/dashboard/tickets/customer/parcel` - Customer parcel tickets
- `/dashboard/tickets/customer/person-ride` - Customer person_ride tickets
- `/dashboard/tickets/customer/general` - Customer non-order tickets
- Similar pages for rider and merchant tickets

#### Permission Engine Updates
- Updated `getDashboardTypeFromPath()` to map all new customer and ticket paths
- Updated Sidebar to show customer/ticket links if user has access to any related dashboard type

#### API Updates
- Updated `/api/auth/dashboard-access` to include all new dashboard types for super admin
- Updated `/api/users` to handle `orderType` assignment for customer and ticket dashboards

### 4. Access Control Logic

#### Customer Dashboard Access
- Customers are filtered by their order history:
  - `CUSTOMER_FOOD`: Customers who have at least one food order
  - `CUSTOMER_PARCEL`: Customers who have at least one parcel order
  - `CUSTOMER_PERSON_RIDE`: Customers who have at least one person_ride order
  - `CUSTOMER`: All customers regardless of order type

#### Ticket Dashboard Access
- Tickets are filtered by:
  - **Order Type**: `order_type` column (food, parcel, person_ride, or NULL for general)
  - **Source**: `ticket_source` column (CUSTOMER, RIDER, MERCHANT, etc.)
  - **Ticket Type**: `ticket_type` column (ORDER_RELATED, NON_ORDER_RELATED)

**Filtering Logic:**
- `TICKET_FOOD`: `order_type = 'food'` OR (`service_type = 'FOOD'` AND `order_type IS NULL`)
- `TICKET_PARCEL`: `order_type = 'parcel'` OR (`service_type = 'PARCEL'` AND `order_type IS NULL`)
- `TICKET_PERSON_RIDE`: `order_type = 'person_ride'` OR (`service_type = 'RIDE'` AND `order_type IS NULL`)
- `TICKET_GENERAL`: `ticket_type = 'NON_ORDER_RELATED'` OR `order_type IS NULL`
- `TICKET_CUSTOMER_FOOD`: `ticket_source = 'CUSTOMER'` AND (`order_type = 'food'` OR `service_type = 'FOOD'`)
- Similar logic for other granular ticket types

### 5. Database Query Examples

#### Get Food Customers
```sql
SELECT DISTINCT c.*
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id
WHERE o.order_type = 'food'
  AND o.status NOT IN ('cancelled', 'failed');
```

#### Get Food Tickets
```sql
SELECT *
FROM unified_tickets
WHERE order_type = 'food'
   OR (service_type = 'FOOD' AND ticket_type = 'NON_ORDER_RELATED');
```

#### Get Customer Food Tickets
```sql
SELECT *
FROM unified_tickets
WHERE ticket_source = 'CUSTOMER'
  AND (order_type = 'food' OR service_type = 'FOOD');
```

### 6. User Access Assignment

When creating/editing a user, super admin can now:
1. **Assign Customer Dashboard Access:**
   - `CUSTOMER` - Access to all customers
   - `CUSTOMER_FOOD` - Access to food customers only
   - `CUSTOMER_PARCEL` - Access to parcel customers only
   - `CUSTOMER_PERSON_RIDE` - Access to person_ride customers only
   - Or any combination of the above

2. **Assign Ticket Dashboard Access:**
   - Main categories: `TICKET_FOOD`, `TICKET_PARCEL`, `TICKET_PERSON_RIDE`, `TICKET_GENERAL`
   - Granular categories: `TICKET_CUSTOMER_FOOD`, `TICKET_RIDER_PARCEL`, etc.
   - Or any combination

3. **Order Type Granularity:**
   - The `orderType` column in `dashboard_access` is automatically set based on dashboard type
   - For ticket dashboards, `orderType` is set to the corresponding order type (food, parcel, person_ride) or NULL for general tickets

### 7. Benefits

1. **Granular Access Control:**
   - Agents can be assigned access to specific customer or ticket types
   - Example: Agent can only view food customers and food tickets

2. **Better Organization:**
   - Separate dashboards for each order type
   - Easier to find and manage customers/tickets by category

3. **Improved Performance:**
   - Filtered queries are more efficient
   - Indexes on `order_type` improve query speed

4. **Audit Trail:**
   - All actions are logged with `order_type` for better tracking
   - Can filter audit logs by order type

5. **Scalability:**
   - Easy to add more order types in the future
   - Structure supports additional ticket categories

### 8. Migration Steps

1. **Run Migration 0050:**
   ```bash
   psql -d your_database -f dashboard/drizzle/0050_add_order_type_to_tickets.sql
   ```
   - Adds `order_type` to `unified_tickets`
   - Updates existing tickets
   - Creates indexes and triggers

2. **Run Migration 0051:**
   ```bash
   psql -d your_database -f dashboard/drizzle/0051_migrate_customer_ticket_dashboard_access.sql
   ```
   - Migrates existing dashboard access
   - Creates new access records for separated dashboards

3. **Update Application Code:**
   - Deploy updated frontend code
   - New dashboard pages will be available
   - Existing users will have access to new dashboards (migrated automatically)

### 9. Backward Compatibility

- Existing `CUSTOMER` and `TICKET` dashboard access is preserved
- New granular dashboards are created in addition to existing ones
- Users can still access general dashboards if they have `CUSTOMER` or `TICKET` access
- No breaking changes to existing functionality

### 10. Future Enhancements

1. **Customer Analytics by Order Type:**
   - Separate analytics dashboards for each customer type
   - Track customer behavior by order type

2. **Ticket Routing:**
   - Auto-assign tickets to agents based on order type access
   - Route food tickets to food-specialized agents

3. **Performance Metrics:**
   - Track ticket resolution time by order type
   - Monitor customer satisfaction by order type

4. **Reporting:**
   - Generate reports filtered by order type
   - Compare metrics across order types

## Summary

The implementation successfully separates:
- **Customer dashboards** into 4 types (all, food, parcel, person_ride)
- **Ticket dashboards** into 16 types (4 main + 12 granular by source and order type)

All changes are backward compatible and include:
- Database migrations
- Schema updates
- Frontend pages
- Access control updates
- API route updates
- Permission checks

The system now provides granular access control for customers and tickets, matching the order dashboard separation pattern.
