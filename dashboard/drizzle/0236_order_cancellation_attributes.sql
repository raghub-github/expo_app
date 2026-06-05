-- Cancellation attributes (CUSTOMER, MERCHANT, RIDER, OTHER) — configurable, not hardcoded.
-- Run after 0235. Safe to re-run (IF NOT EXISTS / ON CONFLICT).

CREATE TABLE IF NOT EXISTS order_cancellation_attributes (
  code TEXT PRIMARY KEY,
  display_label TEXT NOT NULL,
  default_fault TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_cancellation_attributes IS
  'Cancellation/refund attribute groups (who is at fault). Managed in super admin.';

INSERT INTO order_cancellation_attributes (code, display_label, default_fault, sort_order)
VALUES
  ('CUSTOMER', 'Customer', 'customer_fault', 1),
  ('MERCHANT', 'Merchant', 'merchant_fault', 2),
  ('RIDER', 'Rider', '3pl_fault', 3),
  ('OTHER', 'Other', '', 4)
ON CONFLICT (code) DO NOTHING;

-- Allow new attributes beyond the original 4 (drop inline CHECK if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_cancellation_reason_catalog'
  ) THEN
    ALTER TABLE public.order_cancellation_reason_catalog
      DROP CONSTRAINT IF EXISTS order_cancellation_reason_catalog_attribute_check;
  END IF;
END $$;
