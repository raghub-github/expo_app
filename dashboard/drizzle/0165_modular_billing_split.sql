-- 0165_modular_billing_split.sql
-- Modularization phase: keep billing rules minimal, add unified offer engine + subscription model.

-- Unified offers (platform offers + coupons in one model)
CREATE TABLE IF NOT EXISTS offers (
  id bigserial PRIMARY KEY,
  code text,
  name text,
  service_type text NOT NULL DEFAULT 'FOOD',
  offer_scope text NOT NULL DEFAULT 'PLATFORM',
  offer_type text NOT NULL DEFAULT 'AUTO',
  discount_type text NOT NULL DEFAULT 'PERCENTAGE',
  value_numeric numeric(14, 4),
  delivery_discount_type text,
  delivery_discount_value numeric(14, 4),
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_service_active_idx
  ON offers (service_type, is_active, priority);

CREATE UNIQUE INDEX IF NOT EXISTS offers_code_unique_idx
  ON offers (code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS offer_conditions (
  id bigserial PRIMARY KEY,
  offer_id bigint NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  condition_type text NOT NULL,
  operator text NOT NULL DEFAULT 'EQ',
  value_min numeric(14, 4),
  value_max numeric(14, 4),
  value_text text,
  value_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_conditions_offer_idx
  ON offer_conditions (offer_id);

CREATE TABLE IF NOT EXISTS offer_usage_logs (
  id bigserial PRIMARY KEY,
  offer_id bigint NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  user_id text,
  order_id text,
  service_type text,
  discount_amount numeric(14, 4),
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_usage_offer_idx
  ON offer_usage_logs (offer_id, created_at desc);

-- User subscription model (platform plans)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE,
  service_type text NOT NULL DEFAULT 'ALL',
  price numeric(14, 4) NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'MONTHLY',
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  plan_id bigint NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_subscriptions_user_idx
  ON user_subscriptions (user_id, status);

-- Safe backfill (non-destructive): move existing platform offers into unified offers table.
-- Handles mixed environments where old table columns may differ.
DO $$
DECLARE
  has_source_table boolean := false;
  has_service_type boolean := false;
  has_delivery_discount_type boolean := false;
  has_delivery_discount_value boolean := false;
  has_priority boolean := false;
  has_is_active boolean := false;
  has_is_hidden boolean := false;
  has_metadata boolean := false;
  has_created_at boolean := false;
  has_updated_at boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers'
  ) INTO has_source_table;

  IF NOT has_source_table THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'service_type'
  ) INTO has_service_type;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'delivery_discount_type'
  ) INTO has_delivery_discount_type;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'delivery_discount_value'
  ) INTO has_delivery_discount_value;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'priority'
  ) INTO has_priority;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'is_active'
  ) INTO has_is_active;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'is_hidden'
  ) INTO has_is_hidden;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'metadata'
  ) INTO has_metadata;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'created_at'
  ) INTO has_created_at;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers' AND column_name = 'updated_at'
  ) INTO has_updated_at;

  EXECUTE format(
    $sql$
    INSERT INTO offers (
      code, name, service_type, offer_scope, offer_type, discount_type, value_numeric,
      delivery_discount_type, delivery_discount_value, priority, is_active, is_hidden, metadata, created_at, updated_at
    )
    SELECT
      NULL,
      bpo.name,
      %s,
      'PLATFORM',
      'AUTO',
      bpo.discount_type,
      bpo.value_numeric,
      %s,
      %s,
      %s,
      %s,
      %s,
      %s,
      %s,
      %s
    FROM billing_platform_offers bpo
    WHERE NOT EXISTS (
      SELECT 1 FROM offers o
      WHERE o.name IS NOT DISTINCT FROM bpo.name
        AND o.service_type = %s
        AND o.offer_scope = 'PLATFORM'
        AND o.offer_type = 'AUTO'
    );
    $sql$,
    CASE WHEN has_service_type THEN 'bpo.service_type' ELSE quote_literal('FOOD') END,
    CASE WHEN has_delivery_discount_type THEN 'bpo.delivery_discount_type' ELSE 'NULL::text' END,
    CASE WHEN has_delivery_discount_value THEN 'bpo.delivery_discount_value' ELSE 'NULL::numeric(14,4)' END,
    CASE WHEN has_priority THEN 'bpo.priority' ELSE '0' END,
    CASE WHEN has_is_active THEN 'bpo.is_active' ELSE 'true' END,
    CASE WHEN has_is_hidden THEN 'bpo.is_hidden' ELSE 'false' END,
    CASE WHEN has_metadata THEN 'COALESCE(bpo.metadata, ''{}''::jsonb)' ELSE '''{}''::jsonb' END,
    CASE WHEN has_created_at THEN 'bpo.created_at' ELSE 'now()' END,
    CASE WHEN has_updated_at THEN 'bpo.updated_at' ELSE 'now()' END,
    CASE WHEN has_service_type THEN 'bpo.service_type' ELSE quote_literal('FOOD') END
  );
END $$;

-- Optional cleanup to be executed only after application cut-over:
-- DROP TABLE IF EXISTS billing_delivery_slabs;
-- DROP TABLE IF EXISTS billing_packaging_slabs;
-- DROP TABLE IF EXISTS billing_platform_offers;
-- DROP TABLE IF EXISTS billing_discounts;
