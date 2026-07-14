-- Mirror backend/drizzle/0410_order_item_effective_pricing.sql
-- Freeze per-line effective selling price + applied store offer on placed items.

ALTER TABLE orders_core_items
  ADD COLUMN IF NOT EXISTS effective_unit_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS effective_line_total numeric(12, 2),
  ADD COLUMN IF NOT EXISTS offer_discount_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS applied_offer_id bigint,
  ADD COLUMN IF NOT EXISTS applied_offer_label text,
  ADD COLUMN IF NOT EXISTS applied_offer_type text,
  ADD COLUMN IF NOT EXISTS ineligibility_reason text;

COMMENT ON COLUMN orders_core_items.effective_unit_price IS
  'Per-unit effective selling price after store-funded item offers (customer-visible). NULL = legacy.';
COMMENT ON COLUMN orders_core_items.effective_line_total IS
  'Line total after store-funded item offers (customer-visible). NULL = legacy / no item offer.';
COMMENT ON COLUMN orders_core_items.offer_discount_amount IS
  '₹ discounted on this line by store item offers (catalog line − effective line).';
COMMENT ON COLUMN orders_core_items.applied_offer_label IS
  'Human label of the store offer applied on this line (e.g. 15% Off / Boost).';
COMMENT ON COLUMN orders_core_items.applied_offer_type IS
  'Canonical offer_type when an item-surface store offer applied (PERCENTAGE, FLAT, BOGO, …).';
COMMENT ON COLUMN orders_core_items.ineligibility_reason IS
  'ITEM_PROMO | MRP when line excluded from cart/coupon bases; null when eligible.';
