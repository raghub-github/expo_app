-- ============================================================================
-- Order refunds: additional indexes for queries by order+status+created,
-- type+created, pg_refund_id, refund_initiated_by, product_type.
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_refunds_order_status_created_idx
  ON public.order_refunds (order_id, refund_status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_refunds_type_created_idx
  ON public.order_refunds (refund_type, created_at DESC);

CREATE INDEX IF NOT EXISTS order_refunds_pg_refund_id_idx
  ON public.order_refunds (pg_refund_id)
  WHERE pg_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_refunds_refund_initiated_by_idx
  ON public.order_refunds (refund_initiated_by)
  WHERE refund_initiated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_refunds_product_type_idx
  ON public.order_refunds (product_type)
  WHERE product_type IS NOT NULL;
