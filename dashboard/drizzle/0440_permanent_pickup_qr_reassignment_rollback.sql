-- Rollback for 0445_permanent_pickup_qr_reassignment.sql

DROP TRIGGER IF EXISTS trg_expire_pickup_token_food ON orders_food;
DROP TRIGGER IF EXISTS trg_expire_pickup_token_core ON orders_core;
DROP FUNCTION IF EXISTS trg_expire_pickup_token_on_food_terminal();
DROP FUNCTION IF EXISTS trg_expire_pickup_token_on_core_terminal();
DROP FUNCTION IF EXISTS gm_expire_order_pickup_token(bigint);
DROP FUNCTION IF EXISTS gm_reactivate_order_pickup_token(bigint);

-- Restore prior sync (ACTIVE-only + join via core_order_id text).
CREATE OR REPLACE FUNCTION sync_pickup_token_rider()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    UPDATE order_pickup_tokens t
    SET assigned_rider_id = NEW.rider_id, updated_at = now()
    FROM orders_core oc
    WHERE oc.order_id = NEW.core_order_id
      AND t.order_id = oc.id
      AND t.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END
$$;
