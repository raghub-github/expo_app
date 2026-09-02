-- One-off: revoke GMitra Plus for customer GM100001 — subscription bought on last
-- refunded order. Idempotent (skips if already terminal).

WITH cust AS (
  SELECT id FROM public.customers WHERE customer_id = 'GM100001' LIMIT 1
),
target_sub AS (
  SELECT cs.id, cs.source_order_id
  FROM public.customer_subscriptions cs
  JOIN cust c ON c.id = cs.customer_id
  WHERE cs.status = 'active'
  ORDER BY cs.created_at DESC
  LIMIT 1
)
UPDATE public.customer_subscriptions cs
SET status = 'refunded',
    refunded_at = COALESCE(cs.refunded_at, NOW()),
    revoke_reason = COALESCE(
      NULLIF(TRIM(cs.revoke_reason), ''),
      'manual_revoke_gm100001_last_order_membership_refund'
    ),
    updated_at = NOW()
FROM target_sub t
WHERE cs.id = t.id
  AND cs.status = 'active';

UPDATE public.customers c
SET gmitra_plus_active = EXISTS (
      SELECT 1
      FROM public.customer_subscriptions cs
      WHERE cs.customer_id = c.id
        AND cs.status = 'active'
        AND cs.expires_at > NOW()
    ),
    updated_at = NOW()
WHERE c.customer_id = 'GM100001';
