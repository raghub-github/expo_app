-- Enrich order_cancellation_reasons as canonical cancellation record (all sources).

-- Backfill from metadata / orders_food / orders_core where possible.

-- Fix: never COALESCE enum columns with '' (invalid order_status_type).



ALTER TABLE public.order_cancellation_reasons

  ADD COLUMN IF NOT EXISTS catalog_reason_id BIGINT NULL,

  ADD COLUMN IF NOT EXISTS cancelled_by_type TEXT NULL,

  ADD COLUMN IF NOT EXISTS cancelled_by_label TEXT NULL,

  ADD COLUMN IF NOT EXISTS display_reason TEXT NULL,

  ADD COLUMN IF NOT EXISTS attribute TEXT NULL,

  ADD COLUMN IF NOT EXISTS rejection_label TEXT NULL,

  ADD COLUMN IF NOT EXISTS action_source TEXT NULL,

  ADD COLUMN IF NOT EXISTS cancel_mode TEXT NULL;



DO $$

BEGIN

  IF EXISTS (

    SELECT 1 FROM information_schema.tables

    WHERE table_schema = 'public' AND table_name = 'order_cancellation_reason_catalog'

  ) THEN

    IF NOT EXISTS (

      SELECT 1 FROM pg_constraint

      WHERE conname = 'order_cancellation_reasons_catalog_reason_id_fkey'

    ) THEN

      ALTER TABLE public.order_cancellation_reasons

        ADD CONSTRAINT order_cancellation_reasons_catalog_reason_id_fkey

        FOREIGN KEY (catalog_reason_id)

        REFERENCES public.order_cancellation_reason_catalog(id)

        ON DELETE SET NULL;

    END IF;

  END IF;

END $$;



CREATE INDEX IF NOT EXISTS order_cancellation_reasons_catalog_reason_id_idx

  ON public.order_cancellation_reasons(catalog_reason_id)

  WHERE catalog_reason_id IS NOT NULL;



CREATE INDEX IF NOT EXISTS order_cancellation_reasons_cancelled_by_type_idx

  ON public.order_cancellation_reasons(cancelled_by_type)

  WHERE cancelled_by_type IS NOT NULL;



CREATE INDEX IF NOT EXISTS order_cancellation_reasons_created_at_order_id_idx

  ON public.order_cancellation_reasons(order_id, created_at DESC);



COMMENT ON COLUMN public.order_cancellation_reasons.catalog_reason_id IS

  'FK to order_cancellation_reason_catalog when cancelled via dashboard catalog.';

COMMENT ON COLUMN public.order_cancellation_reasons.cancelled_by_type IS

  'Actor bucket: admin | store | customer | system | rider.';

COMMENT ON COLUMN public.order_cancellation_reasons.cancelled_by_label IS

  'Merchant-facing actor label, e.g. Rejected by GatiMitra Team.';

COMMENT ON COLUMN public.order_cancellation_reasons.display_reason IS

  'Merchant-facing reason text shown on timeline and order cards.';

COMMENT ON COLUMN public.order_cancellation_reasons.attribute IS

  'Catalog attribute: CUSTOMER | MERCHANT | RIDER | OTHER.';

COMMENT ON COLUMN public.order_cancellation_reasons.rejection_label IS

  'Catalog label without attribute prefix.';

COMMENT ON COLUMN public.order_cancellation_reasons.action_source IS

  'Channel: admin | app | website | api | system.';

COMMENT ON COLUMN public.order_cancellation_reasons.cancel_mode IS

  'auto | manual.';



-- Backfill structured columns from metadata JSON (dashboard catalog cancels)

UPDATE public.order_cancellation_reasons ocr

SET

  catalog_reason_id = COALESCE(

    ocr.catalog_reason_id,

    NULLIF((ocr.metadata->>'catalogReasonId')::text, '')::bigint,

    NULLIF((ocr.metadata->>'catalog_reason_id')::text, '')::bigint

  ),

  attribute = COALESCE(ocr.attribute, NULLIF(ocr.metadata->>'attribute', '')),

  rejection_label = COALESCE(

    ocr.rejection_label,

    NULLIF(ocr.metadata->>'rejection', '')

  ),

  cancelled_by_type = COALESCE(

    ocr.cancelled_by_type,

    CASE lower(COALESCE(ocr.metadata->>'source', ocr.cancelled_by, ''))

      WHEN 'admin' THEN 'admin'

      WHEN 'store' THEN 'store'

      WHEN 'merchant' THEN 'store'

      WHEN 'customer' THEN 'customer'

      WHEN 'system' THEN 'system'

      WHEN 'rider' THEN 'rider'

      ELSE NULL

    END

  ),

  display_reason = COALESCE(

    ocr.display_reason,

    ocr.reason_text,

    NULLIF(ocr.metadata->>'rejected_reason', '')

  ),

  cancelled_by_label = COALESCE(

    ocr.cancelled_by_label,

    NULLIF(ocr.metadata->>'cancelled_by_label', ''),

    CASE lower(COALESCE(ocr.metadata->>'source', ''))

      WHEN 'admin' THEN 'Rejected by GatiMitra Team'

      ELSE NULL

    END

  ),

  action_source = COALESCE(

    ocr.action_source,

    NULLIF(ocr.metadata->>'action_source', ''),

    CASE lower(COALESCE(ocr.metadata->>'source', ''))

      WHEN 'admin' THEN 'admin'

      ELSE NULL

    END

  ),

  cancel_mode = COALESCE(

    ocr.cancel_mode,

    NULLIF(ocr.metadata->>'cancel_mode', '')

  )

