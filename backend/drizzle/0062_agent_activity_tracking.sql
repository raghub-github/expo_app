-- ============================================================================
-- AGENT ACTIVITY TRACKING - Enhanced tables for online/offline status, breaks, and activity metrics
-- Migration: 0062_agent_activity_tracking
-- ============================================================================
-- This migration enhances agent_profiles and agent_availability_logs tables
-- and adds agent_activity_logs for comprehensive activity tracking
-- ============================================================================

-- ============================================================================
-- 1. ENHANCE agent_profiles TABLE
-- ============================================================================
-- Add break support and additional tracking fields

DO $$ 
BEGIN
  -- Add break_started_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_profiles' AND column_name = 'break_started_at'
  ) THEN
    ALTER TABLE agent_profiles ADD COLUMN break_started_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add current_status if it doesn't exist (online, offline, break, busy)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_profiles' AND column_name = 'current_status'
  ) THEN
    ALTER TABLE agent_profiles ADD COLUMN current_status TEXT DEFAULT 'offline' 
      CHECK (current_status IN ('online', 'offline', 'break', 'busy'));
  END IF;

  -- Add total_online_time_minutes if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_profiles' AND column_name = 'total_online_time_minutes'
  ) THEN
    ALTER TABLE agent_profiles ADD COLUMN total_online_time_minutes INTEGER DEFAULT 0;
  END IF;

  -- Add total_break_time_minutes if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_profiles' AND column_name = 'total_break_time_minutes'
  ) THEN
    ALTER TABLE agent_profiles ADD COLUMN total_break_time_minutes INTEGER DEFAULT 0;
  END IF;

  -- Add last_activity_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_profiles' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE agent_profiles ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS agent_profiles_current_status_idx ON agent_profiles(current_status) WHERE current_status = 'online';
CREATE INDEX IF NOT EXISTS agent_profiles_last_activity_idx ON agent_profiles(last_activity_at);

-- ============================================================================
-- 2. ENHANCE agent_availability_logs TABLE
-- ============================================================================
-- Add break support

DO $$ 
BEGIN
  -- Update status check constraint to include 'break'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'agent_availability_logs_status_check'
  ) THEN
    ALTER TABLE agent_availability_logs DROP CONSTRAINT agent_availability_logs_status_check;
  END IF;
END $$;

-- Recreate constraint with break status
ALTER TABLE agent_availability_logs 
  ADD CONSTRAINT agent_availability_logs_status_check 
  CHECK (status IN ('online', 'offline', 'away', 'busy', 'break'));

-- ============================================================================
-- 3. CREATE agent_activity_logs TABLE
-- ============================================================================
-- Tracks detailed agent activity: tickets handled, CSAT/DSAT, time spent, etc.

