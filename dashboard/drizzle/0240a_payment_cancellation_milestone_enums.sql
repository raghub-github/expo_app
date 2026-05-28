-- 0240a: Add cancellation shorthand milestones (run alone, then commit, then run 0240)
-- PostgreSQL 55P04: new enum values cannot be used in the same transaction as ADD VALUE.
DO $$ BEGIN
  ALTER TYPE payment_order_milestone ADD VALUE 'PRE_PICKUP_CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE payment_order_milestone ADD VALUE 'POST_PICKUP_CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
