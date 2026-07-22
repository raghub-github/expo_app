-- ─────────────────────────────────────────────────────────────────────────────
-- 0425 · subscription_payments: dedupe + one row per gateway payment id
--
-- One Razorpay/wallet payment must appear EXACTLY ONCE in Plan Purchase History.
-- Duplicates existed because there was no uniqueness on payment_gateway_id — e.g. a
-- legacy insert storing only `amount` (₹5, no GST) plus a later full insert with the
-- GST breakdown (₹5.90) produced TWO rows under the same gateway id.
--
-- This removes the less-complete duplicate (keeping the row that carries total_paise /
-- GST, then the latest) and adds a partial UNIQUE index so it can never happen again.
-- Belt-and-suspenders: recordSubscriptionPayment() also upserts on this id, and its
-- INSERT is wrapped so a race that trips the index is a harmless no-op.
--
-- Dry-run verified: exactly ONE duplicate group platform-wide (pay_T2B9vmmYehbXHi,
-- ids 11 & 12) → deletes id 11 (₹5.00, no GST), keeps id 12 (₹5.90, full breakdown).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove duplicate rows sharing a payment_gateway_id, keeping the most complete
--    (total_paise present > gst present > latest payment_date > highest id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY payment_gateway_id
      ORDER BY
        (total_paise IS NOT NULL) DESC,
        (gst_amount_paise IS NOT NULL) DESC,
        payment_date DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM subscription_payments
  WHERE payment_gateway_id IS NOT NULL
    AND TRIM(payment_gateway_id) <> ''
)
DELETE FROM subscription_payments sp
USING ranked r
WHERE sp.id = r.id
  AND r.rn > 1;

-- 2. Enforce one payment per gateway id going forward (the database itself blocks dupes).
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_gateway_id_uq
  ON subscription_payments (payment_gateway_id)
  WHERE payment_gateway_id IS NOT NULL
    AND TRIM(payment_gateway_id) <> '';

COMMENT ON INDEX subscription_payments_gateway_id_uq IS
  'One subscription_payments row per gateway payment id — prevents duplicate payment/history inserts (migration 0425).';
