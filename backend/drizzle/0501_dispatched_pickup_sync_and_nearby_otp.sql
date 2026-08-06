-- 0501: Keep Dispatched food orders on DESPATCHED tab + include OTP in nearby push.
--
-- Root cause of "admin marked Dispatched but still on DESPATCH READY":
--   Food list DESPATCHED tab requires orders_food.rider_picked_up_at (or assignment.picked_up_at).
--   Status fields alone (in_transit / OUT_FOR_DELIVERY / Dispatched) without pickup timestamps
--   are classified as DESPATCH READY.
--
-- This migration:
--   1) Backfills missing pickup timestamps for already-dispatched active food orders
--   2) Installs a trigger so future core→in_transit always stamps food + assignment pickup
--   3) Updates ORDER_RIDER_ARRIVING template to include delivery OTP copy

-- ---------------------------------------------------------------------------
-- 1) Backfill: active dispatched food orders missing rider_picked_up_at
-- ---------------------------------------------------------------------------
WITH dispatched_food AS (
  SELECT
    of.id AS food_pk,
    of.order_id AS order_core_id,
    COALESCE(
      of.dispatched_at,
      of.handed_over_to_rider_at,
      of.updated_at,
      oc.updated_at,
      NOW()
    ) AS pickup_at
  FROM public.orders_food of
  INNER JOIN public.orders_core oc ON oc.id = of.order_id
  WHERE of.rider_picked_up_at IS NULL
    AND oc.cancelled_at IS NULL
    AND lower(trim(coalesce(oc.status::text, ''))) NOT IN (
      'delivered', 'cancelled', 'failed', 'rejected',
      'rto_initiated', 'rto_in_transit', 'rto_delivered', 'rto_lost'
    )
    AND upper(replace(replace(trim(coalesce(oc.current_status, '')), ' ', '_'), '-', '_'))
      NOT IN ('DELIVERED', 'CANCELLED', 'CANCELED', 'FAILED', 'REJECTED')
    AND (
      lower(trim(coalesce(oc.status::text, ''))) IN ('in_transit', 'dispatched')
      OR upper(replace(replace(trim(coalesce(oc.current_status, '')), ' ', '_'), '-', '_'))
        IN ('OUT_FOR_DELIVERY', 'DISPATCHED', 'DESPATCHED', 'ON_THE_WAY', 'IN_TRANSIT', 'PICKED_UP')
      OR upper(replace(replace(trim(coalesce(of.order_status, '')), ' ', '_'), '-', '_'))
        IN ('OUT_FOR_DELIVERY', 'DISPATCHED', 'DESPATCHED', 'ON_THE_WAY', 'IN_TRANSIT', 'PICKED_UP')
    )
)
UPDATE public.orders_food of
SET
  rider_picked_up_at = df.pickup_at,
  dispatched_at = COALESCE(of.dispatched_at, df.pickup_at),
  handed_over_to_rider_at = COALESCE(of.handed_over_to_rider_at, df.pickup_at),
  order_status = CASE
    WHEN upper(replace(replace(trim(coalesce(of.order_status, '')), ' ', '_'), '-', '_'))
      IN ('DELIVERED', 'CANCELLED', 'CANCELED')
      THEN of.order_status
    ELSE 'OUT_FOR_DELIVERY'
  END,
  updated_at = NOW()
FROM dispatched_food df
WHERE of.id = df.food_pk;

-- Align core status/label when food is clearly out for delivery but core still says ready/picked_up.
UPDATE public.orders_core oc
SET
  status = 'in_transit',
  current_status = CASE
    WHEN nullif(trim(oc.current_status), '') IS NULL
      OR upper(replace(replace(trim(oc.current_status), ' ', '_'), '-', '_'))
        IN (
          'READY_FOR_PICKUP', 'READY', 'DISPATCH_READY', 'DISPATCHREADY',
          'PICKED_UP', 'DISPATCH_READY_FOR_PICKUP'
        )
      THEN 'Dispatched'
    ELSE oc.current_status
  END,
  updated_at = NOW()
