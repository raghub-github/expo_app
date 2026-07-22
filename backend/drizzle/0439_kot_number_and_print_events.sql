-- ─────────────────────────────────────────────────────────────────────────────
-- 0439 · KOT number, print audit, and pickup-token print metadata
--
-- Extends the 0438 order_pickup_tokens backbone with:
--   • store-scoped unique kot_number (backend-generated, never client)
--   • print counters / last print timestamp / template version
--   • order_kot_print_events audit trail for Partner / Merchant / thermal / PDF
-- Idempotent + compatible with existing production rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-store KOT sequence (monotonic).
CREATE TABLE IF NOT EXISTS store_kot_counters (
  store_id    bigint PRIMARY KEY,
  last_value  bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_pickup_tokens
  ADD COLUMN IF NOT EXISTS kot_number text,
  ADD COLUMN IF NOT EXISTS kot_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_kot_printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kot_print_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS order_pickup_tokens_store_kot_uq
  ON order_pickup_tokens (store_id, kot_number)
  WHERE kot_number IS NOT NULL AND store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_kot_print_events (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  store_id         bigint,
  token_id         bigint REFERENCES order_pickup_tokens(id) ON DELETE SET NULL,
  kot_number       text,
  printed_at       timestamptz NOT NULL DEFAULT now(),
  printed_by       text,          -- partner_site | merchant_app | dashboard | system
  print_channel    text,          -- browser | thermal | pdf | expo_print
  kot_version      integer NOT NULL DEFAULT 1,
  payload_snapshot jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_kot_print_events_order_idx
  ON order_kot_print_events (order_id);
CREATE INDEX IF NOT EXISTS order_kot_print_events_store_idx
  ON order_kot_print_events (store_id);
CREATE INDEX IF NOT EXISTS order_kot_print_events_printed_idx
  ON order_kot_print_events (printed_at DESC);

-- Allocate next KOT number for a store: K-0001, K-0002, …
CREATE OR REPLACE FUNCTION gm_allocate_kot_number(p_store_id bigint)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN 'K-' || lpad((floor(random() * 9999) + 1)::text, 4, '0');
  END IF;

  INSERT INTO store_kot_counters (store_id, last_value, updated_at)
  VALUES (p_store_id, 1, now())
  ON CONFLICT (store_id) DO UPDATE
    SET last_value = store_kot_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'K-' || lpad(v_next::text, 4, '0');
END
$$;

-- Ensure every pickup token row has a kot_number (new inserts + backfill).
CREATE OR REPLACE FUNCTION assign_order_pickup_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kot text;
BEGIN
  v_kot := gm_allocate_kot_number(NEW.merchant_store_id);

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
    now() + interval '24 hours',
    v_kot,
    1
  )
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END
$$;

-- Backfill kot_number for existing tokens missing one.
DO $$
DECLARE
  r RECORD;
  v_kot text;
BEGIN
  FOR r IN
    SELECT id, store_id
    FROM order_pickup_tokens
    WHERE kot_number IS NULL
    ORDER BY id
  LOOP
    v_kot := gm_allocate_kot_number(r.store_id);
    UPDATE order_pickup_tokens
    SET kot_number = v_kot, updated_at = now()
    WHERE id = r.id AND kot_number IS NULL;
  END LOOP;
END
$$;

-- Ensure tokens still exist for any orders_core rows missing them (safety net).
INSERT INTO order_pickup_tokens (
  order_id, merchant_id, store_id, token, status, generated_at, expires_at, assigned_rider_id, kot_number, kot_version
)
SELECT
  oc.id,
  oc.merchant_parent_id,
  oc.merchant_store_id,
  gm_generate_pickup_token(),
  'ACTIVE',
  COALESCE(oc.created_at, now()),
  COALESCE(oc.created_at, now()) + interval '24 hours',
  of.rider_id,
  gm_allocate_kot_number(oc.merchant_store_id),
  1
FROM orders_core oc
LEFT JOIN orders_food of ON of.core_order_id = oc.order_id OR of.order_id = oc.id
WHERE NOT EXISTS (SELECT 1 FROM order_pickup_tokens t WHERE t.order_id = oc.id)
ON CONFLICT (order_id) DO NOTHING;
