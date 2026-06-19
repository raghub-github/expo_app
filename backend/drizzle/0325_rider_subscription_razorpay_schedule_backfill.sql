-- Backfill auto-renew schedule for active subs missing next_deduction_at
-- (common when initial payment was Razorpay and no wallet_ledger subscription_fee row exists).

WITH anchors AS (
  SELECT
    rs.id,
    rs.billing_cycle,
    COALESCE(rs.last_deduction_at, rs.start_date, rs.updated_at, rs.created_at) AS anchor_at
  FROM rider_subscriptions rs
  WHERE rs.status = 'active'
    AND rs.auto_wallet_deduction = TRUE
    AND (
      rs.next_deduction_at IS NULL
      OR rs.last_deduction_at IS NULL
    )
),
computed AS (
  SELECT
    a.id,
    a.anchor_at AS last_at,
    CASE a.billing_cycle::text
      WHEN 'daily' THEN a.anchor_at + INTERVAL '1 day'
      WHEN 'monthly' THEN a.anchor_at + INTERVAL '1 month'
      WHEN 'semi_yearly' THEN a.anchor_at + INTERVAL '6 months'
      WHEN 'yearly' THEN a.anchor_at + INTERVAL '1 year'
      ELSE a.anchor_at + INTERVAL '1 month'
    END AS next_at
  FROM anchors a
)
UPDATE rider_subscriptions rs
SET
  last_deduction_at = c.last_at,
  next_deduction_at = c.next_at,
  end_date = GREATEST(rs.end_date, c.next_at),
  updated_at = NOW()
FROM computed c
WHERE rs.id = c.id;
