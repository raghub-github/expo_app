-- Phase B — seed the PARCEL charge-rule set so parcel orders run the same config-driven
-- billing pipeline as Food/Ride (platform/booking fee, surge, offers, GST). Parcel had
-- NO rows ("no charge rows for this service line yet"), so parcel was billed as the raw
-- slab fare only. computeBillForParcel now runs executeBillingPipeline over these rows.
--
-- SAFETY: fees seeded at 0 and GST rows seeded INACTIVE with rate 0 + a confirm-rate flag,
-- so deploying this changes nothing until an admin sets a value / activates a row. GST rates
-- are business/CA data — never invented here (per program decision "seed inactive, you fill").
-- Idempotent: every insert is guarded by NOT EXISTS on (service_type, name).

-- ── Tax rate definitions (billing_tax_configs) — rate 0, flagged for CA confirmation ──
INSERT INTO billing_tax_configs (name, rate, applicable_base, tax_group, service_type, metadata)
SELECT v.name, 0, v.base::billing_tax_applicable_base, v.grp::billing_tax_group, 'PARCEL', v.meta::jsonb
FROM (VALUES
  ('GST on parcel delivery',        'ITEM_AFTER_DISCOUNT', 'fee',      '{"confirm_rate":true,"assumed_standard_rate":0.18,"note":"Parcel is a service supply; set the GST rate and activate the linked rule after CA confirmation."}'),
  ('GST on parcel booking fee',     'PLATFORM_FEE',        'platform', '{"confirm_rate":true,"assumed_standard_rate":0.18,"note":"Set rate + activate rule after CA confirmation."}'),
  ('GST on parcel convenience fee', 'CONVENIENCE_FEE',     'fee',      '{"confirm_rate":true,"assumed_standard_rate":0.18,"note":"Set rate + activate rule after CA confirmation."}'),
  ('GST on parcel surge',           'SURGE_FEE',           'surge',    '{"confirm_rate":true,"assumed_standard_rate":0.18,"note":"Set rate + activate rule after CA confirmation."}')
) AS v(name, base, grp, meta)
WHERE NOT EXISTS (
  SELECT 1 FROM billing_tax_configs t WHERE t.service_type = 'PARCEL' AND t.name = v.name
);

-- ── Non-tax charge rows ──
-- Active: platform/booking fee (value 0 until admin sets it), offer slot, tip.
-- Inactive templates: convenience, surge, handling, extra-weight, waiting.
INSERT INTO billing_pricing_rules
  (name, type, calculation_type, value_numeric, value_json, priority, is_active, stackable,
   applies_to, metadata, offer_owner, is_hidden, service_type, discount_applies_on, charge_order_key)
SELECT
  v.name, v.type::billing_rule_type, v.calc::billing_calculation_type,
  v.val::numeric, NULL::jsonb, 100, v.active, v.stackable,
  v.applies::billing_applies_to, NULL::jsonb, v.owner::billing_offer_owner,
  false, 'PARCEL', 'ITEMS_TOTAL'::billing_discount_applies_on, v.ord
FROM (VALUES
  ('Booking fee',        'PLATFORM_FEE',    'FIXED',      '0',  true,  false, 'ORDER', 'GATIMITRA', 700000),
  ('Offer',              'OFFER',           'PERCENTAGE', NULL, true,  false, 'ORDER', 'GATIMITRA', 900000),
  ('Tip',                'RIDER_TIP',       'FIXED',      '0',  true,  false, 'ORDER', 'OTHER',     1700000),
  ('Convenience charges','CONVENIENCE_FEE', 'FIXED',      '0',  false, false, 'ORDER', 'GATIMITRA', 400000),
  ('Surge fee',          'SURGE',           'PERCENTAGE', '0',  false, false, 'ORDER', 'GATIMITRA', 1300000),
  ('Handling charge',    'OTHER',           'FIXED',      '0',  false, false, 'ORDER', 'GATIMITRA', 750000),
  ('Extra weight charge','OTHER',           'FIXED',      '0',  false, false, 'ORDER', 'GATIMITRA', 760000),
  ('Waiting charge',     'OTHER',           'FIXED',      '0',  false, false, 'ORDER', 'GATIMITRA', 1350000)
) AS v(name, type, calc, val, active, stackable, applies, owner, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM billing_pricing_rules r WHERE r.service_type = 'PARCEL' AND r.name = v.name
);

-- ── GST (TAX) rows — INACTIVE, linked to the parcel tax configs above ──
INSERT INTO billing_pricing_rules
  (name, type, calculation_type, value_numeric, value_json, priority, is_active, stackable,
   applies_to, metadata, offer_owner, is_hidden, service_type, discount_applies_on, charge_order_key, tax_config_id)
SELECT
  v.name, 'TAX'::billing_rule_type, 'FIXED'::billing_calculation_type,
  NULL::numeric,
  jsonb_build_object('tax_config_id', tc.id, 'formula_source', 'billing_tax_configs'),
  100, false, false,
  'ORDER'::billing_applies_to,
  '{"confirm_rate":true,"note":"Seeded INACTIVE. Set the rate on the linked billing_tax_configs row and activate this rule after CA confirmation."}'::jsonb,
  'GATIMITRA'::billing_offer_owner, false, 'PARCEL',
  'ITEMS_TOTAL'::billing_discount_applies_on, v.ord, tc.id
FROM (VALUES
  ('GST on parcel delivery',        'GST on parcel delivery',        1100000),
  ('GST on parcel booking fee',     'GST on parcel booking fee',     1200000),
  ('GST on parcel convenience fee', 'GST on parcel convenience fee', 1250000),
  ('GST on parcel surge',           'GST on parcel surge',           1400000)
) AS v(name, tc_name, ord)
JOIN billing_tax_configs tc ON tc.service_type = 'PARCEL' AND tc.name = v.tc_name
WHERE NOT EXISTS (
  SELECT 1 FROM billing_pricing_rules r WHERE r.service_type = 'PARCEL' AND r.name = v.name
);
