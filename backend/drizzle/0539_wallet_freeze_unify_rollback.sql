-- Rollback 0539. Does not drop merchant freeze columns from 0239.
-- Does not drop payment_wallet_freeze_logs (owned by 0239).

ALTER TABLE public.rider_wallet DROP COLUMN IF EXISTS freeze_reason;

DROP INDEX IF EXISTS merchant_wallet_frozen_idx;

DELETE FROM public.notification_templates
WHERE code IN (
  'RIDER_WALLET_FROZEN',
  'RIDER_WALLET_UNFROZEN',
  'MERCHANT_WALLET_FROZEN',
  'MERCHANT_WALLET_UNFROZEN'
);
