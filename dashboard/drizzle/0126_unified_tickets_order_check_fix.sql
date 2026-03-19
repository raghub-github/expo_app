-- ============================================================================
-- Fix unified_tickets_order_check: NON_ORDER_RELATED must have order_id NULL.
-- Some rows had order_id set (e.g. legacy data); any UPDATE then fails the check.
-- 1) Fix existing rows. 2) Extend trigger to force order_id = NULL for NON_ORDER_RELATED.
-- ============================================================================

-- Fix existing NON_ORDER_RELATED tickets that have order_id set
UPDATE public.unified_tickets
SET order_id = NULL
WHERE ticket_type = 'NON_ORDER_RELATED' AND order_id IS NOT NULL;

-- Extend validate_ticket_order_type so NON_ORDER_RELATED always has order_id NULL (satisfies unified_tickets_order_check on INSERT/UPDATE)
CREATE OR REPLACE FUNCTION validate_ticket_order_type()
RETURNS TRIGGER AS $$
BEGIN
  -- For order-related tickets, ensure order_type is set
  IF NEW.ticket_type = 'ORDER_RELATED' AND NEW.order_type IS NULL THEN
    IF NEW.service_type = 'FOOD' THEN
      NEW.order_type := 'food';
    ELSIF NEW.service_type = 'PARCEL' THEN
      NEW.order_type := 'parcel';
    ELSIF NEW.service_type = 'RIDE' THEN
      NEW.order_type := 'person_ride';
    END IF;
  END IF;

  -- For non-order-related tickets: order_type and order_id must be NULL (unified_tickets_order_check)
  IF NEW.ticket_type = 'NON_ORDER_RELATED' THEN
    NEW.order_type := NULL;
    NEW.order_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_ticket_order_type() IS
  'Validates order_type and order_id for unified_tickets. NON_ORDER_RELATED forces order_id and order_type to NULL so unified_tickets_order_check is satisfied.';
