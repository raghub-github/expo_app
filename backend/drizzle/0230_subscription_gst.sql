-- Subscription GST — add SUBSCRIPTION_FEE applicable_base + seed a default 18% rate.
--
-- Background: subscription charges (e.g. "GMitra Plus", "GMitra Gold") land in
-- `state.miscFee` inside the billing pipeline. The tax engine didn't have a
-- bucket aimed at that, so subscriptions were billed without GST. We add a
-- new applicable_base value and seed an 18% rate so every subscription rule
-- automatically picks up the standard GST going forward.

-- 1) Enum value (separate from any INSERT — Postgres requires its own tx).
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'SUBSCRIPTION_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
