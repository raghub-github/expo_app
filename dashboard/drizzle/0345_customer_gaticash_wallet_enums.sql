-- ============================================================================
-- 0345: GatiCash — enum extensions (PART 1 of 2)
--
-- PostgreSQL requires new enum values to be committed before use in functions.
-- Run this file first, then run 0346_customer_gaticash_wallet_v1.sql.
-- Safe to re-run (duplicate enum/type errors are ignored).
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.wallet_transaction_type ADD VALUE 'TOPUP';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.wallet_transaction_type ADD VALUE 'EXPIRED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.wallet_transaction_type ADD VALUE 'ADJUSTMENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_wallet_balance_lot_type AS ENUM (
    'ADDED',
    'REFUND',
    'PROMOTIONAL',
    'CASHBACK',
    'BONUS',
    'REFERRAL',
    'LOYALTY',
    'GIFT_CARD',
    'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.customer_wallet_lot_status AS ENUM (
    'ACTIVE',
    'DEPLETED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Required so PART 2 can reference TOPUP / EXPIRED / ADJUSTMENT in the same session.
COMMIT;
