-- Rollback 0469 · remove commission-plan auto-verify trigger + backfilled rows.

DROP TRIGGER IF EXISTS trg_auto_verify_commission_plan_on_payment_capture
  ON public.merchant_onboarding_payments;

DROP FUNCTION IF EXISTS public.auto_verify_commission_plan_on_payment_capture();

-- Only remove rows this migration inserted (do not touch agent-verified steps).
DELETE FROM public.store_verification_steps
WHERE step_number = 7
  AND notes = 'AUTO_FROM_PAYMENT_CAPTURED'
  AND verified_by IS NULL
  AND verified_by_name = 'System (payment captured)';
