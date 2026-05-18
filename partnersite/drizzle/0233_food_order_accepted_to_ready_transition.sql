-- Allow merchant to mark ACCEPTED orders ready without a separate PREPARING step.
-- No enum change: order_status already includes ACCEPTED, PREPARING, READY_FOR_PICKUP.
-- Application APIs (partner site, dashboard, merchant app) enforce transitions in code.

COMMENT ON COLUMN public.orders_food.order_status IS
  'Food order lifecycle: CREATED → ACCEPTED → (optional PREPARING) → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED. '
  'Terminal: RTO, CANCELLED. Merchant may move ACCEPTED → READY_FOR_PICKUP directly when marking order ready.';

COMMENT ON COLUMN public.orders_food.preparing_at IS
  'When kitchen prep started. Set on PREPARING, or on READY_FOR_PICKUP if merchant skipped PREPARING.';

COMMENT ON COLUMN public.orders_food.prepared_at IS
  'When order was marked ready for pickup (READY_FOR_PICKUP).';
