-- 0469 · Auto-verify Commission plan (step 7) when onboarding payment is captured.
-- 1) Backfill: stores that already have a captured payment → step 7 verified.
-- 2) Trigger: any future INSERT/UPDATE to captured on merchant_onboarding_payments
--    upserts store_verification_steps (step 7) and clears open step-7 rejections.

CREATE OR REPLACE FUNCTION public.auto_verify_commission_plan_on_payment_capture()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid BIGINT;
  is_captured BOOLEAN;
  was_captured BOOLEAN;
BEGIN
  sid := NEW.merchant_store_id;
  IF sid IS NULL THEN
    RETURN NEW;
  END IF;

  is_captured := (
    LOWER(COALESCE(NEW.status, '')) = 'captured'
    OR LOWER(COALESCE(NEW.razorpay_status, '')) = 'captured'
  );

  IF NOT is_captured THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    was_captured := (
      LOWER(COALESCE(OLD.status, '')) = 'captured'
      OR LOWER(COALESCE(OLD.razorpay_status, '')) = 'captured'
    );
    -- Already captured with same store → no-op (idempotent).
    IF was_captured AND OLD.merchant_store_id IS NOT DISTINCT FROM NEW.merchant_store_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF to_regclass('public.store_verification_steps') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.store_verification_steps (
    store_id,
    step_number,
    verified_at,
    verified_by,
    verified_by_name,
    notes
  )
  VALUES (
    sid,
    7,
    COALESCE(NEW.captured_at, now()),
    NULL,
    'System (payment captured)',
    'AUTO_FROM_PAYMENT_CAPTURED'
  )
  ON CONFLICT (store_id, step_number) DO NOTHING;

  -- Open rejection would still show "Action required" even with a verified row.
  IF to_regclass('public.store_verification_step_rejections') IS NOT NULL THEN
    DELETE FROM public.store_verification_step_rejections
    WHERE store_id = sid
      AND step_number = 7;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_verify_commission_plan_on_payment_capture() IS
  'When merchant_onboarding_payments reaches status/razorpay_status=captured, auto-verify store verification step 7 (Commission plan).';

DROP TRIGGER IF EXISTS trg_auto_verify_commission_plan_on_payment_capture
  ON public.merchant_onboarding_payments;

CREATE TRIGGER trg_auto_verify_commission_plan_on_payment_capture
  AFTER INSERT OR UPDATE OF status, razorpay_status, merchant_store_id, captured_at
  ON public.merchant_onboarding_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_commission_plan_on_payment_capture();

-- ---------------------------------------------------------------------------
-- Backfill existing captured payments → step 7 verified
-- ---------------------------------------------------------------------------
INSERT INTO public.store_verification_steps (
  store_id,
  step_number,
  verified_at,
  verified_by,
  verified_by_name,
  notes
)
SELECT DISTINCT ON (p.merchant_store_id)
  p.merchant_store_id,
  7,
  COALESCE(p.captured_at, p.created_at, now()),
  NULL,
  'System (payment captured)',
  'AUTO_FROM_PAYMENT_CAPTURED'
FROM public.merchant_onboarding_payments p
WHERE p.merchant_store_id IS NOT NULL
  AND (
    LOWER(COALESCE(p.status, '')) = 'captured'
    OR LOWER(COALESCE(p.razorpay_status, '')) = 'captured'
  )
ORDER BY p.merchant_store_id, p.captured_at DESC NULLS LAST, p.created_at DESC
ON CONFLICT (store_id, step_number) DO NOTHING;

-- Clear open step-7 rejections for stores that now have a captured payment.
DELETE FROM public.store_verification_step_rejections r
WHERE r.step_number = 7
  AND EXISTS (
    SELECT 1
    FROM public.merchant_onboarding_payments p
    WHERE p.merchant_store_id = r.store_id
      AND (
        LOWER(COALESCE(p.status, '')) = 'captured'
        OR LOWER(COALESCE(p.razorpay_status, '')) = 'captured'
      )
  );
