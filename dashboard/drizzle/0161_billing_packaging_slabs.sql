-- Packaging & add-on fee slabs: bands on cart subtotal (items + add-ons before discounts).
-- Fee = fee_fixed + fee_per_addon_qty × (total add-on pieces in cart).
-- Idempotent for re-runs.

CREATE TABLE IF NOT EXISTS billing_packaging_slabs (
  id bigserial PRIMARY KEY,
  name text,
  min_cart numeric(14, 4),
  max_cart numeric(14, 4),
  fee_fixed numeric(14, 4) NOT NULL DEFAULT 0,
  fee_per_addon_qty numeric(14, 4) NOT NULL DEFAULT 0,
  scope_type text NOT NULL DEFAULT 'global',
  scope_id bigint,
  metadata jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_packaging_slabs_scope_active_priority_idx
  ON billing_packaging_slabs (scope_type, scope_id, is_active, priority);
