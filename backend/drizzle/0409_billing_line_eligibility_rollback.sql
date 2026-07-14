-- Rollback 0409_billing_line_eligibility

ALTER TABLE orders_core_items
  DROP COLUMN IF EXISTS is_discount_eligible;
