-- DEV: Backfill order-detail sidebar fields for existing food orders (OTP + billing_snapshot keys).
-- Safe to run multiple times. Review counts before COMMIT.

BEGIN;

-- Column from 0008_unified_order_schema — add when dev DB skipped that migration
ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS default_system_kpt_minutes INTEGER;

-- 1) Generate pickup / delivery / RTO OTPs where missing
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oc.id
    FROM public.orders_core oc
    WHERE oc.order_type = 'food'
      AND oc.pickup_otp IS NULL
    ORDER BY oc.id DESC
    LIMIT 500
  LOOP
    BEGIN
      PERFORM public.generate_unique_order_otps(r.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'OTP backfill skipped for order %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- 2) Ensure billing_snapshot has serviceable + deliveryType for locality / delivery type UI
UPDATE public.orders_core oc
SET
  billing_snapshot = COALESCE(billing_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'serviceable', COALESCE((billing_snapshot->>'serviceable')::boolean, true),
      'deliveryType', COALESCE(
        billing_snapshot->>'deliveryType',
        delivery_type::text,
        'delivery'
      )
    ),
  default_system_kpt_minutes = COALESCE(
    default_system_kpt_minutes,
    (
      SELECT ms.avg_preparation_time_minutes::int
      FROM public.merchant_stores ms
      WHERE ms.id = oc.merchant_store_id
      LIMIT 1
    )
  ),
  updated_at = NOW()
WHERE oc.order_type = 'food'
  AND (
    billing_snapshot IS NULL
    OR billing_snapshot->>'serviceable' IS NULL
    OR billing_snapshot->>'deliveryType' IS NULL
    OR default_system_kpt_minutes IS NULL
  );

-- 3) Mirror leaveAtDoor into checkout_metadata when only present in instructions
UPDATE public.orders_core oc
SET
  checkout_metadata = COALESCE(checkout_metadata, '{}'::jsonb)
    || jsonb_build_object('leaveAtDoor', true),
  updated_at = NOW()
WHERE oc.order_type = 'food'
  AND (checkout_metadata->>'leaveAtDoor') IS NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(oc.delivery_instructions_list, '[]'::jsonb)) t
    WHERE lower(t.value) LIKE '%leave at door%'
  );

COMMIT;
