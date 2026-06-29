-- Link customer_compensation ↔ cancellation_refund (same payout deduction, section C).

COMMENT ON COLUMN public.order_settlement_breakdown.cancellation_refund IS
  'Alias of customer_compensation for cancelled-order store-bucket debits (payout section C).';

COMMENT ON COLUMN public.order_settlement_breakdown.customer_compensation IS
  'Customer compensation / cancellation refund debited from merchant (payout section C).';

UPDATE public.order_settlement_breakdown
SET
  customer_compensation = GREATEST(
    COALESCE(customer_compensation, 0),
    COALESCE(cancellation_refund, 0)
  ),
  cancellation_refund = GREATEST(
    COALESCE(customer_compensation, 0),
    COALESCE(cancellation_refund, 0)
  )
WHERE COALESCE(customer_compensation, 0) > 0
   OR COALESCE(cancellation_refund, 0) > 0;

UPDATE public.merchant_wallet_ledger l
SET metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_build_object(
  'customer_compensation', GREATEST(
    COALESCE((l.metadata->>'customer_compensation')::numeric, 0),
    COALESCE((l.metadata->>'cancellation_refund')::numeric, 0),
    l.amount
  ),
  'cancellation_refund', GREATEST(
    COALESCE((l.metadata->>'customer_compensation')::numeric, 0),
    COALESCE((l.metadata->>'cancellation_refund')::numeric, 0),
    l.amount
  )
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
    OR l.category = 'PENALTY'::wallet_transaction_category
  );
