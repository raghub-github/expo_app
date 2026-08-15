-- =============================================================================
-- 0536a — Commit new referral enum values before they are used
-- Must run and COMMIT before 0536 (CHECK constraints / inserts).
-- Catalog only. No table rewrite.
-- =============================================================================

DO $$ BEGIN
  ALTER TYPE referral_user_type ADD VALUE 'merchant';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN unique_violation THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE referral_rule_event_type ADD VALUE 'REGISTRATION_COMPLETED';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN unique_violation THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE referral_rule_event_type ADD VALUE 'STORE_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN unique_violation THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE referral_rule_event_type ADD VALUE 'MENU_COMPLETED';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN unique_violation THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE referral_rule_event_type ADD VALUE 'ACTIVE_DAYS';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN unique_violation THEN NULL; END $$;
