-- Rider tip as a configurable billing rule (amount still comes from checkout `tipAmount`; never taxed).
-- Enum value must be in its own migration if followed by inserts using it (see 0180).

DO $$ BEGIN
  ALTER TYPE billing_rule_type ADD VALUE 'RIDER_TIP';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
