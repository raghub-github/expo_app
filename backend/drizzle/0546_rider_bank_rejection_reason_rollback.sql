-- Rollback 0546
DELETE FROM public.notification_templates WHERE code = 'RIDER_BANK_REJECTED';

DROP INDEX IF EXISTS public.rider_payment_methods_rider_created_idx;

ALTER TABLE public.rider_payment_methods
  DROP COLUMN IF EXISTS rejection_reason;
