-- Extend offer_kind allowed values (classification / reporting; engine still keys off discount_type + delivery fields).

ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_offer_kind_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_offer_kind_chk
  CHECK (
    offer_kind IN (
      'DISCOUNT',
      'COUPON',
      'FREE_DELIVERY',
      'FLAT_DISCOUNT',
      'BUY_X_GET_Y',
      'CASHBACK',
      'CONVENIENCE_FEE_OFF',
      'SMALL_ORDER_FEE_OFF',
      'PACKAGING_DISCOUNT',
      'SURGE_DISCOUNT',
      'FREE_MENU_ITEM',
      'BUNDLE_DISCOUNT',
      'LOYALTY_REWARD',
      'SUBSCRIPTION_BENEFIT',
      'FLASH_SALE'
    )
  );