WHERE ocr.metadata IS NOT NULL AND ocr.metadata <> '{}'::jsonb;



-- Backfill merchant / auto cancels from orders_food when no cancellation row exists

INSERT INTO public.order_cancellation_reasons (

  order_id,

  cancelled_by,

  cancelled_by_id,

  reason_code,

  reason_text,

  refund_status,

  cancelled_by_type,

  cancelled_by_label,

  display_reason,

  action_source,

  cancel_mode,

  metadata

)

SELECT

  f.order_id,

  COALESCE(NULLIF(trim(f.cancelled_by), ''), 'merchant'),

  f.cancelled_by_id,

  upper(regexp_replace(COALESCE(NULLIF(trim(f.rejected_reason), ''), 'STORE_CANCEL'), '[^A-Za-z0-9]+', '_', 'g')),

  NULLIF(trim(f.rejected_reason), ''),

  'no_refund',

  COALESCE(NULLIF(trim(f.cancelled_by_type::text), ''), 'store'),

  NULLIF(trim(f.cancelled_by_label), ''),

  COALESCE(NULLIF(trim(f.rejected_reason), ''), 'Order cancelled'),

  COALESCE(f.cancellation_details->>'action_source', 'website'),

  COALESCE(f.cancellation_details->>'cancel_mode', 'manual'),

  COALESCE(f.cancellation_details, '{}'::jsonb)

FROM orders_food f

JOIN orders_core c ON c.id = f.order_id

WHERE upper(COALESCE(f.order_status::text, '')) = 'CANCELLED'

  AND NOT EXISTS (

    SELECT 1 FROM public.order_cancellation_reasons ocr

    WHERE ocr.order_id = f.order_id

  );



-- Link orders_core.cancellation_reason_id to latest row per order

UPDATE orders_core c

SET cancellation_reason_id = sub.id

FROM (

  SELECT DISTINCT ON (order_id) id, order_id

  FROM public.order_cancellation_reasons

  ORDER BY order_id, created_at DESC

) sub

WHERE c.id = sub.order_id

  AND (c.cancellation_reason_id IS NULL OR c.cancellation_reason_id <> sub.id)

  AND (

    lower(COALESCE(c.status::text, '')) = 'cancelled'

    OR upper(COALESCE(c.current_status::text, '')) IN ('CANCELLED', 'CANCELED')
    OR lower(COALESCE(c.current_status::text, '')) = 'cancelled'

  );



-- Sync orders_food display from latest cancellation row when food labels are generic

UPDATE orders_food f

SET

  rejected_reason = COALESCE(NULLIF(trim(ocr.display_reason), ''), f.rejected_reason),

  cancelled_by_label = COALESCE(NULLIF(trim(ocr.cancelled_by_label), ''), f.cancelled_by_label),

  cancelled_by_type = COALESCE(NULLIF(trim(ocr.cancelled_by_type), ''), f.cancelled_by_type::text),

  cancellation_reason_id = COALESCE(f.cancellation_reason_id, ocr.id),

  updated_at = NOW()

FROM (

  SELECT DISTINCT ON (order_id)

    id,

    order_id,

    display_reason,

    cancelled_by_label,

    cancelled_by_type

  FROM public.order_cancellation_reasons

  ORDER BY order_id, created_at DESC

) ocr

WHERE f.order_id = ocr.order_id

  AND upper(COALESCE(f.order_status::text, '')) = 'CANCELLED'

  AND (

    f.rejected_reason IS NULL

    OR lower(trim(f.rejected_reason)) IN ('order cancelled', 'order cancel', 'cancelled', 'canceled')

    OR f.cancelled_by_label IS NULL

    OR lower(trim(f.cancelled_by_label)) LIKE '%restaurant%order cancelled%'

  );



-- Safety net: any future cancel on orders_food writes order_cancellation_reasons if app missed it.

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

  v_action_source := COALESCE(NEW.cancellation_details->>'action_source', 'website');

  v_cancel_mode := COALESCE(NEW.cancellation_details->>'cancel_mode', 'manual');

  v_reason_code := upper(regexp_replace(COALESCE(v_display, 'STORE_CANCEL'), '[^A-Za-z0-9]+', '_', 'g'));



  INSERT INTO public.order_cancellation_reasons (

    order_id,

    cancelled_by,

    cancelled_by_id,

    reason_code,

    reason_text,

    refund_status,

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

    'no_refund',

    v_type,

    v_label,

    v_display,

    v_action_source,

    v_cancel_mode,

    COALESCE(NEW.cancellation_details, '{}'::jsonb)

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



DROP TRIGGER IF EXISTS orders_food_sync_cancellation_reason_trg ON public.orders_food;

CREATE TRIGGER orders_food_sync_cancellation_reason_trg

  BEFORE UPDATE OF order_status ON public.orders_food

  FOR EACH ROW

  EXECUTE FUNCTION public.trg_orders_food_sync_cancellation_reason();


