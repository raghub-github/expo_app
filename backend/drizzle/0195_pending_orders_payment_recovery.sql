ALTER TABLE pending_orders
  ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS payment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirm_by timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_failure_code text,
  ADD COLUMN IF NOT EXISTS payment_failure_message text,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_reference text,
  ADD COLUMN IF NOT EXISTS refund_initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_gateway_payload jsonb;

CREATE INDEX IF NOT EXISTS pending_orders_payment_state_idx
  ON pending_orders(payment_state, created_at DESC);

CREATE INDEX IF NOT EXISTS pending_orders_payment_confirm_by_idx
  ON pending_orders(payment_confirm_by)
  WHERE finalized_order_id IS NULL;

CREATE INDEX IF NOT EXISTS pending_orders_razorpay_payment_id_idx
  ON pending_orders(razorpay_payment_id);
