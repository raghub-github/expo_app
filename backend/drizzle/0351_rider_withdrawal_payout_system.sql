-- Rider withdrawal → super-admin payment_payout_approvals (RIDER party type)
-- Safe to run multiple times.

-- Default min payout for riders (₹100) if no active rule exists
INSERT INTO payment_payout_rules (
  rule_code,
  rule_name,
  party_type,
  min_payout_amount,
  max_payout_amount,
  is_active,
  metadata
)
SELECT
  'DEFAULT_RIDER_PAYOUT',
  'Default rider payout policy',
  'RIDER',
  100,
  100000,
  TRUE,
  '{"source":"0351_rider_withdrawal_payout_system"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM payment_payout_rules
  WHERE party_type = 'RIDER' AND is_active = TRUE
);

-- Backfill payment_payout_approvals for existing pending/processing rider withdrawals
INSERT INTO payment_payout_approvals (
  payout_request_id,
  payout_type,
  status,
  amount,
  net_amount,
  metadata
)
SELECT
  wr.id,
  'RIDER',
  CASE wr.status
    WHEN 'pending' THEN 'PENDING'::payout_request_status_type
    WHEN 'processing' THEN 'APPROVED'::payout_request_status_type
    WHEN 'completed' THEN 'COMPLETED'::payout_request_status_type
    WHEN 'failed' THEN 'FAILED'::payout_request_status_type
    WHEN 'cancelled' THEN 'CANCELLED'::payout_request_status_type
    ELSE 'PENDING'::payout_request_status_type
  END,
  wr.amount::numeric,
  wr.amount::numeric,
  jsonb_build_object('rider_id', wr.rider_id, 'backfill', true)
FROM withdrawal_requests wr
WHERE NOT EXISTS (
  SELECT 1 FROM payment_payout_approvals ppa
  WHERE ppa.payout_request_id = wr.id AND ppa.payout_type = 'RIDER'
)
ON CONFLICT (payout_request_id, payout_type) DO NOTHING;

COMMENT ON TABLE withdrawal_requests IS
  'Rider bank withdrawal requests. Wallet debited on create via wallet_ledger (entry_type withdrawal). Super-admin completes with PG transaction ID.';
