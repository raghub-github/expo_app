-- Cancellation refund debits (store bucket clawback on cancelled orders) — linked to customer_compensation (payout section C).

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS cancellation_refund NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_settlement_breakdown.cancellation_refund IS
  'Merchant wallet debit on order cancellation; mirrored in customer_compensation (payout section C).';

UPDATE public.order_settlement_breakdown osb
SET cancellation_refund = COALESCE(sub.total, 0)
FROM (
  SELECT
    f.order_id,
    SUM(l.amount)::numeric(12, 2) AS total
  FROM public.merchant_wallet_ledger l
  INNER JOIN public.orders_food f ON f.id = l.reference_id
  WHERE l.direction = 'DEBIT'
    AND l.reference_type = 'ORDER'::wallet_reference_type
    AND (
      (
        l.category = 'ORDER_ADJUSTMENT'::wallet_transaction_category
        AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
        AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
      )
      OR l.category IN (
        'REFUND_DEBIT'::wallet_transaction_category,
        'REFUND_TO_CUSTOMER'::wallet_transaction_category
      )
    )
  GROUP BY f.order_id
) sub
WHERE osb.order_id = sub.order_id;

UPDATE public.merchant_wallet_ledger l
SET metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_build_object(
  'cancellation_refund', l.amount,
  'customer_compensation', l.amount,
  'entry_type', COALESCE(l.metadata->>'entry_type', 'order_cancellation'),
  'balance_impact', COALESCE(l.metadata->>'balance_impact', 'debit')
)
WHERE l.direction = 'DEBIT'
  AND l.reference_type = 'ORDER'::wallet_reference_type
  AND (
    (
      l.category = 'ORDER_ADJUSTMENT'::wallet_transaction_category
      AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
      AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
    )
    OR (
      l.category IN (
        'REFUND_DEBIT'::wallet_transaction_category,
        'REFUND_TO_CUSTOMER'::wallet_transaction_category
      )
      AND (
        COALESCE(l.metadata->>'entry_type', '') ILIKE '%cancel%'
        OR COALESCE(l.description, '') ILIKE '%cancel%'
      )
    )
  )
  AND NOT COALESCE(l.metadata, '{}'::jsonb) ? 'cancellation_refund';
