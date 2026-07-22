-- ─────────────────────────────────────────────────────────────────────────────
-- 0438 · Secure pickup-token backbone for the KOT / rider-scan pickup workflow
--
-- Single source of truth for the pickup handoff. One cryptographically-random,
-- unguessable token per order, generated ONLY in the database (never on a client)
-- the moment the order lands in orders_core. Bound to the assigned rider by a
-- trigger on orders_food.rider_id. Every scan attempt is audited. Rider scan
-- validation (backend) checks: order exists, token active/not-expired/not-used,
-- rider == assigned_rider_id, order state allows pickup — then flips to USED.
--
-- The QR printed on the KOT encodes this token (NOT the raw order id).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE order_pickup_token_status AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'INVALIDATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS order_pickup_tokens (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  merchant_id         bigint,
  store_id            bigint,
  token               text   NOT NULL,
  status              order_pickup_token_status NOT NULL DEFAULT 'ACTIVE',
  assigned_rider_id   bigint,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,
  used_at             timestamptz,
  scanned_at          timestamptz,
  scanned_by_rider_id bigint,
  scanned_device      text,
  invalidated_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One token per order; token itself globally unique + fast lookup on scan.
CREATE UNIQUE INDEX IF NOT EXISTS order_pickup_tokens_order_uq ON order_pickup_tokens (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_pickup_tokens_token_uq ON order_pickup_tokens (token);
CREATE INDEX IF NOT EXISTS order_pickup_tokens_rider_idx
  ON order_pickup_tokens (assigned_rider_id) WHERE assigned_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_pickup_tokens_status_idx ON order_pickup_tokens (status);

-- Immutable audit of every scan attempt (success AND rejection) — Rider/device/time/reason.
CREATE TABLE IF NOT EXISTS order_pickup_scan_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     bigint,
  token_id     bigint,
  token        text,
  rider_id     bigint,
  outcome      text NOT NULL,           -- 'SUCCESS' | 'REJECTED'
  reason       text,                    -- e.g. 'WRONG_RIDER','ALREADY_USED','EXPIRED','TAMPERED'
  device       text,
  latitude     double precision,
  longitude    double precision,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_pickup_scan_audit_order_idx ON order_pickup_scan_audit (order_id);
CREATE INDEX IF NOT EXISTS order_pickup_scan_audit_rider_idx ON order_pickup_scan_audit (rider_id);
CREATE INDEX IF NOT EXISTS order_pickup_scan_audit_created_idx ON order_pickup_scan_audit (created_at DESC);

-- Cryptographically-secure, URL-safe, unguessable token (192 bits → ~32 chars).
CREATE OR REPLACE FUNCTION gm_generate_pickup_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '')
$$;

-- Generate ONE token as soon as the order row is created (any insert path).
CREATE OR REPLACE FUNCTION assign_order_pickup_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO order_pickup_tokens (order_id, merchant_id, store_id, token, status, generated_at, expires_at)
  VALUES (
    NEW.id,
    NEW.merchant_parent_id,
    NEW.merchant_store_id,
    gm_generate_pickup_token(),
    'ACTIVE',
    now(),
    now() + interval '24 hours'   -- TTL; lifecycle also expires it on terminal states
  )
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_order_pickup_token ON orders_core;
CREATE TRIGGER trg_order_pickup_token
  AFTER INSERT ON orders_core
  FOR EACH ROW EXECUTE FUNCTION assign_order_pickup_token();

-- Bind / rebind the token to the currently assigned rider. Rider assignment lives
-- on orders_food.rider_id (core_order_id → order_pickup_tokens.order_id). On
-- reassignment only the NEW rider can validate (validation checks rider match), so
-- updating assigned_rider_id is sufficient to invalidate the old rider's scan.
CREATE OR REPLACE FUNCTION sync_pickup_token_rider()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    -- orders_food.core_order_id is the PUBLIC order id (e.g. 'GM10000165') = orders_core.order_id.
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

DROP TRIGGER IF EXISTS trg_pickup_token_rider ON orders_food;
CREATE TRIGGER trg_pickup_token_rider
  AFTER UPDATE OF rider_id ON orders_food
  FOR EACH ROW EXECUTE FUNCTION sync_pickup_token_rider();

-- Backfill existing orders (one token each) + bind any already-assigned rider.
INSERT INTO order_pickup_tokens (order_id, merchant_id, store_id, token, status, generated_at, expires_at, assigned_rider_id)
SELECT
  oc.id,
  oc.merchant_parent_id,
  oc.merchant_store_id,
  gm_generate_pickup_token(),
  'ACTIVE',
  COALESCE(oc.created_at, now()),
  COALESCE(oc.created_at, now()) + interval '24 hours',
  of.rider_id
FROM orders_core oc
LEFT JOIN orders_food of ON of.core_order_id = oc.order_id
WHERE NOT EXISTS (SELECT 1 FROM order_pickup_tokens t WHERE t.order_id = oc.id)
ON CONFLICT (order_id) DO NOTHING;
