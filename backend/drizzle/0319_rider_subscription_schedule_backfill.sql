-- Align subscription renewal/expiry dates with wallet_ledger subscription_fee debits.

WITH last_fee AS (
  SELECT DISTINCT ON (wl.rider_id)
    wl.rider_id,
    wl.created_at AS last_fee_at
  FROM wallet_ledger wl
  WHERE wl.entry_type = 'subscription_fee'
  ORDER BY wl.rider_id, wl.created_at DESC, wl.id DESC
),
computed AS (
  SELECT
    rs.id,
    rs.rider_id,
    lf.last_fee_at,
    CASE rs.billing_cycle::text
      WHEN 'daily' THEN lf.last_fee_at + INTERVAL '1 day'
      WHEN 'monthly' THEN lf.last_fee_at + INTERVAL '1 month'
      WHEN 'semi_yearly' THEN lf.last_fee_at + INTERVAL '6 months'
      WHEN 'yearly' THEN lf.last_fee_at + INTERVAL '1 year'
      ELSE lf.last_fee_at + INTERVAL '1 month'
    END AS next_at
  FROM rider_subscriptions rs
  JOIN last_fee lf ON lf.rider_id = rs.rider_id
  WHERE rs.status = 'active'
    AND COALESCE(rs.auto_wallet_deduction, FALSE) = TRUE
)
UPDATE rider_subscriptions rs
SET
  last_deduction_at = c.last_fee_at,
  next_deduction_at = c.next_at,
  end_date = c.next_at,
  updated_at = NOW()
FROM computed c
WHERE rs.id = c.id;
