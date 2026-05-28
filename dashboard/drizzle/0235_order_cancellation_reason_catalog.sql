-- Configurable cancellation / refund rejection reasons (attribute + label).
-- Seeded with legacy fleet dashboard options. Super admin can manage via dashboard.
-- Attributes table: see 0236 (run 0236 if you already applied an older 0235 without attributes).

CREATE TABLE IF NOT EXISTS order_cancellation_attributes (
  code TEXT PRIMARY KEY,
  display_label TEXT NOT NULL,
  default_fault TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO order_cancellation_attributes (code, display_label, default_fault, sort_order)
VALUES
  ('CUSTOMER', 'Customer', 'customer_fault', 1),
  ('MERCHANT', 'Merchant', 'merchant_fault', 2),
  ('RIDER', 'Rider', '3pl_fault', 3),
  ('OTHER', 'Other', '', 4)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS order_cancellation_reason_catalog (
  id BIGSERIAL PRIMARY KEY,
  attribute TEXT NOT NULL,
  label TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_cancellation_reason_catalog_attr_label_uq UNIQUE (attribute, label),
  CONSTRAINT order_cancellation_reason_catalog_reason_code_uq UNIQUE (reason_code)
);

CREATE INDEX IF NOT EXISTS order_cancellation_reason_catalog_attribute_idx
  ON order_cancellation_reason_catalog(attribute);

CREATE INDEX IF NOT EXISTS order_cancellation_reason_catalog_active_idx
  ON order_cancellation_reason_catalog(is_active)
  WHERE is_active = TRUE;

COMMENT ON TABLE order_cancellation_reason_catalog IS
  'Master list of cancellation/refund rejection reasons grouped by attribute (CUSTOMER, MERCHANT, RIDER, OTHER).';

-- Seed (idempotent)
INSERT INTO order_cancellation_reason_catalog (attribute, label, reason_code, sort_order)
VALUES
  ('CUSTOMER', 'Customer denying order', 'customer_denying_order', 1),
  ('CUSTOMER', 'Customer non-responsive', 'customer_non_responsive', 2),
  ('CUSTOMER', 'Wrong user address', 'wrong_user_address', 3),
  ('CUSTOMER', 'Customer placed the order by mistake', 'customer_placed_order_by_mistake', 4),

  ('RIDER', 'LP Assignment Timeout', 'lp_assignment_timeout', 10),
  ('RIDER', 'FE - No answer', 'fe_no_answer', 11),
  ('RIDER', 'Denial - Picked up time out', 'denial_picked_up_time_out', 12),
  ('RIDER', 'Food not delivered', 'food_not_delivered', 13),
  ('RIDER', 'Denial - Rider abusive', 'denial_rider_abusive', 14),
  ('RIDER', 'FE - Accident / Rain / Strike / vehicle issues', 'fe_accident_rain_strike_vehicle', 15),
  ('RIDER', 'FE - Device/app issue', 'fe_device_app_issue', 16),
  ('RIDER', 'FE - Long distance order', 'fe_long_distance_order', 17),
  ('RIDER', 'Someone else picked the order', 'someone_else_picked_order', 18),
  ('RIDER', 'Rider fled with the order', 'rider_fled_with_order', 19),
  ('RIDER', 'Rider is charging extra', 'rider_charging_extra', 20),
  ('RIDER', 'Order damaged during delivery', 'order_damaged_during_delivery', 21),
  ('RIDER', 'Someone else picked the order (Same 3PL)', 'someone_else_picked_same_3pl', 22),
  ('RIDER', 'Someone else picked the order (Diff 3PL)', 'someone_else_picked_diff_3pl', 23),
  ('RIDER', 'Rider denying to pickup food', 'rider_denying_pickup_food', 24),

  ('MERCHANT', 'Merchant non-responsive', 'merchant_non_responsive', 30),
  ('MERCHANT', 'Merchant denying order', 'merchant_denying_order', 31),
  ('MERCHANT', 'Items out of stock', 'items_out_of_stock', 32),
  ('MERCHANT', 'Not operational today', 'not_operational_today', 33),
  ('MERCHANT', 'Nearing closing time', 'nearing_closing_time', 34),
  ('MERCHANT', 'Delay in order acceptance', 'delay_in_order_acceptance', 35),
  ('MERCHANT', 'Poor quality of packaging', 'poor_quality_packaging', 36),
  ('MERCHANT', 'Poor quality', 'poor_quality', 37),
  ('MERCHANT', 'Foreign object in food/FSSAI', 'foreign_object_food_fssai', 38),
  ('MERCHANT', 'Instructions not followed', 'instructions_not_followed', 39),
  ('MERCHANT', 'Merchant charging extra amount', 'merchant_charging_extra', 40),
  ('MERCHANT', 'Merchant device issue', 'merchant_device_issue', 41),
  ('MERCHANT', 'Nearing opening time', 'nearing_opening_time', 42),
  ('MERCHANT', 'Kitchen is full', 'kitchen_is_full', 43),
  ('MERCHANT', 'Auto Cancelled', 'auto_cancelled', 44),
  ('MERCHANT', 'Auto cancellation - bill not generated', 'auto_cancellation_bill_not_generated', 45),
  ('MERCHANT', 'Incorrect merchant Address', 'incorrect_merchant_address', 46),
  ('MERCHANT', 'Expired Items', 'expired_items', 47),
  ('MERCHANT', 'Merchant delaying the order (High wait time)', 'merchant_delaying_high_wait', 48),
  ('MERCHANT', 'Merchant handed over the order to someone else', 'merchant_handed_to_someone_else', 49),

  ('OTHER', 'Duplicate Order', 'duplicate_order', 60),
  ('OTHER', 'Wrong order', 'wrong_order', 61),
  ('OTHER', 'Missing Item', 'missing_item', 62),
  ('OTHER', 'Customer reject due to delay', 'customer_reject_due_to_delay', 63),
  ('OTHER', 'PG failure', 'pg_failure', 64),
  ('OTHER', 'Out of subzone/area', 'out_of_subzone_area', 65),
  ('OTHER', 'unsafe area', 'unsafe_area', 66),
  ('OTHER', 'Product Outside deals-in', 'product_outside_deals_in', 67),
  ('OTHER', 'Customer ordering in bulk', 'customer_ordering_bulk', 68),
  ('OTHER', 'Invalid prescription', 'invalid_prescription', 69),
  ('OTHER', 'Prescription missing', 'prescription_missing', 70),
  ('OTHER', 'Issue with pricing', 'issue_with_pricing', 71)
ON CONFLICT (attribute, label) DO NOTHING;
