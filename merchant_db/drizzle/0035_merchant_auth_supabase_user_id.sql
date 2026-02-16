-- ============================================================================
-- MERCHANT DASHBOARD AUTH: Link merchant_parents to Supabase Auth
-- Migration: 0035_merchant_auth_supabase_user_id
-- Purpose: Allow merchants to register with email/password and login via
--          Supabase Auth; session managed same as main dashboard (24h).
-- ============================================================================

-- Add Supabase Auth user id to merchant_parents (links to auth.users.id).
-- No FK to auth schema; we store the UUID for lookup only.
ALTER TABLE merchant_parents
  ADD COLUMN IF NOT EXISTS supabase_user_id UUID;

-- Unique constraint: one Supabase user can link to at most one merchant parent.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_parents_supabase_user_id_key
  ON merchant_parents(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

-- Index for login lookup: find merchant by email (owner_email already has
-- unique index in 0025: merchant_parents_email_idx).
-- No new index needed for owner_email.

COMMENT ON COLUMN merchant_parents.supabase_user_id IS 'Supabase Auth user id (auth.users.id). Set on registration; used for session validation.';
