# Agent Activity Tracking Implementation

## Overview
This implementation adds comprehensive agent activity tracking for the Enterprise Ticket Dashboard, including online/offline status management, break tracking, and detailed activity metrics (tickets handled, CSAT/DSAT, time online, etc.).

## Features Implemented

### 1. Online/Offline Toggle
- **Location**: Right sidebar header, next to "Tickets" text (Tickets dashboard only)
- **Functionality**: 
  - Toggle between Online/Offline status
  - Take breaks (with duration tracking)
  - Status persists across sessions
  - Only visible to agents with ticket edit access (UPDATE or ASSIGN permissions)

### 2. Agent Activity Dashboard
- **Route**: `/dashboard/tickets/agent-activity`
- **Features**:
  - View activity stats for Today, Week, Month, or Custom date range
  - Track online time, break time, active time
  - View tickets assigned, resolved, closed, updated, reopened
  - CSAT/DSAT metrics with average ratings
  - Daily breakdown table
  - Real-time status updates

### 3. Database Schema

#### Enhanced Tables
- **`agent_profiles`**: Extended with:
  - `current_status` (online, offline, break, busy)
  - `break_started_at`
  - `total_online_time_minutes`
  - `total_break_time_minutes`
  - `last_activity_at`

- **`agent_availability_logs`**: Enhanced to support 'break' status

#### New Tables
- **`agent_activity_logs`**: Daily aggregated activity metrics
  - Time tracking (online, break, active)
  - Ticket metrics (assigned, resolved, closed, etc.)
  - CSAT/DSAT scores
  - Service breakdown (JSONB)
  - One record per agent per day

- **`agent_break_logs`**: Individual break sessions
  - Break type (lunch, tea, personal, other)
  - Start/end times
  - Duration calculation
  - Active break tracking

#### Database Functions & Triggers
- **`update_agent_activity_on_ticket_action()`**: Automatically updates activity logs when tickets are resolved/closed/updated
- **`calculate_online_time_on_status_change()`**: Calculates and updates total online time when agent goes offline

### 4. API Endpoints

#### GET `/api/agents/status`
- Fetches current agent's online/offline status
- Returns: `isOnline`, `currentStatus`, `breakStartedAt`, `lastOnlineAt`, `totalOnlineTimeMinutes`, `totalBreakTimeMinutes`

#### PATCH `/api/agents/status`
- Updates agent status (online, offline, break, busy)
- **Permission Check**: Requires ticket UPDATE or ASSIGN permissions
- Handles status transitions:
  - Online → Offline: Calculates online duration
  - Online → Break: Creates break log, calculates online time
  - Break → Online/Offline: Ends break, calculates break duration
- Logs all status changes to `agent_availability_logs`
- Updates `agent_profiles` and `agent_break_logs` accordingly

#### GET `/api/agents/activity`
- Fetches agent activity stats for a given period
- **Query Parameters**:
  - `period`: today, week, month, custom
  - `startDate`: Required if period=custom
  - `endDate`: Required if period=custom
- **Permission Check**: Requires ticket UPDATE or ASSIGN permissions
- Returns aggregated stats and daily breakdown

### 5. UI Components

#### `AgentStatusToggle` Component
- **Location**: `dashboard/src/components/tickets/AgentStatusToggle.tsx`
- **Features**:
  - Online/Offline toggle button with status indicator
  - Dropdown menu for status options (Online, Break, Offline)
  - Settings gear icon (links to activity page)
  - Auto-refreshes status every 30 seconds
  - Handles loading and error states

#### `AgentActivityPageClient` Component
- **Location**: `dashboard/src/components/tickets/AgentActivityPageClient.tsx`
- **Features**:
  - Period selector (Today, Week, Month, Custom)
  - Summary cards (Online Time, Tickets Resolved, CSAT Score, DSAT Count)
  - Detailed metrics tables (Ticket Metrics, Time Metrics)
  - Daily breakdown table
  - Responsive design

#### `RightSidebar` Updates
- Added `AgentStatusToggle` to sidebar header
- Only visible on Tickets dashboard
- Positioned next to "Tickets" text
- Shows in both expanded and collapsed states

## SQL Migration

### File: `backend/drizzle/0062_agent_activity_tracking.sql`

**To apply the migration:**
```sql
-- Run this SQL file in your PostgreSQL/Supabase SQL editor
-- This will:
-- 1. Enhance agent_profiles table with new fields
-- 2. Update agent_availability_logs to support 'break' status
-- 3. Create agent_activity_logs table
-- 4. Create agent_break_logs table
-- 5. Create database functions and triggers
```

## Permission Model

The online/offline toggle and activity dashboard are only available to agents who have:
- **TICKET dashboard access** AND
- **UPDATE** or **ASSIGN** action permissions on any `TICKET_ACTIONS_*` access point groups

The API endpoints enforce these permissions and return `403 Forbidden` if the user doesn't have access.

## Usage

### For Agents:
1. Navigate to Tickets dashboard
2. See online/offline toggle in right sidebar header
3. Click toggle to change status (Online/Offline/Break)
4. Click gear icon to view activity dashboard
5. View stats for different time periods

### For Super Admins:
- Can view all agent activity (future enhancement)
- Can manage agent profiles and settings (future enhancement)

## Future Enhancements

1. **Auto-assignment Engine Integration**: Use `is_online` status to automatically assign tickets to available agents
2. **Break Management**: Allow agents to set break duration, break types, and break schedules
3. **Activity Reports**: Generate PDF/Excel reports for agent activity
4. **Team Leader Dashboard**: View all team members' activity
5. **Performance Alerts**: Notify when CSAT drops or tickets are overdue
6. **Activity Graphs**: Visual charts for time trends, ticket resolution trends, etc.

## Files Created/Modified

### Created:
- `backend/drizzle/0062_agent_activity_tracking.sql`
- `dashboard/src/app/api/agents/status/route.ts`
- `dashboard/src/app/api/agents/activity/route.ts`
- `dashboard/src/components/tickets/AgentStatusToggle.tsx`
- `dashboard/src/components/tickets/AgentActivityPageClient.tsx`
- `dashboard/src/app/dashboard/tickets/agent-activity/page.tsx`

### Modified:
- `backend/src/db/schema.ts` (added agent activity tables and relations)
- `dashboard/src/components/layout/RightSidebar.tsx` (added toggle component)

## Testing Checklist

- [ ] Toggle online/offline status works
- [ ] Break functionality tracks duration correctly
- [ ] Activity stats display correctly for different periods
- [ ] Permission check prevents unauthorized access
- [ ] Database triggers update activity logs automatically
- [ ] Status persists across page refreshes
- [ ] UI is responsive and matches design requirements
