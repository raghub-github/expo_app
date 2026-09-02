-- GMitra Plus: revoke membership when order-embedded subscription fee is refunded.
-- Migration: 0586_customer_subscription_refund_revocation
-- Prerequisite: run 0586_customer_subscription_refund_revocation_enums.sql first.

ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS source_order_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS refund_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT NULL;

COMMENT ON COLUMN public.customer_subscriptions.source_order_id IS
  'Food checkout order_id when membership was purchased with an order; NULL for standalone subscription purchases.';
COMMENT ON COLUMN public.customer_subscriptions.refund_id IS
  'order_refunds.id that triggered membership revocation (audit).';
COMMENT ON COLUMN public.customer_subscriptions.revoke_reason IS
  'Human-readable reason: order_full_refund, order_membership_fee_refund, admin, backfill, etc.';

CREATE INDEX IF NOT EXISTS customer_subscriptions_source_order_id_idx
  ON public.customer_subscriptions (source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_subscriptions_refund_id_idx
  ON public.customer_subscriptions (refund_id)
  WHERE refund_id IS NOT NULL;

-- Link historical checkout-embedded subscriptions to their source orders (indexed join).
UPDATE public.customer_subscriptions cs
SET source_order_id = po.finalized_order_id,
    updated_at = NOW()
FROM public.pending_orders po
WHERE cs.source_order_id IS NULL
  AND cs.razorpay_payment_id IS NOT NULL
  AND po.razorpay_payment_id = cs.razorpay_payment_id
  AND po.finalized_order_id IS NOT NULL
  AND COALESCE(po.checkout_metadata->>'subscriptionOptIn', 'false') = 'true';

UPDATE public.customer_subscriptions cs
SET source_order_id = po.finalized_order_id,
    updated_at = NOW()
FROM public.pending_orders po
WHERE cs.source_order_id IS NULL
  AND cs.razorpay_order_id IS NOT NULL
  AND po.razorpay_order_id = cs.razorpay_order_id
  AND po.finalized_order_id IS NOT NULL
  AND COALESCE(po.checkout_metadata->>'subscriptionOptIn', 'false') = 'true';

-- One-off repair: revoke active memberships whose source order was fully refunded
-- and included a checkout-embedded subscription charge.
UPDATE public.customer_subscriptions cs
SET status = 'refunded',
    refunded_at = NOW(),
    revoke_reason = 'order_full_refund_backfill',
    updated_at = NOW()
FROM public.orders_core oc
WHERE cs.source_order_id = oc.order_id
  AND cs.status = 'active'
  AND cs.source_order_id IS NOT NULL
  AND COALESCE(oc.total_refunded, 0) >= (
        COALESCE(
          NULLIF(TRIM(oc.billing_snapshot->>'final_amount'), '')::numeric,
          oc.grand_total,
          0
        ) - 0.02
      )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(oc.billing_snapshot->'charges', '[]'::jsonb)) elem
    WHERE elem->'meta'->>'source' = 'customer_subscription_checkout'
  );

-- Clear stale gmitra_plus_active for customers with no remaining active subscription.
UPDATE public.customers c
SET gmitra_plus_active = FALSE,
    updated_at = NOW()
WHERE c.gmitra_plus_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_subscriptions cs
    WHERE cs.customer_id = c.id
      AND cs.status = 'active'
      AND cs.expires_at > NOW()
  );
