-- 0542: Delisted stores cannot be operationally OPEN (customer hide + merchant toggle lock).
-- I/O-safe: trigger + targeted UPDATE of currently DELISTED rows only. No table rewrite.

CREATE OR REPLACE FUNCTION public.merchant_stores_force_closed_when_delisted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF UPPER(COALESCE(NEW.approval_status::text, '')) = 'DELISTED' THEN
    NEW.is_active := FALSE;
    NEW.is_accepting_orders := FALSE;
    NEW.is_available := FALSE;
    NEW.operational_status := 'CLOSED'::store_operational_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_stores_force_closed_when_delisted ON public.merchant_stores;
CREATE TRIGGER trg_merchant_stores_force_closed_when_delisted
  BEFORE INSERT OR UPDATE ON public.merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.merchant_stores_force_closed_when_delisted();

-- Heal any currently delisted stores that are still showing online (small set).
UPDATE public.merchant_stores
SET
  is_active = FALSE,
  is_accepting_orders = FALSE,
  is_available = FALSE,
  operational_status = 'CLOSED'::store_operational_status
WHERE approval_status = 'DELISTED'::store_approval_status
  AND (
    is_active IS DISTINCT FROM FALSE
    OR is_accepting_orders IS DISTINCT FROM FALSE
    OR is_available IS DISTINCT FROM FALSE
    OR operational_status IS DISTINCT FROM 'CLOSED'::store_operational_status
  );

UPDATE public.merchant_store_availability a
SET
  is_available = FALSE,
  is_accepting_orders = FALSE,
  unavailable_reason = CASE
    WHEN a.unavailable_reason IS NULL OR btrim(a.unavailable_reason) = '' THEN 'delisted'
    ELSE a.unavailable_reason
  END,
  close_reason = CASE
    WHEN a.close_reason IS NULL OR btrim(a.close_reason) = '' THEN 'Store delisted'
    ELSE a.close_reason
  END,
  restriction_type = CASE
    WHEN a.restriction_type IS NULL OR btrim(a.restriction_type) = '' THEN 'DELISTED'
    ELSE a.restriction_type
  END,
  updated_at = NOW()
FROM public.merchant_stores s
WHERE a.store_id = s.id
  AND s.approval_status = 'DELISTED'::store_approval_status
  AND (
    a.is_available IS DISTINCT FROM FALSE
    OR a.is_accepting_orders IS DISTINCT FROM FALSE
  );
