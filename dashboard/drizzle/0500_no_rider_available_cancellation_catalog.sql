-- Mirror backend 0500 for dashboard migrations folder.
INSERT INTO public.order_cancellation_reason_catalog (
  attribute, label, reason_code, sort_order, is_active
) VALUES (
  'RIDER',
  'No delivery partner available',
  'NO_RIDER_AVAILABLE',
  9,
  TRUE
)
ON CONFLICT (reason_code) DO UPDATE
SET
  label = EXCLUDED.label,
  attribute = EXCLUDED.attribute,
  is_active = TRUE,
  updated_at = NOW();
