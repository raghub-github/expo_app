-- Fix rider_payment_methods.method_type: must not reuse order payment_method_type enum (CARD/UPI/...).

DO $$ BEGIN
  CREATE TYPE rider_payout_method_type AS ENUM ('bank', 'upi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE rider_payment_methods
  ALTER COLUMN method_type TYPE rider_payout_method_type
  USING (
    CASE lower(method_type::text)
      WHEN 'upi' THEN 'upi'::rider_payout_method_type
      WHEN 'bank' THEN 'bank'::rider_payout_method_type
      ELSE 'bank'::rider_payout_method_type
    END
  );
