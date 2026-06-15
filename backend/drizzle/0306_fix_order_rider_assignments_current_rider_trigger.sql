-- Fix rider accept: legacy trigger updated dropped public.orders table.
-- OMS v2 stores assignments against orders_core.id (order_rider_assignments.order_id / order_core_id).

CREATE OR REPLACE FUNCTION public.update_order_current_rider()
RETURNS TRIGGER AS $$
DECLARE
  v_core_id bigint;
BEGIN
  IF NEW.assignment_status NOT IN ('pending', 'assigned', 'accepted') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(NEW.is_active, FALSE) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_core_id := COALESCE(NEW.order_core_id, NEW.order_id);

  IF v_core_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders_core oc WHERE oc.id = v_core_id
  ) THEN
    UPDATE public.orders_core
    SET
      rider_id = NEW.rider_id,
      updated_at = NOW()
    WHERE id = v_core_id
      AND (rider_id IS NULL OR rider_id = NEW.rider_id);
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'orders'
  ) THEN
    UPDATE public.orders
    SET
      current_rider_id = NEW.rider_id,
      updated_at = NOW()
    WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_rider_assignments_update_current_rider_trigger ON public.order_rider_assignments;

CREATE TRIGGER order_rider_assignments_update_current_rider_trigger
  AFTER INSERT OR UPDATE OF assignment_status, is_active, rider_id
  ON public.order_rider_assignments
  FOR EACH ROW
  WHEN (
    COALESCE(NEW.is_active, TRUE)
    AND NEW.assignment_status IN ('pending', 'assigned', 'accepted')
  )
  EXECUTE FUNCTION public.update_order_current_rider();

COMMENT ON FUNCTION public.update_order_current_rider() IS
  'Sync orders_core.rider_id (OMS v2) or legacy orders.current_rider_id from active order_rider_assignments row.';
