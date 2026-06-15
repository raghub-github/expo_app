-- Customer post-delivery feedback: restaurant packaging + rider uniform (per assignment).

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS customer_packaging_feedback TEXT,
  ADD COLUMN IF NOT EXISTS customer_packaging_reported_at TIMESTAMPTZ;

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS customer_rider_in_uniform BOOLEAN,
  ADD COLUMN IF NOT EXISTS customer_uniform_reported_at TIMESTAMPTZ;

ALTER TABLE public.orders_food
  DROP CONSTRAINT IF EXISTS orders_food_customer_packaging_feedback_check;

ALTER TABLE public.orders_food
  ADD CONSTRAINT orders_food_customer_packaging_feedback_check
  CHECK (
    customer_packaging_feedback IS NULL
    OR customer_packaging_feedback IN ('good', 'not_good')
  );

COMMENT ON COLUMN public.orders_food.customer_packaging_feedback IS
  'Customer answer: How was the restaurant packaging? good | not_good';
COMMENT ON COLUMN public.orders_food.customer_packaging_reported_at IS
  'When customer submitted packaging feedback for this order.';

COMMENT ON COLUMN public.order_rider_assignments.customer_rider_in_uniform IS
  'Customer answer: Was delivery partner in GatiMitra uniform?';
COMMENT ON COLUMN public.order_rider_assignments.customer_uniform_reported_at IS
  'When customer submitted rider uniform feedback for this assignment.';

CREATE INDEX IF NOT EXISTS orders_food_customer_packaging_feedback_idx
  ON public.orders_food (merchant_store_id, customer_packaging_reported_at DESC NULLS LAST)
  WHERE customer_packaging_feedback IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_rider_assignments_customer_uniform_feedback_idx
  ON public.order_rider_assignments (order_core_id, customer_uniform_reported_at DESC NULLS LAST)
  WHERE customer_rider_in_uniform IS NOT NULL;
