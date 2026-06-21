-- ============================================================================
-- 0349: Customer accessibility preferences (hearing, vision, mobility)
-- Run AFTER 0348_checkout_gaticash_missed_offer_adjustments.sql
-- Defaults match Zomato-style "no impairment" selections for all categories.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.customer_hearing_accessibility AS ENUM (
    'deaf',
    'hard_of_hearing',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_vision_accessibility AS ENUM (
    'blind',
    'visual_impairment',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_mobility_accessibility AS ENUM (
    'wheelchair_or_mobility_aid',
    'physical_disability_mobility',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS hearing_accessibility public.customer_hearing_accessibility
    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS vision_accessibility public.customer_vision_accessibility
    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS mobility_accessibility public.customer_mobility_accessibility
    NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.customers.hearing_accessibility IS
  'Customer hearing accessibility preference: deaf | hard_of_hearing | none (default).';

COMMENT ON COLUMN public.customers.vision_accessibility IS
  'Customer vision accessibility preference: blind | visual_impairment | none (default).';

COMMENT ON COLUMN public.customers.mobility_accessibility IS
  'Customer mobility accessibility preference: wheelchair_or_mobility_aid | physical_disability_mobility | none (default).';
