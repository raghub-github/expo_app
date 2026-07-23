-- ─────────────────────────────────────────────────────────────────────────────
-- 0434 · Unique, immutable Tax Invoice Number for every order
--
-- Every order in orders_core gets ONE tax invoice number, assigned by a DB trigger
-- (so it is generated exactly once, at the moment the order row is created, no
-- matter which service inserts it) and never changes afterwards. Format:
--   GM/<financial-year>/<6-digit global serial>   e.g. GM/2026-27/000123
-- Consecutive + platform-unique (GST-friendly), indexed for search/support/refunds
-- /accounting. The number is the single source of truth read by every surface.
-- ─────────────────────────────────────────────────────────────────────────────

-- Global consecutive serial (never resets — a subset per FY is still consecutive).
CREATE SEQUENCE IF NOT EXISTS orders_tax_invoice_seq;

-- India financial year (Apr 1 – Mar 31), evaluated in IST. e.g. Jul 2026 → 2026-27.
CREATE OR REPLACE FUNCTION gm_financial_year(ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM (ts AT TIME ZONE 'Asia/Kolkata')) >= 4
      THEN to_char((ts AT TIME ZONE 'Asia/Kolkata'), 'YYYY') || '-' ||
           to_char(((ts AT TIME ZONE 'Asia/Kolkata') + interval '1 year'), 'YY')
    ELSE to_char(((ts AT TIME ZONE 'Asia/Kolkata') - interval '1 year'), 'YYYY') || '-' ||
         to_char((ts AT TIME ZONE 'Asia/Kolkata'), 'YY')
  END
$$;

ALTER TABLE orders_core ADD COLUMN IF NOT EXISTS tax_invoice_number text;

-- Assign once on INSERT; freeze forever on UPDATE (immutable).
CREATE OR REPLACE FUNCTION assign_orders_tax_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tax_invoice_number IS NULL THEN
      NEW.tax_invoice_number :=
        'GM/' || gm_financial_year(COALESCE(NEW.created_at, now())) || '/' ||
        lpad(nextval('orders_tax_invoice_seq')::text, 6, '0');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Once set, the invoice number can NEVER change (GST/accounting requirement).
    IF OLD.tax_invoice_number IS NOT NULL THEN
      NEW.tax_invoice_number := OLD.tax_invoice_number;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_tax_invoice_number ON orders_core;
CREATE TRIGGER trg_orders_tax_invoice_number
  BEFORE INSERT OR UPDATE ON orders_core
  FOR EACH ROW
  EXECUTE FUNCTION assign_orders_tax_invoice_number();

-- Backfill existing orders in creation order (id ASC). The UPDATE trigger does not
-- override here because OLD.tax_invoice_number is still NULL for these rows.
DO $$
DECLARE
  r RECORD;
  seq bigint;
BEGIN
  FOR r IN
    SELECT id, created_at FROM orders_core WHERE tax_invoice_number IS NULL ORDER BY id ASC
  LOOP
    seq := nextval('orders_tax_invoice_seq');
    UPDATE orders_core
      SET tax_invoice_number =
        'GM/' || gm_financial_year(COALESCE(r.created_at, now())) || '/' || lpad(seq::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END
$$;

-- Platform-wide uniqueness + fast lookup (search / support / refunds / accounting).
CREATE UNIQUE INDEX IF NOT EXISTS orders_core_tax_invoice_number_uq
  ON orders_core (tax_invoice_number)
  WHERE tax_invoice_number IS NOT NULL;
