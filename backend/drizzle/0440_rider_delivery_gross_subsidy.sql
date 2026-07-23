-- ─────────────────────────────────────────────────────────────────────────────
-- 0440 · Rider payout independence from the customer delivery fee
--
-- Business rule: the Rider Fare Engine (Super Admin → Geo & Coverage → Rider
-- Pricing, `service_payout_rules.rider_percentage`) is the single source of truth
-- for rider payout, and rider earnings must NEVER depend on what the customer is
-- charged for delivery. GMitra Plus free delivery, coupons, membership benefits
-- and platform campaigns are customer-side subsidies the platform absorbs — they
-- must not reduce rider pay.
--
-- The billing pipeline now persists two values into orders_core.billing_snapshot:
--   • delivery_fee_gross → standard rate-engine delivery fare BEFORE any subsidy
--     (this is the Rider Fare Engine's % base; the app reads it from the snapshot)
--   • delivery_subsidy   → delivery_fee_gross − delivery_fee (platform cost only)
--
-- This migration surfaces those values as first-class, queryable columns on
-- orders_core for settlement / finance reporting, keeping the JSONB snapshot as
-- the SSOT via a BEFORE trigger. Plain nullable columns (metadata-only add, no
-- table rewrite / no long lock) + trigger forward-sync + one-time backfill.
--
-- FIX-FORWARD ONLY: no wallet_ledger entries are created and no rider is
-- retroactively re-credited. Historical free-delivery orders keep their recorded
-- payout; backfilled gross defaults to the net fee (subsidy 0) where no gross was
-- captured, so past reporting is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columns (nullable → instant, no rewrite).
ALTER TABLE orders_core
  ADD COLUMN IF NOT EXISTS delivery_fee_gross numeric(10, 2),
  ADD COLUMN IF NOT EXISTS delivery_subsidy   numeric(10, 2);

COMMENT ON COLUMN orders_core.delivery_fee_gross IS
  'Standard/gross delivery fare (pre-subsidy) = Rider Fare Engine % base. Independent of customer delivery fee. Mirrors billing_snapshot.delivery_fee_gross.';
COMMENT ON COLUMN orders_core.delivery_subsidy IS
  'Platform-absorbed delivery subsidy = delivery_fee_gross − net delivery_fee (free delivery / coupons / membership). Platform cost only; never reduces rider payout.';

-- 2. Keep the columns in lock-step with the billing_snapshot SSOT.
--    gross falls back to net delivery_fee, then fare_amount, so a row is never
--    left with a smaller base than the customer fee (fix-forward safe default).
CREATE OR REPLACE FUNCTION orders_core_sync_delivery_economics()
RETURNS trigger AS $$
BEGIN
  NEW.delivery_fee_gross := COALESCE(
    NULLIF(NEW.billing_snapshot ->> 'delivery_fee_gross', '')::numeric,
    NULLIF(NEW.billing_snapshot ->> 'delivery_fee', '')::numeric,
    NEW.fare_amount,
    0
  );
  NEW.delivery_subsidy := COALESCE(
    NULLIF(NEW.billing_snapshot ->> 'delivery_subsidy', '')::numeric,
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_core_delivery_economics ON orders_core;
CREATE TRIGGER trg_orders_core_delivery_economics
  BEFORE INSERT OR UPDATE OF billing_snapshot, fare_amount
  ON orders_core
  FOR EACH ROW
  EXECUTE FUNCTION orders_core_sync_delivery_economics();

-- 3. One-time backfill of existing rows (reporting only; no ledger writes).
UPDATE orders_core
SET
  delivery_fee_gross = COALESCE(
    NULLIF(billing_snapshot ->> 'delivery_fee_gross', '')::numeric,
    NULLIF(billing_snapshot ->> 'delivery_fee', '')::numeric,
    fare_amount,
    0
  ),
  delivery_subsidy = COALESCE(
    NULLIF(billing_snapshot ->> 'delivery_subsidy', '')::numeric,
    0
  )
WHERE delivery_fee_gross IS NULL;
