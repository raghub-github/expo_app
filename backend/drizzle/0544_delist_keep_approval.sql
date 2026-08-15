-- 0544: Delist must not change onboarding approval_status.
-- Keep APPROVED (or prior status). Service block is delisted_at + CLOSED flags.
-- I/O-safe: replace trigger body + targeted UPDATE of currently DELISTED rows only.

CREATE OR REPLACE FUNCTION public.merchant_stores_force_closed_when_delisted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.delisted_at IS NOT NULL
     OR UPPER(COALESCE(NEW.approval_status::text, '')) = 'DELISTED' THEN
    NEW.is_active := FALSE;
    NEW.is_accepting_orders := FALSE;
    NEW.is_available := FALSE;
    NEW.operational_status := 'CLOSED'::store_operational_status;
  END IF;
  RETURN NEW;
END;
$$;

-- Restore approval for stores that were flipped to DELISTED (small set).
UPDATE public.merchant_stores s
SET approval_status = COALESCE(
  (
    SELECT l.previous_approval_status
    FROM public.store_delisting_logs l
    WHERE l.store_id = s.id
      AND UPPER(COALESCE(l.new_approval_status::text, '')) = 'DELISTED'
      AND UPPER(COALESCE(l.previous_approval_status::text, '')) <> 'DELISTED'
    ORDER BY l.created_at DESC
    LIMIT 1
  ),
  'APPROVED'::store_approval_status
)
WHERE s.approval_status = 'DELISTED'::store_approval_status
  AND s.delisted_at IS NOT NULL;
