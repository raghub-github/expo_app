-- Rollback: 0586_customer_subscription_refund_revocation
-- Enum values cannot be removed safely; columns/indexes only.

DROP INDEX IF EXISTS public.customer_subscriptions_refund_id_idx;
DROP INDEX IF EXISTS public.customer_subscriptions_source_order_id_idx;

ALTER TABLE public.customer_subscriptions
  DROP COLUMN IF EXISTS revoke_reason,
  DROP COLUMN IF EXISTS refunded_at,
  DROP COLUMN IF EXISTS refunded_amount,
  DROP COLUMN IF EXISTS refund_id,
  DROP COLUMN IF EXISTS source_order_id;
