-- ============================================================================
-- 0130_merchant_store_bank_accounts_extensions.sql
-- Extend merchant_store_bank_accounts for payout onboarding + enforcement.
-- Existing base table is created in 0010_merchant_domain_complete.sql.
-- This migration is idempotent and safe to run multiple times.
-- ============================================================================

-- Additional payout and verification fields used by partner app and payout
-- processors (e.g. Razorpay). Columns are added only when missing so that
-- local dev and prod can evolve independently.
ALTER TABLE merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS payout_method TEXT NULL,
  ADD COLUMN IF NOT EXISTS bank_proof_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS bank_proof_file_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS upi_qr_screenshot_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_contact_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_fund_account_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_proof_r2_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS upi_qr_r2_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS verification_response JSONB NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS razorpay_validation_id TEXT NULL;

-- Indexes / constraints to match reference schema. These use IF NOT EXISTS
-- guards where possible; for partial unique indexes we rely on constraint
-- names to avoid duplicates.
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_active_idx
  ON merchant_store_bank_accounts(is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_verified_idx
  ON merchant_store_bank_accounts(is_verified);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'merchant_store_bank_accounts_one_primary_per_store'
  ) THEN
    CREATE UNIQUE INDEX merchant_store_bank_accounts_one_primary_per_store
      ON merchant_store_bank_accounts(store_id)
      WHERE is_primary = TRUE;
  END IF;
END;
$$;

-- Helper function: when a row is inserted/updated with is_primary = true,
-- automatically clear primary flag on other rows for that store. This keeps
-- the partial UNIQUE index satisfied even if updates come concurrently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'merchant_store_bank_accounts_set_primary'
  ) THEN
    CREATE OR REPLACE FUNCTION merchant_store_bank_accounts_set_primary()
    RETURNS TRIGGER AS $BODY$
    BEGIN
      IF NEW.is_primary = TRUE THEN
        UPDATE merchant_store_bank_accounts
        SET is_primary = FALSE
        WHERE store_id = NEW.store_id
          AND id <> NEW.id
          AND is_primary = TRUE;
      END IF;
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'merchant_store_bank_accounts_set_primary_trigger'
  ) THEN
    CREATE TRIGGER merchant_store_bank_accounts_set_primary_trigger
    BEFORE INSERT OR UPDATE OF is_primary
    ON merchant_store_bank_accounts
    FOR EACH ROW
    WHEN (NEW.is_primary = TRUE)
    EXECUTE FUNCTION merchant_store_bank_accounts_set_primary();
  END IF;
END;
$$;

-- Ensure updated_at stays fresh on UPDATE (base migration only added trigger
-- in 0011 for UPDATE; here we re-create idempotently for safety).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'merchant_store_bank_accounts_updated_at_trigger'
  ) THEN
    CREATE TRIGGER merchant_store_bank_accounts_updated_at_trigger
    BEFORE UPDATE ON merchant_store_bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

