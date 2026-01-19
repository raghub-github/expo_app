# Granular Service-Based Access Control Implementation Plan

## Overview
Implement service-specific access control for RIDER, TICKET, and CUSTOMER dashboards. Each dashboard remains single, but access points are now service-specific (food, parcel, person_ride).

## Requirements Summary

### 1. RIDER Dashboard
- **Single Dashboard**: One RIDER dashboard for all services
- **View Access**: `RIDER_VIEW` - Can view all rider data (all services)
- **Action Access**: Service-specific action access points:
  - `RIDER_ACTIONS_FOOD` - Actions for food orders only
  - `RIDER_ACTIONS_PARCEL` - Actions for parcel orders only
  - `RIDER_ACTIONS_PERSON_RIDE` - Actions for person ride orders only
- **Actions Include**: Cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate, etc.
- **Logic**: If agent has view access, they see everything but can only take actions on services they have access to

### 2. TICKET Dashboard
- **Single Dashboard**: One TICKET dashboard for all services
- **Service Access**: Separate access for FOOD, PARCEL, PERSON_RIDE
- **Ticket Types per Service**:
  - Order-related tickets
  - Non-order-related tickets
  - Others
- **Sources per Service**:
  - **FOOD**: Customer, Rider, Merchant
  - **PARCEL**: Customer (pickup), Customer (drop), Rider
  - **PERSON_RIDE**: Customer (pickup), Customer (drop), Rider
- **Access Levels**:
  - `TICKET_VIEW_FOOD`, `TICKET_VIEW_PARCEL`, `TICKET_VIEW_PERSON_RIDE` - View access per service
  - `TICKET_ACTIONS_FOOD`, `TICKET_ACTIONS_PARCEL`, `TICKET_ACTIONS_PERSON_RIDE` - Action access per service
- **Actions**: Resolve, close, reply, assign

### 3. CUSTOMER Dashboard
- **Single Dashboard**: One CUSTOMER dashboard for all services
- **View Access**: `CUSTOMER_VIEW` - Can view all customers (all services)
- **Action Access**: Service-specific action access points:
  - `CUSTOMER_ACTIONS_FOOD` - Actions for food customers only
  - `CUSTOMER_ACTIONS_PARCEL` - Actions for parcel customers only
  - `CUSTOMER_ACTIONS_PERSON_RIDE` - Actions for person ride customers only
- **Actions**: Block, suspend, activate, etc.

### 4. ORDER Dashboards
- **Already Separated**: ORDER_FOOD, ORDER_PARCEL, ORDER_PERSON_RIDE
- **No Changes Needed**: Already have service-specific access points

## Database Schema Changes

### 1. Update `dashboard_access_points` Table
- **Reuse `order_type` column** for service_type (food, parcel, person_ride)
- **Update unique constraint** to include `order_type` (service_type) for RIDER, TICKET, CUSTOMER dashboards
- **Add index** on `(dashboard_type, order_type, access_point_group)` for performance

### 2. New Access Point Groups

#### RIDER Dashboard:
- `RIDER_VIEW` (order_type: NULL - applies to all services)
- `RIDER_ACTIONS_FOOD` (order_type: 'food')
- `RIDER_ACTIONS_PARCEL` (order_type: 'parcel')
- `RIDER_ACTIONS_PERSON_RIDE` (order_type: 'person_ride')

#### TICKET Dashboard:
- `TICKET_VIEW_FOOD` (order_type: 'food')
- `TICKET_VIEW_PARCEL` (order_type: 'parcel')
- `TICKET_VIEW_PERSON_RIDE` (order_type: 'person_ride')
- `TICKET_ACTIONS_FOOD` (order_type: 'food')
- `TICKET_ACTIONS_PARCEL` (order_type: 'parcel')
- `TICKET_ACTIONS_PERSON_RIDE` (order_type: 'person_ride')
- Remove old: `TICKET_ORDER_RELATED`, `TICKET_NON_ORDER`, `TICKET_MERCHANT_SECTION`, etc.

#### CUSTOMER Dashboard:
- `CUSTOMER_VIEW` (order_type: NULL - applies to all services)
- `CUSTOMER_ACTIONS_FOOD` (order_type: 'food')
- `CUSTOMER_ACTIONS_PARCEL` (order_type: 'parcel')
- `CUSTOMER_ACTIONS_PERSON_RIDE` (order_type: 'person_ride')

## Implementation Steps

### Step 1: Database Migration
1. Update unique constraint on `dashboard_access_points` to include `order_type`
2. Migrate existing access points to new structure
3. Archive old access point groups
4. Add indexes for performance

### Step 2: Schema Type Updates
1. Update `AccessPointGroup` enum with new groups
2. Update TypeScript types for service-based access

### Step 3: UI Component Updates
1. Update `DashboardAccessSelector` to show service-based selection
2. Add service type checkboxes/selectors for RIDER, TICKET, CUSTOMER
3. Update `UserForm` to handle service-based access

### Step 4: Permission Engine Updates
1. Update permission checking to consider `order_type` (service_type)
2. Add helper functions for service-based permission checks
3. Update action permission checks

### Step 5: Backend API Updates
1. Update user creation/update APIs to handle service-based access
2. Update dashboard access query to include service_type filtering

## Migration Strategy

1. **Add new access points** with service_type
2. **Migrate existing access** to new structure
3. **Archive old access points** (mark as inactive)
4. **Update unique constraint** to prevent duplicates

## Notes

- `order_type` column will be reused for service_type (food, parcel, person_ride)
- For ORDER dashboards, `order_type` already exists and works correctly
- View access points have `order_type = NULL` to apply to all services
- Action access points have specific `order_type` values
