-- Server-authoritative merchant acceptance deadline for food orders.
-- Backend timeout worker cancels when merchant_acceptance_deadline_at < NOW().

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS merchant_acceptance_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merchant_acceptance_window_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS merchant_acceptance_timeout_processed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders_food.merchant_acceptance_deadline_at IS
  'Server-authoritative deadline for merchant to accept; backend timeout worker cancels after this.';
COMMENT ON COLUMN public.orders_food.merchant_acceptance_window_seconds IS
  'Snapshot of configured acceptance window (seconds) at order creation.';
COMMENT ON COLUMN public.orders_food.merchant_acceptance_timeout_processed_at IS
  'Set when system auto-cancel / timeout processing completes.';

CREATE OR REPLACE FUNCTION public.compute_merchant_acceptance_window_seconds(p_store_id BIGINT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT GREATEST(60, LEAST(10800, COALESCE(p.acceptance_window_minutes, 5) * 60))
      FROM public.merchant_stores s
      LEFT JOIN public.platform_food_acceptance_settings_by_store_type p
        ON p.store_type = COALESCE(s.store_type::text, 'GENERAL')
      WHERE s.id = p_store_id
      LIMIT 1
    ),
    300
  )::int;
$$;

CREATE OR REPLACE FUNCTION public.compute_merchant_acceptance_deadline(
  p_store_id BIGINT,
  p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT p_created_at + make_interval(secs => public.compute_merchant_acceptance_window_seconds(p_store_id)::double precision);
$$;

-- Backfill open unaccepted orders.
UPDATE public.orders_food f
SET
  merchant_acceptance_window_seconds = public.compute_merchant_acceptance_window_seconds(f.merchant_store_id),
  merchant_acceptance_deadline_at = public.compute_merchant_acceptance_deadline(f.merchant_store_id, f.created_at)
WHERE f.merchant_acceptance_deadline_at IS NULL
  AND f.merchant_store_id IS NOT NULL
  AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
  AND f.cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_food_merchant_acceptance_deadline
  ON public.orders_food (merchant_acceptance_deadline_at)
  WHERE cancelled_at IS NULL
    AND upper(COALESCE(order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
    AND merchant_acceptance_deadline_at IS NOT NULL;

-- Set deadline on new orders_food rows created by orders_core trigger.
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw TEXT;
  v_order_status TEXT;
  v_item_count INTEGER;
  v_delivery_list jsonb;
  v_merchant_list jsonb;
  v_scheduled boolean;
  v_window_secs INTEGER;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_raw := UPPER(COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED'));

    v_order_status := CASE
      WHEN v_raw IN (
        'PLACED', 'ORDER_RECEIVED', 'ORDER_PLACED', 'NEW', 'CREATED',
        'BILL READY', 'PAYMENT INITIATED AT', 'PYMT ASSIGN RX', 'PAYMENT DONE'
      ) THEN 'CREATED'
      WHEN v_raw = 'ACCEPTED' THEN 'ACCEPTED'
      WHEN v_raw = 'PREPARING' THEN 'PREPARING'
      WHEN v_raw = 'READY_FOR_PICKUP' THEN 'READY_FOR_PICKUP'
      WHEN v_raw IN ('OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'ON_THE_WAY') THEN 'OUT_FOR_DELIVERY'
      WHEN v_raw = 'DELIVERED' THEN 'DELIVERED'
      WHEN v_raw IN ('RTO', 'FAILED') THEN 'RTO'
      WHEN v_raw = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'CREATED'
    END;

    SELECT COALESCE(SUM((elem->>'quantity')::int), 0)::int
    INTO v_item_count
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) elem;

    v_delivery_list := COALESCE(NEW.delivery_instructions_list, '[]'::jsonb);
    IF v_delivery_list = '[]'::jsonb AND NEW.checkout_metadata IS NOT NULL THEN
      v_delivery_list := COALESCE(
        (
          SELECT jsonb_agg(trimmed)
          FROM (
            SELECT trim(both from elem) AS trimmed
            FROM unnest(
              ARRAY[
                NULLIF(trim(NEW.checkout_metadata->>'deliveryInstructions'), ''),
                CASE WHEN (NEW.checkout_metadata->>'leaveAtDoor')::boolean IS TRUE THEN 'Leave at door' END,
                CASE WHEN (NEW.checkout_metadata->>'dontRingBell')::boolean IS TRUE THEN 'Do not ring bell' END,
                CASE WHEN (NEW.checkout_metadata->>'avoidCalling')::boolean IS TRUE THEN 'Avoid calling' END
              ]
            ) AS elem
            WHERE elem IS NOT NULL AND trim(elem) <> ''
          ) s
        ),
        '[]'::jsonb
      );
    END IF;

    v_merchant_list := COALESCE(NEW.merchant_instructions_list, '[]'::jsonb);
    IF v_merchant_list = '[]'::jsonb AND NEW.checkout_metadata IS NOT NULL THEN
      v_merchant_list := COALESCE(
        (
          SELECT jsonb_agg(trimmed)
          FROM (
            SELECT trim(both from elem) AS trimmed
            FROM unnest(
              ARRAY[
                NULLIF(trim(NEW.checkout_metadata->>'restaurantNote'), ''),
                CASE WHEN (NEW.checkout_metadata->>'skipCutlery')::boolean IS TRUE THEN 'Don''t send cutlery' END
              ]
            ) AS elem
            WHERE elem IS NOT NULL AND trim(elem) <> ''
          ) s
        ),
        '[]'::jsonb
      );
    END IF;

    v_scheduled := COALESCE(
      NEW.is_scheduled_order,
      (
        NEW.checkout_metadata IS NOT NULL
        AND NULLIF(trim(NEW.checkout_metadata->>'scheduledDeliverySummary'), '') IS NOT NULL
      ),
      false
    );

    v_window_secs := public.compute_merchant_acceptance_window_seconds(NEW.merchant_store_id);
    v_deadline := public.compute_merchant_acceptance_deadline(NEW.merchant_store_id, now());

    IF EXISTS (
      SELECT 1 FROM public.orders_food
      WHERE order_id = NEW.id
         OR (NEW.order_id IS NOT NULL AND core_order_id = NEW.order_id)
    ) THEN
      UPDATE public.orders_food SET
        order_id = NEW.id,
        core_order_id = NEW.order_id,
        merchant_store_id = NEW.merchant_store_id,
        merchant_parent_id = NEW.merchant_parent_id,
        customer_id = NEW.customer_id,
        food_items_count = COALESCE(NULLIF(v_item_count, 0), food_items_count),
        food_items_total_value = NEW.grand_total,
        items = COALESCE(NEW.items, items),
        delivery_instructions_list = v_delivery_list,
        merchant_instructions_list = v_merchant_list,
        is_scheduled_order = v_scheduled,
        delivery_instructions = (
          SELECT string_agg(value, ' | ')
          FROM jsonb_array_elements_text(v_delivery_list) AS t(value)
        ),
        order_status = CASE
          WHEN UPPER(COALESCE(orders_food.order_status, '')) IN ('CANCELLED', 'DELIVERED', 'RTO')
            AND v_order_status = 'CREATED'
          THEN orders_food.order_status
          ELSE v_order_status
        END,
        formatted_order_id = COALESCE(NEW.formatted_order_id, formatted_order_id),
        merchant_acceptance_window_seconds = COALESCE(
          orders_food.merchant_acceptance_window_seconds,
          v_window_secs
        ),
        merchant_acceptance_deadline_at = COALESCE(
          orders_food.merchant_acceptance_deadline_at,
          v_deadline
        ),
        updated_at = now()
      WHERE order_id = NEW.id
         OR (NEW.order_id IS NOT NULL AND core_order_id = NEW.order_id);
    ELSE
      INSERT INTO public.orders_food (
        order_id,
        core_order_id,
        merchant_store_id,
        merchant_parent_id,
        customer_id,
        food_items_count,
        food_items_total_value,
        items,
        delivery_instructions_list,
        merchant_instructions_list,
        is_scheduled_order,
        delivery_instructions,
        order_status,
        formatted_order_id,
        merchant_acceptance_window_seconds,
        merchant_acceptance_deadline_at,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.order_id,
        NEW.merchant_store_id,
        NEW.merchant_parent_id,
        NEW.customer_id,
        NULLIF(v_item_count, 0),
        NEW.grand_total,
        NEW.items,
        v_delivery_list,
        v_merchant_list,
        v_scheduled,
        (
          SELECT string_agg(value, ' | ')
          FROM jsonb_array_elements_text(v_delivery_list) AS t(value)
        ),
        v_order_status,
        NEW.formatted_order_id,
        v_window_secs,
        v_deadline,
        now(),
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
