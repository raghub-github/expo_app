-- ============================================================================
-- Permanent KOT pickup QR for rider reassignment
-- ============================================================================
-- 1) Token string stays immutable for the life of the order.
-- 2) sync_pickup_token_rider always rebinds assigned_rider_id (even after USED).
-- 3) Reactivate helper clears USED + pickup stamps so a new rider can scan the same QR.
-- 4) New tokens no longer expire after 24h (expires_at NULL = no TTL while order is open).
-- 5) On Delivered / Cancelled the pickup QR is EXPIRED and cannot be used again.
-- ============================================================================

-- Prefer orders_food.order_id (= orders_core.id) for reliable rebinding.
CREATE OR REPLACE FUNCTION sync_pickup_token_rider()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    UPDATE order_pickup_tokens t
    SET assigned_rider_id = NEW.rider_id,
        updated_at = now()
    WHERE t.order_id = NEW.order_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION sync_pickup_token_rider() IS
  'Always bind order_pickup_tokens.assigned_rider_id to the current orders_food.rider_id (ACTIVE or USED). Token string never changes.';

-- Mint without hard TTL so printed KOT QR stays valid for the order lifetime.
CREATE OR REPLACE FUNCTION assign_order_pickup_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kot text;
BEGIN
  BEGIN
    v_kot := gm_allocate_kot_number(NEW.merchant_store_id);
  EXCEPTION WHEN undefined_function THEN
    v_kot := NULL;
  END;

  INSERT INTO order_pickup_tokens (
    order_id, merchant_id, store_id, token, status, generated_at, expires_at, kot_number, kot_version
  )
  VALUES (
    NEW.id,
    NEW.merchant_parent_id,
    NEW.merchant_store_id,
    gm_generate_pickup_token(),
    'ACTIVE',
    now(),
    NULL,
    v_kot,
    1
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  -- Pre-0439 DBs without kot_number
  INSERT INTO order_pickup_tokens (
    order_id, merchant_id, store_id, token, status, generated_at, expires_at
  )
  VALUES (
    NEW.id,
    NEW.merchant_parent_id,
    NEW.merchant_store_id,
    gm_generate_pickup_token(),
    'ACTIVE',
    now(),
    NULL
  )
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END
$$;

-- Clear one-time USED state when rider is removed so the same QR works again.
-- Never reactivates tokens for delivered/cancelled orders.
CREATE OR REPLACE FUNCTION gm_reactivate_order_pickup_token(p_order_core_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_core_status text;
  v_current_status text;
  v_food_status text;
BEGIN
  SELECT oc.status::text, oc.current_status::text
  INTO v_core_status, v_current_status
  FROM orders_core oc
  WHERE oc.id = p_order_core_id;

  SELECT of.order_status::text
  INTO v_food_status
  FROM orders_food of
  WHERE of.order_id = p_order_core_id
  LIMIT 1;

  IF lower(COALESCE(v_core_status, '')) IN ('delivered', 'cancelled', 'failed')
     OR upper(COALESCE(v_current_status, '')) IN ('DELIVERED', 'CANCELLED')
     OR upper(COALESCE(v_food_status, '')) IN ('DELIVERED', 'CANCELLED', 'RTO') THEN
    UPDATE order_pickup_tokens
    SET status = 'EXPIRED',
        expires_at = COALESCE(expires_at, now()),
        updated_at = now()
    WHERE order_id = p_order_core_id
      AND status <> 'INVALIDATED';
    RETURN;
  END IF;

  UPDATE order_pickup_tokens
  SET status = 'ACTIVE',
      used_at = NULL,
      scanned_at = NULL,
      scanned_by_rider_id = NULL,
      scanned_device = NULL,
      assigned_rider_id = NULL,
      expires_at = NULL,
      updated_at = now()
  WHERE order_id = p_order_core_id
    AND status IN ('USED', 'ACTIVE', 'EXPIRED');
END
$$;

COMMENT ON FUNCTION gm_reactivate_order_pickup_token(bigint) IS
  'Re-open pickup QR after rider unassign/reassign while order is open. Token string is unchanged. Terminal orders stay EXPIRED.';

-- Expire pickup QR when order reaches a terminal state (Delivered / Cancelled).
CREATE OR REPLACE FUNCTION gm_expire_order_pickup_token(p_order_core_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE order_pickup_tokens
  SET status = 'EXPIRED',
      expires_at = COALESCE(expires_at, now()),
      updated_at = now()
  WHERE order_id = p_order_core_id
    AND status IN ('ACTIVE', 'USED', 'EXPIRED');
END
$$;

COMMENT ON FUNCTION gm_expire_order_pickup_token(bigint) IS
  'Mark pickup QR unusable after order Delivered/Cancelled. Token string still never changes.';

CREATE OR REPLACE FUNCTION trg_expire_pickup_token_on_core_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('delivered', 'cancelled', 'failed') THEN
    PERFORM gm_expire_order_pickup_token(NEW.id);
  ELSIF NEW.current_status IS DISTINCT FROM OLD.current_status
     AND upper(COALESCE(NEW.current_status::text, '')) IN ('DELIVERED', 'CANCELLED') THEN
    PERFORM gm_expire_order_pickup_token(NEW.id);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_expire_pickup_token_core ON orders_core;
CREATE TRIGGER trg_expire_pickup_token_core
  AFTER UPDATE OF status, current_status ON orders_core
  FOR EACH ROW
  EXECUTE FUNCTION trg_expire_pickup_token_on_core_terminal();

CREATE OR REPLACE FUNCTION trg_expire_pickup_token_on_food_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status
     AND upper(COALESCE(NEW.order_status::text, '')) IN ('DELIVERED', 'CANCELLED', 'RTO') THEN
    PERFORM gm_expire_order_pickup_token(NEW.order_id);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_expire_pickup_token_food ON orders_food;
CREATE TRIGGER trg_expire_pickup_token_food
  AFTER UPDATE OF order_status ON orders_food
  FOR EACH ROW
  EXECUTE FUNCTION trg_expire_pickup_token_on_food_terminal();

-- Soft-clear expired tokens that were never consumed (still reusable for open orders).
-- Cast enums to text before UPPER/LOWER — UPPER(order_status_type) is invalid.
UPDATE order_pickup_tokens t
SET status = 'ACTIVE',
    expires_at = NULL,
    updated_at = now()
FROM orders_core oc
LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
WHERE t.order_id = oc.id
  AND t.status = 'EXPIRED'
  AND lower(COALESCE(oc.status::text, '')) NOT IN ('delivered', 'cancelled', 'failed')
  AND upper(COALESCE(oc.current_status::text, '')) NOT IN ('DELIVERED', 'CANCELLED')
  AND upper(COALESCE(ofood.order_status::text, '')) NOT IN ('DELIVERED', 'CANCELLED', 'RTO');

-- Backfill: terminal orders must not keep an ACTIVE pickup QR.
UPDATE order_pickup_tokens t
SET status = 'EXPIRED',
    expires_at = COALESCE(t.expires_at, now()),
    updated_at = now()
FROM orders_core oc
LEFT JOIN orders_food ofood ON ofood.order_id = oc.id
WHERE t.order_id = oc.id
  AND t.status IN ('ACTIVE', 'USED')
  AND (
    lower(COALESCE(oc.status::text, '')) IN ('delivered', 'cancelled', 'failed')
    OR upper(COALESCE(oc.current_status::text, '')) IN ('DELIVERED', 'CANCELLED')
    OR upper(COALESCE(ofood.order_status::text, '')) IN ('DELIVERED', 'CANCELLED', 'RTO')
  );

GRANT EXECUTE ON FUNCTION gm_reactivate_order_pickup_token(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION gm_expire_order_pickup_token(bigint) TO service_role;