CREATE TABLE IF NOT EXISTS agent_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Activity Date
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Time Tracking
  online_time_minutes INTEGER DEFAULT 0,
  break_time_minutes INTEGER DEFAULT 0,
  active_time_minutes INTEGER DEFAULT 0, -- Time actually working on tickets
  
  -- Ticket Metrics
  tickets_assigned INTEGER DEFAULT 0,
  tickets_resolved INTEGER DEFAULT 0,
  tickets_closed INTEGER DEFAULT 0,
  tickets_reopened INTEGER DEFAULT 0,
  tickets_updated INTEGER DEFAULT 0,
  tickets_replied INTEGER DEFAULT 0,
  
  -- Response Time Metrics (in minutes)
  avg_first_response_time_minutes NUMERIC(10, 2),
  avg_resolution_time_minutes NUMERIC(10, 2),
  
  -- Quality Metrics
  csat_score NUMERIC(3, 2), -- Average CSAT score for the day
  dsat_count INTEGER DEFAULT 0, -- Number of DSAT ratings received
  csat_count INTEGER DEFAULT 0, -- Number of CSAT ratings received
  
  -- Service Type Breakdown (JSONB for flexibility)
  service_breakdown JSONB DEFAULT '{}'::jsonb,
  -- Example: {"food": {"tickets": 10, "resolved": 8}, "parcel": {"tickets": 5, "resolved": 4}}
  
  -- Status Summary
  status_summary JSONB DEFAULT '{}'::jsonb,
  -- Example: {"online_sessions": 3, "break_sessions": 2, "last_status": "offline"}
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one record per agent per day
  UNIQUE(agent_user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS agent_activity_logs_agent_id_idx ON agent_activity_logs(agent_user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS agent_activity_logs_activity_date_idx ON agent_activity_logs(activity_date DESC);
CREATE INDEX IF NOT EXISTS agent_activity_logs_agent_date_idx ON agent_activity_logs(agent_user_id, activity_date);

COMMENT ON TABLE agent_activity_logs IS 'Daily aggregated activity logs for agents - tracks tickets handled, CSAT/DSAT, time online, etc.';

-- ============================================================================
-- 4. CREATE agent_break_logs TABLE
-- ============================================================================
-- Tracks individual break sessions

CREATE TABLE IF NOT EXISTS agent_break_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Break Details
  break_type TEXT CHECK (break_type IN ('lunch', 'tea', 'personal', 'other')) DEFAULT 'other',
  reason TEXT,
  
  -- Timing
  break_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  break_ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER, -- Calculated when break ends
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_break_logs_agent_id_idx ON agent_break_logs(agent_user_id, break_started_at DESC);
CREATE INDEX IF NOT EXISTS agent_break_logs_active_idx ON agent_break_logs(agent_user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS agent_break_logs_date_idx ON agent_break_logs(agent_user_id, break_started_at);

COMMENT ON TABLE agent_break_logs IS 'Individual break sessions for agents - tracks when agents take breaks';

-- ============================================================================
-- 5. CREATE FUNCTION to update agent activity on ticket actions
-- ============================================================================
-- This function can be called when tickets are resolved/closed/updated

CREATE OR REPLACE FUNCTION update_agent_activity_on_ticket_action()
RETURNS TRIGGER AS $$
DECLARE
  agent_id BIGINT;
  action_type TEXT;
BEGIN
  -- Only process if assignee changed or status changed to resolved/closed
  IF (TG_OP = 'UPDATE' AND (
    OLD.current_assignee_user_id IS DISTINCT FROM NEW.current_assignee_user_id OR
    (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('resolved', 'closed'))
  )) THEN
    agent_id := NEW.current_assignee_user_id;
    
    IF agent_id IS NOT NULL THEN
      -- Update or insert activity log for today
      INSERT INTO agent_activity_logs (
        agent_user_id,
        activity_date,
        tickets_updated,
        tickets_resolved,
        tickets_closed,
        last_activity_at
      )
      VALUES (
        agent_id,
        CURRENT_DATE,
        CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'resolved' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status = 'closed' THEN 1 ELSE 0 END,
        NOW()
      )
      ON CONFLICT (agent_user_id, activity_date) 
      DO UPDATE SET
        tickets_updated = agent_activity_logs.tickets_updated + 
          CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 1 ELSE 0 END,
        tickets_resolved = agent_activity_logs.tickets_resolved + 
          CASE WHEN NEW.status = 'resolved' THEN 1 ELSE 0 END,
        tickets_closed = agent_activity_logs.tickets_closed + 
          CASE WHEN NEW.status = 'closed' THEN 1 ELSE 0 END,
        last_activity_at = NOW(),
        updated_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on tickets table
DROP TRIGGER IF EXISTS trigger_update_agent_activity ON tickets;
CREATE TRIGGER trigger_update_agent_activity
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_activity_on_ticket_action();

COMMENT ON FUNCTION update_agent_activity_on_ticket_action() IS 'Automatically updates agent activity logs when tickets are updated/resolved/closed';

-- ============================================================================
-- 6. CREATE FUNCTION to calculate online time when status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_online_time_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  duration_min INTEGER;
BEGIN
  -- When status changes from online/break/busy to offline, calculate duration
  IF (OLD.current_status IN ('online', 'break', 'busy') AND NEW.current_status = 'offline') THEN
    IF OLD.last_online_at IS NOT NULL THEN
      duration_min := EXTRACT(EPOCH FROM (NOW() - OLD.last_online_at)) / 60;
      
      -- Update total online time
      UPDATE agent_profiles
      SET total_online_time_minutes = total_online_time_minutes + COALESCE(duration_min, 0)
      WHERE user_id = NEW.user_id;
      
      -- Update availability log duration (find the most recent log entry)
      UPDATE agent_availability_logs
      SET duration_minutes = COALESCE(duration_min, 0)
      WHERE id = (
        SELECT id FROM agent_availability_logs
        WHERE agent_user_id = NEW.user_id 
          AND status = OLD.current_status
          AND changed_at >= OLD.last_online_at
          AND duration_minutes IS NULL
        ORDER BY changed_at DESC
        LIMIT 1
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on agent_profiles
DROP TRIGGER IF EXISTS trigger_calculate_online_time ON agent_profiles;
CREATE TRIGGER trigger_calculate_online_time
  AFTER UPDATE OF current_status ON agent_profiles
  FOR EACH ROW
  WHEN (OLD.current_status IS DISTINCT FROM NEW.current_status)
  EXECUTE FUNCTION calculate_online_time_on_status_change();

COMMENT ON FUNCTION calculate_online_time_on_status_change() IS 'Calculates and updates total online time when agent goes offline';