FROM public.orders_food of
WHERE of.order_id = oc.id
  AND of.rider_picked_up_at IS NOT NULL
  AND oc.cancelled_at IS NULL
  AND lower(trim(coalesce(oc.status::text, ''))) NOT IN (
    'delivered', 'cancelled', 'failed', 'rejected', 'in_transit', 'dispatched'
  )
  AND upper(replace(replace(trim(coalesce(of.order_status, '')), ' ', '_'), '-', '_'))
    IN ('OUT_FOR_DELIVERY', 'DISPATCHED', 'DESPATCHED', 'ON_THE_WAY', 'IN_TRANSIT', 'PICKED_UP');

-- Assignment pickup timestamps for active riders on those orders.
UPDATE public.order_rider_assignments ora
SET
  picked_up_at = COALESCE(ora.picked_up_at, of.rider_picked_up_at, NOW()),
  updated_at = NOW()
FROM public.orders_food of
WHERE of.order_id = ora.order_core_id
  AND of.rider_picked_up_at IS NOT NULL
  AND ora.picked_up_at IS NULL
  AND ora.rider_id IS NOT NULL
  AND ora.cancelled_at IS NULL
  AND ora.unassigned_at IS NULL
  AND upper(coalesce(ora.assignment_status::text, '')) NOT IN (
    'CANCELLED', 'REJECTED', 'UNASSIGNED'
  );

-- ---------------------------------------------------------------------------
-- 2) Trigger: orders_core → in_transit always stamps food pickup markers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_food_pickup_on_core_in_transit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND lower(trim(coalesce(NEW.status::text, ''))) IN ('in_transit', 'dispatched')
  THEN
    UPDATE public.orders_food
    SET
      order_status = CASE
        WHEN upper(replace(replace(trim(coalesce(order_status, '')), ' ', '_'), '-', '_'))
          IN ('DELIVERED', 'CANCELLED', 'CANCELED')
          THEN order_status
        ELSE 'OUT_FOR_DELIVERY'
      END,
      dispatched_at = COALESCE(dispatched_at, NOW()),
      rider_picked_up_at = COALESCE(rider_picked_up_at, NOW()),
      handed_over_to_rider_at = COALESCE(handed_over_to_rider_at, NOW()),
      updated_at = NOW()
    WHERE order_id = NEW.id;

    UPDATE public.order_rider_assignments
    SET
      picked_up_at = COALESCE(picked_up_at, NOW()),
      updated_at = NOW()
    WHERE (order_core_id = NEW.id OR order_id = NEW.id)
      AND rider_id IS NOT NULL
      AND cancelled_at IS NULL
      AND unassigned_at IS NULL
      AND picked_up_at IS NULL
      AND upper(coalesce(assignment_status::text, '')) NOT IN (
        'CANCELLED', 'REJECTED', 'UNASSIGNED'
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_core_sync_food_pickup_on_in_transit
  ON public.orders_core;

CREATE TRIGGER orders_core_sync_food_pickup_on_in_transit
AFTER UPDATE OF status ON public.orders_core
FOR EACH ROW
EXECUTE FUNCTION public.sync_food_pickup_on_core_in_transit();

COMMENT ON FUNCTION public.sync_food_pickup_on_core_in_transit() IS
  'When orders_core.status becomes in_transit/dispatched, stamp orders_food.rider_picked_up_at so DESPATCHED tab never drifts from the Dispatched chip.';

-- ---------------------------------------------------------------------------
-- 3) Nearby rider push includes delivery OTP
-- ---------------------------------------------------------------------------
UPDATE public.notification_templates
SET
  title_template = '📍 Rider Nearby',
  body_template =
    '{{riderName}} is nearby. Your delivery OTP is {{deliveryOtp}}. Share this OTP with the delivery partner to confirm your order delivery.',
  variables_schema =
    '{"orderId":"string","orderShortId":"string","riderName":"string","etaMinutes":"number","deliveryOtp":"string"}'::jsonb,
  updated_at = NOW()
WHERE code = 'ORDER_RIDER_ARRIVING'
  AND locale = 'en';
