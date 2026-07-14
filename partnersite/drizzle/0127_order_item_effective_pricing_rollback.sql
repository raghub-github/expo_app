-- Rollback 0127_order_item_effective_pricing.sql

ALTER TABLE orders_core_items
  DROP COLUMN IF EXISTS effective_unit_price,
  DROP COLUMN IF EXISTS effective_line_total,
  DROP COLUMN IF EXISTS offer_discount_amount,
  DROP COLUMN IF EXISTS applied_offer_id,
  DROP COLUMN IF EXISTS applied_offer_label,
  DROP COLUMN IF EXISTS applied_offer_type,
  DROP COLUMN IF EXISTS ineligibility_reason;
