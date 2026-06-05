-- Merchant feedback: was the assigned rider in uniform? (per assignment row)
ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS merchant_rider_in_uniform BOOLEAN,
  ADD COLUMN IF NOT EXISTS merchant_uniform_reported_at TIMESTAMPTZ;

COMMENT ON COLUMN public.order_rider_assignments.merchant_rider_in_uniform IS
  'Merchant/store answer to "Was rider in uniform?" — true/false/null if not answered.';
COMMENT ON COLUMN public.order_rider_assignments.merchant_uniform_reported_at IS
  'When merchant submitted uniform feedback for this assignment.';

CREATE INDEX IF NOT EXISTS order_rider_assignments_uniform_feedback_idx
  ON public.order_rider_assignments (order_core_id, merchant_uniform_reported_at DESC NULLS LAST)
  WHERE merchant_rider_in_uniform IS NOT NULL;
