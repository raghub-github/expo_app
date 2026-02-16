# Enterprise Ticket System - Complete Table Count

## Overview

This document provides a comprehensive list of all tables created for the Enterprise Ticket Management System, including audit logs, tracking, and supporting tables.

---

## Core Ticket Tables (11 Tables)

### 1. `tickets`
**Purpose:** Main ticket table - single source of truth for all tickets
**Key Features:**
- Supports all services (food, parcel, person_ride, other)
- 3PL/external order support
- SLA tracking
- Status lifecycle management

### 2. `ticket_groups`
**Purpose:** Flexible grouping system for tickets (future planning)
**Key Features:**
- Hierarchical groups (parent-child relationships)
- Service/section-specific groups
- Display ordering
- Future-proof design

### 3. `ticket_titles`
**Purpose:** Dynamic catalog of ticket titles
**Key Features:**
- Configurable per service/section/source
- Group association (via ticket_groups)
- Enable/disable titles
- Analytics support

### 4. `ticket_participants`
**Purpose:** Polymorphic actors in tickets
**Key Features:**
- Supports customers, riders, 3PL riders, merchants, system users, providers
- Multiple participants per ticket
- Roles: creator, affected_party, pickup, drop

### 5. `ticket_assignments`
**Purpose:** Complete assignment history
**Key Features:**
- Never overwritten
- Tracks all assignments and reassignments
- Unassignment tracking
- Workload queries support

### 6. `ticket_messages`
**Purpose:** Conversation thread
**Key Features:**
- All messages, replies, internal notes
- System messages
- Attachment support (JSONB)
- Edit tracking

### 7. `ticket_status_history`
**Purpose:** Status transition history
**Key Features:**
- Every status change logged
- Reason required for close/reject/reopen
- Changed-by tracking
- Audit support

### 8. `ticket_actions_audit`
**Purpose:** Immutable audit log
**Key Features:**
- Append-only (never updated/deleted)
- All actions logged
- Old/new value tracking
- Compliance support

### 9. `ticket_ratings`
**Purpose:** Post-resolution feedback
**Key Features:**
- One rating per ticket per actor
- Only allowed after resolution/closure
- Supports customers, riders, merchants

### 10. `ticket_tags`
**Purpose:** Tag master table
**Key Features:**
- Predefined tags (fraud, abuse, escalation, etc.)
- Custom tags support
- Color coding for UI

### 11. `ticket_tag_map`
**Purpose:** Many-to-many tag mapping
**Key Features:**
- Links tickets to tags
- Tracks who added tag and when
- Supports filtering and analytics

---

## Supporting Tables (Referenced, Not Created in This Migration)

### External References:
- `system_users` - For agents, assignees, creators
- `orders` - For order-related tickets
- `customers` - For customer participants
- `riders` - For internal rider participants
- `merchant_stores` - For merchant participants
- `tpl_providers` - For 3PL provider references (if exists)

---

## Total Table Count

### Tables Created in This Migration: **11 Tables**

1. `tickets` - Main ticket entity
2. `ticket_groups` - Grouping system
3. `ticket_titles` - Title catalog
4. `ticket_participants` - Participants
5. `ticket_assignments` - Assignment history
6. `ticket_messages` - Messages
7. `ticket_status_history` - Status history
8. `ticket_actions_audit` - Audit log
9. `ticket_ratings` - Ratings
10. `ticket_tags` - Tags
11. `ticket_tag_map` - Tag mapping

### Audit & Tracking Tables: **3 Tables**

1. `ticket_actions_audit` - Complete action audit (immutable)
2. `ticket_status_history` - Status change tracking
3. `ticket_assignments` - Assignment tracking

### Dashboard Support Tables: **All 11 Tables**

All tables support dashboard operations:
- List queries (with pagination)
- Filtering (by service, status, assignee, etc.)
- Search (by ticket number, subject, description)
- Analytics (aggregations, reports)
- Real-time updates (via status changes)

---

## Table Relationships

```
ticket_groups (1) ──< (many) ticket_titles
ticket_titles (1) ──< (many) tickets
tickets (1) ──< (many) ticket_participants
tickets (1) ──< (many) ticket_assignments
tickets (1) ──< (many) ticket_messages
tickets (1) ──< (many) ticket_status_history
tickets (1) ──< (many) ticket_actions_audit
tickets (1) ──< (many) ticket_ratings
tickets (1) ──< (many) ticket_tag_map
ticket_tags (1) ──< (many) ticket_tag_map
```

---

## Index Count

### Performance Indexes: **50+ Indexes**

- **tickets:** 12 indexes
- **ticket_groups:** 4 indexes
- **ticket_titles:** 5 indexes
- **ticket_participants:** 6 indexes
- **ticket_assignments:** 3 indexes
- **ticket_messages:** 4 indexes
- **ticket_status_history:** 3 indexes
- **ticket_actions_audit:** 4 indexes
- **ticket_ratings:** 4 indexes
- **ticket_tags:** 2 indexes
- **ticket_tag_map:** 3 indexes

---

## 3PL/External Support

### Enhanced Fields:

**In `tickets` table:**
- `is_3pl_order` - Flag for 3PL orders
- `tpl_provider_id` - Reference to 3PL provider
- `tpl_direction` - 'inbound' or 'outbound'
- `external_order_id` - External provider's order ID
- `external_provider_name` - Provider name

**In `ticket_participants` table:**
- `rider_3pl_id` - 3PL/external rider ID
- `provider_id` - 3PL provider ID
- `external_provider_name` - External provider name
- `external_entity_id` - External entity ID
- `external_entity_name` - External entity name

**New Entity Types:**
- `rider_3pl` - 3PL/external rider
- `provider` - External provider

**New Source Roles:**
- `rider_3pl` - Ticket raised by 3PL rider
- `provider` - Ticket raised by external provider

---

## Summary

**Total Tables for Ticket Dashboard System: 11**

- **Core Tables:** 11
- **Audit & Tracking:** 3 (subset of core)
- **Dashboard Support:** 11 (all tables)

**Key Features:**
- ✅ 3PL/External order support
- ✅ 3PL/External rider support
- ✅ Flexible grouping system (future planning)
- ✅ Complete audit trail
- ✅ Full tracking and history
- ✅ Optimized for 10M+ tickets
- ✅ Service-wise RBAC support

All tables are production-ready and designed for enterprise-scale operations.
