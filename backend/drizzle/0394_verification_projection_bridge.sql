-- ============================================================================
--  0394_verification_projection_bridge
--
--  Non-invasive bridge from the new verification_* tables to the existing
--  projection tables (rider_documents, merchant_store_documents). Every add
--  here is nullable / has a default so:
--    * existing rows stay valid (no data migration needed),
--    * existing SELECTs keep returning the same shape,
--    * the manual flow continues to write the same columns it does today.
--
--  Also extends two existing enums (verification_method,
--  document_verification_status) with values the Cashfree flow needs — the
--  ALTER TYPE ADD VALUE syntax is online in Postgres 12+, no lock required.
-- ============================================================================

-- ── rider_documents: 4 additive nullable columns ──────────────────────────
ALTER TABLE rider_documents
  ADD COLUMN IF NOT EXISTS last_verification_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_provider_reference   TEXT,
  ADD COLUMN IF NOT EXISTS extracted_data_summary    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_address         JSONB;

-- Query pattern: "show the winning event log for this document"
CREATE INDEX IF NOT EXISTS rider_documents_last_verification_id_idx
  ON rider_documents (last_verification_id)
  WHERE last_verification_id IS NOT NULL;

-- ── merchant_store_documents: same four columns ──────────────────────────
ALTER TABLE merchant_store_documents
  ADD COLUMN IF NOT EXISTS last_verification_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_provider_reference   TEXT,
  ADD COLUMN IF NOT EXISTS extracted_data_summary    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_address         JSONB;

CREATE INDEX IF NOT EXISTS merchant_store_documents_last_verification_id_idx
  ON merchant_store_documents (last_verification_id)
  WHERE last_verification_id IS NOT NULL;

-- ── verification_method enum: add Cashfree flavours + Razorpay bank ──────
--
-- Existing values: 'APP_VERIFIED', 'MANUAL_UPLOAD'
-- Adding:
--   CASHFREE_AUTO             — Cashfree returned VERIFIED without agent touch
--   CASHFREE_ASSISTED         — Cashfree auto succeeded then agent reviewed
--   CASHFREE_MANUAL_FALLBACK  — Cashfree auto failed, doc went to manual
--   RAZORPAY_BANK             — merchant bank ₹1 verify via Razorpay
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CASHFREE_AUTO' AND enumtypid = 'verification_method'::regtype) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_AUTO';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CASHFREE_ASSISTED' AND enumtypid = 'verification_method'::regtype) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_ASSISTED';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CASHFREE_MANUAL_FALLBACK' AND enumtypid = 'verification_method'::regtype) THEN
    ALTER TYPE verification_method ADD VALUE 'CASHFREE_MANUAL_FALLBACK';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RAZORPAY_BANK' AND enumtypid = 'verification_method'::regtype) THEN
    ALTER TYPE verification_method ADD VALUE 'RAZORPAY_BANK';
  END IF;
END $$;

-- ── document_verification_status: add outcomes the manual flow never emits ──
--
-- Existing values: 'pending', 'approved', 'rejected'
-- Adding:
--   auto_verified   — Cashfree said VALID and passed the confidence threshold
--   expired         — DigiLocker link or RPD window elapsed
--   consent_denied  — DigiLocker: user declined
--   timeout         — provider round-trip aborted
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'auto_verified' AND enumtypid = 'document_verification_status'::regtype) THEN
    ALTER TYPE document_verification_status ADD VALUE 'auto_verified';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expired' AND enumtypid = 'document_verification_status'::regtype) THEN
    ALTER TYPE document_verification_status ADD VALUE 'expired';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'consent_denied' AND enumtypid = 'document_verification_status'::regtype) THEN
    ALTER TYPE document_verification_status ADD VALUE 'consent_denied';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeout' AND enumtypid = 'document_verification_status'::regtype) THEN
    ALTER TYPE document_verification_status ADD VALUE 'timeout';
  END IF;
END $$;
