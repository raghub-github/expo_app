-- Add Order Type to Tickets and Access Control Tables
-- Migration: 0050_add_order_type_to_tickets
-- Changes: Add orderType column to unified_tickets, ticket_access_controls, and action_audit_log for tickets

-- ============================================================================
-- STEP 1: Add orderType column to unified_tickets table
-- ============================================================================

ALTER TABLE unified_tickets
  ADD COLUMN IF NOT EXISTS order_type TEXT;

COMMENT ON COLUMN unified_tickets.order_type IS 
  'Order type for order-related tickets (food, parcel, person_ride). NULL for non-order-related tickets. Derived from service_type or order.order_type';

-- Update existing tickets based on service_type
UPDATE unified_tickets
SET order_type = CASE
  WHEN service_type = 'FOOD' THEN 'food'
  WHEN service_type = 'PARCEL' THEN 'parcel'
  WHEN service_type = 'RIDE' THEN 'person_ride'
  ELSE NULL
END
WHERE order_type IS NULL;

-- Update order-related tickets based on linked order
UPDATE unified_tickets ut
SET order_type = (
  SELECT o.order_type::TEXT
  FROM orders o
  WHERE o.id = ut.order_id
)
WHERE ut.order_id IS NOT NULL 
  AND ut.order_type IS NULL
  AND ut.ticket_type = 'ORDER_RELATED';

-- ============================================================================
-- STEP 2: Add orderType column to ticket_access_controls table
-- ============================================================================

ALTER TABLE ticket_access_controls
  ADD COLUMN IF NOT EXISTS order_type TEXT;

COMMENT ON COLUMN ticket_access_controls.order_type IS 
  'Order type for ticket access control. NULL = access to all order types, specific value = access to that type only';

-- ============================================================================
-- STEP 3: Create index for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS unified_tickets_order_type_idx ON unified_tickets(order_type) WHERE order_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_service_type_order_type_idx ON unified_tickets(service_type, order_type);
CREATE INDEX IF NOT EXISTS unified_tickets_ticket_source_order_type_idx ON unified_tickets(ticket_source, order_type) WHERE order_type IS NOT NULL;

-- ============================================================================
-- STEP 4: Add check constraint to ensure order_type matches service_type for order-related tickets
-- ============================================================================

-- Note: We'll add a trigger function to validate this instead of a constraint
-- because service_type is an enum and order_type is text

CREATE OR REPLACE FUNCTION validate_ticket_order_type()
RETURNS TRIGGER AS $$
BEGIN
  -- For order-related tickets, ensure order_type is set
  IF NEW.ticket_type = 'ORDER_RELATED' AND NEW.order_type IS NULL THEN
    -- Try to derive from service_type
    IF NEW.service_type = 'FOOD' THEN
      NEW.order_type := 'food';
    ELSIF NEW.service_type = 'PARCEL' THEN
      NEW.order_type := 'parcel';
    ELSIF NEW.service_type = 'RIDE' THEN
      NEW.order_type := 'person_ride';
    END IF;
  END IF;
  
  -- For non-order-related tickets, order_type should be NULL
  IF NEW.ticket_type = 'NON_ORDER_RELATED' THEN
    NEW.order_type := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS validate_ticket_order_type_trigger ON unified_tickets;
CREATE TRIGGER validate_ticket_order_type_trigger
  BEFORE INSERT OR UPDATE ON unified_tickets
  FOR EACH ROW
  EXECUTE FUNCTION validate_ticket_order_type();

COMMENT ON FUNCTION validate_ticket_order_type() IS 
  'Validates and sets order_type for tickets based on ticket_type and service_type';
