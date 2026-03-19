-- Migration: 0131_merchant_parents_supabase_user_id
-- Purpose: Add supabase_user_id to merchant_parents (same as partnersite) for session/login linking.
-- Safe to run: only adds column/index if missing.

ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS supabase_user_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_parents_supabase_user_id_key
  ON public.merchant_parents(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

COMMENT ON COLUMN public.merchant_parents.supabase_user_id IS 'Supabase Auth user id (auth.users.id). Set on registration; used for session validation.';
