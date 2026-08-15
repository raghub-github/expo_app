-- Rollback 0544: restore previous force-closed trigger (approval_status = DELISTED).

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
