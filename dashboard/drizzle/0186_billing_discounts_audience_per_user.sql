-- Coupon audience (who may redeem at checkout) and per-user redemption cap.
ALTER TABLE billing_discounts
  ADD COLUMN IF NOT EXISTS offer_audience text NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE billing_discounts
  ADD COLUMN IF NOT EXISTS per_user_usage_limit integer;

ALTER TABLE billing_discounts DROP CONSTRAINT IF EXISTS billing_discounts_offer_audience_check;
ALTER TABLE billing_discounts ADD CONSTRAINT billing_discounts_offer_audience_check
  CHECK (offer_audience IN ('CUSTOMER', 'MERCHANT', 'RIDER'));

COMMENT ON COLUMN billing_discounts.offer_audience IS 'CUSTOMER | MERCHANT | RIDER — must match checkout actor for coupon to apply.';
COMMENT ON COLUMN billing_discounts.per_user_usage_limit IS 'Max redemptions per actor; NULL = unlimited per user. Total cap remains usage_limit.';
