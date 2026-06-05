-- Fix orders_food cancel trigger: infer app/system vs website, auto vs manual, pre-accept full refund.
-- Run after 0237_order_cancellation_reasons_enriched.sql

CREATE OR REPLACE FUNCTION public.trg_orders_food_sync_cancellation_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reason_id BIGINT;
  v_display TEXT;
  v_label TEXT;
  v_type TEXT;
  v_action_source TEXT;
  v_cancel_mode TEXT;
  v_reason_code TEXT;
  v_refund_status TEXT;
  v_refund_amount NUMERIC(10, 2);
  v_grand_total NUMERIC(12, 2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(NEW.order_status::text, '')) <> 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(OLD.order_status::text, '')) = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  IF NEW.cancellation_reason_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_cancellation_reasons ocr
    WHERE ocr.order_id = NEW.order_id
      AND ocr.created_at > NOW() - INTERVAL '2 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  v_display := NULLIF(trim(COALESCE(NEW.rejected_reason, '')), '');
  IF v_display IS NULL THEN
    v_display := 'Order cancelled';
  END IF;

  v_type := NULLIF(trim(COALESCE(NEW.cancelled_by_type::text, '')), '');
  IF v_type IS NULL THEN
    v_type := 'store';
  END IF;

  v_label := NULLIF(trim(COALESCE(NEW.cancelled_by_label, '')), '');
  IF v_label IS NULL THEN
    v_label := CASE v_type
      WHEN 'system' THEN 'Auto Cancelled'
      WHEN 'admin' THEN 'Rejected by GatiMitra Team'
      WHEN 'customer' THEN 'Cancelled by customer'
      WHEN 'rider' THEN 'Cancelled by rider'
      ELSE 'Rejected by Restaurant'
    END;
  END IF;

  v_action_source := NULLIF(trim(COALESCE(NEW.cancellation_details->>'action_source', '')), '');
  IF v_action_source IS NULL THEN
    v_action_source := CASE
      WHEN lower(v_display) LIKE 'auto cancel%' THEN 'system'
      WHEN lower(v_label) LIKE 'auto cancel%' THEN 'system'
      WHEN lower(v_type) = 'system' THEN 'system'
      WHEN lower(COALESCE(NEW.cancellation_details->>'source', '')) = 'system' THEN 'system'
      ELSE 'website'
    END;
  END IF;

  v_cancel_mode := NULLIF(trim(COALESCE(NEW.cancellation_details->>'cancel_mode', '')), '');
  IF v_cancel_mode IS NULL THEN
    v_cancel_mode := CASE
      WHEN lower(v_display) LIKE 'auto cancel%' THEN 'auto'
      WHEN lower(v_label) LIKE 'auto cancel%' THEN 'auto'
      WHEN v_action_source = 'system' THEN 'auto'
      ELSE 'manual'
    END;
  END IF;

  SELECT COALESCE(c.grand_total, 0)::numeric(12, 2)
  INTO v_grand_total
  FROM public.orders_core c
  WHERE c.id = NEW.order_id;

  IF NEW.accepted_at IS NULL AND COALESCE(v_grand_total, 0) > 0 THEN
    v_refund_status := 'pending';
    v_refund_amount := v_grand_total;
  ELSE
    v_refund_status := 'no_refund';
    v_refund_amount := NULL;
  END IF;

  v_reason_code := upper(regexp_replace(COALESCE(v_display, 'STORE_CANCEL'), '[^A-Za-z0-9]+', '_', 'g'));

  INSERT INTO public.order_cancellation_reasons (
    order_id,
    cancelled_by,
    cancelled_by_id,
    reason_code,
    reason_text,
    refund_status,
    refund_amount,
    cancelled_by_type,
    cancelled_by_label,
    display_reason,
    action_source,
    cancel_mode,
    metadata
  ) VALUES (
    NEW.order_id,
    COALESCE(NULLIF(trim(NEW.cancelled_by), ''), 'merchant'),
    NEW.cancelled_by_id,
    v_reason_code,
    v_display,
    v_refund_status,
    v_refund_amount,
    v_type,
    v_label,
    v_display,
    v_action_source,
    v_cancel_mode,
    COALESCE(NEW.cancellation_details, '{}'::jsonb)
      || jsonb_build_object(
        'action_source', v_action_source,
        'cancel_mode', v_cancel_mode,
        'rejected_reason', v_display
      )
  )
  RETURNING id INTO v_reason_id;

  NEW.cancellation_reason_id := v_reason_id;

  UPDATE orders_core
  SET
    cancellation_reason_id = v_reason_id,
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancelled_by = COALESCE(cancelled_by, COALESCE(NULLIF(trim(NEW.cancelled_by), ''), 'merchant')),
    cancelled_by_type = v_type,
    status = CASE
      WHEN status IS NULL OR lower(status::text) NOT IN ('cancelled', 'failed') THEN 'cancelled'::order_status_type
      ELSE status
    END,
    current_status = CASE
      WHEN current_status IS NULL
        OR upper(COALESCE(current_status::text, '')) NOT IN ('CANCELLED', 'CANCELED', 'CANCELLED')
      THEN 'CANCELLED'
      ELSE current_status::text
    END,
    cancellation_details = COALESCE(cancellation_details, '{}'::jsonb)
      || jsonb_build_object(
        'version', 1,
        'source', v_type,
        'cancelled_by_label', v_label,
        'rejected_reason', v_display,
        'action_source', v_action_source,
        'cancel_mode', v_cancel_mode
      ),
    updated_at = NOW()
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_orders_food_sync_cancellation_reason IS
  'Safety-net cancellation row: respects cancellation_details; pre-accept cancel → refund_status=pending + full grand_total.';

-- Backfill recent auto-cancel rows that were saved as website/manual/no_refund
UPDATE public.order_cancellation_reasons ocr
SET
  action_source = 'system',
  cancel_mode = 'auto',
  cancelled_by_type = COALESCE(ocr.cancelled_by_type, 'system'),
  refund_status = CASE
    WHEN ocr.refund_status IN ('no_refund', 'none', '') OR ocr.refund_status IS NULL THEN 'pending'
    ELSE ocr.refund_status
  END,
  refund_amount = COALESCE(
    ocr.refund_amount,
    (SELECT c.grand_total FROM public.orders_core c WHERE c.id = ocr.order_id),
    ocr.refund_amount
  )
FROM public.orders_food f
WHERE f.order_id = ocr.order_id
  AND f.accepted_at IS NULL
  AND (
    lower(COALESCE(ocr.display_reason, ocr.reason_text, '')) LIKE 'auto cancel%'
    OR lower(COALESCE(ocr.cancelled_by_label, '')) LIKE 'auto cancel%'
  )
  AND ocr.created_at > NOW() - INTERVAL '30 days'
  AND COALESCE(ocr.action_source, 'website') = 'website'
  AND COALESCE(ocr.cancel_mode, 'manual') = 'manual';
