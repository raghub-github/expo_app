-- Rider bank/UPI payout methods (shared with dashboard Payment Methods section).
-- Idempotent: safe to run on DBs that already have 0082/0083 applied.

DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM ('bank', 'upi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_verification_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_proof_type AS ENUM ('passbook', 'cancelled_cheque', 'statement', 'upi_qr_image');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS rider_payment_methods (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  method_type payment_method_type NOT NULL,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT,
  ifsc TEXT,
  branch TEXT,
  account_number_encrypted TEXT,
  upi_id TEXT,
  verification_status payment_method_verification_status NOT NULL DEFAULT 'pending',
  verification_proof_type verification_proof_type,
  proof_document_id BIGINT REFERENCES rider_documents(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rider_payment_methods_rider_id_idx ON rider_payment_methods(rider_id);
CREATE INDEX IF NOT EXISTS rider_payment_methods_verification_status_idx ON rider_payment_methods(verification_status);
CREATE INDEX IF NOT EXISTS rider_payment_methods_deleted_at_idx ON rider_payment_methods(deleted_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'withdrawal_requests'
      AND column_name = 'payment_method_id'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD COLUMN payment_method_id BIGINT REFERENCES rider_payment_methods(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS withdrawal_requests_payment_method_id_idx
      ON withdrawal_requests(payment_method_id);
  END IF;
END $$;
