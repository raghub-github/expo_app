-- Ride customer payment snapshots — full audit trail per ride order
-- Tracks what was charged at booking, payment quote, and confirmed payment.

CREATE TABLE IF NOT EXISTS ride_customer_payment_snapshots (
  id bigserial PRIMARY KEY,
  order_core_id bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  customer_id bigint REFERENCES customers(id) ON DELETE SET NULL,

  snapshot_phase text NOT NULL CHECK (
    snapshot_phase IN ('booking', 'payment_quote', 'payment_confirmed')
  ),

  ride_type text,
  pickup_address text,
  drop_address text,
  distance_km numeric(10, 2),

  ride_fare numeric(14, 2) NOT NULL DEFAULT 0,
  addon_total numeric(14, 2) NOT NULL DEFAULT 0,
  platform_fee numeric(14, 2) NOT NULL DEFAULT 0,
  convenience_fee numeric(14, 2) NOT NULL DEFAULT 0,
  delivery_fee numeric(14, 2) NOT NULL DEFAULT 0,
  packaging_fee numeric(14, 2) NOT NULL DEFAULT 0,
  surge_fee numeric(14, 2) NOT NULL DEFAULT 0,
  small_order_fee numeric(14, 2) NOT NULL DEFAULT 0,
  misc_fee numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  tip_amount numeric(14, 2) NOT NULL DEFAULT 0,
  donation_amount numeric(14, 2) NOT NULL DEFAULT 0,
  waiting_charge numeric(14, 2) NOT NULL DEFAULT 0,
  toll_charge numeric(14, 2) NOT NULL DEFAULT 0,
  discount_total numeric(14, 2) NOT NULL DEFAULT 0,
  payable_total numeric(14, 2) NOT NULL DEFAULT 0,

  gati_cash_applied numeric(14, 2) NOT NULL DEFAULT 0,
  razorpay_amount numeric(14, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(14, 2),

  coupon_code text,
  platform_offer_id bigint,
  merchant_offer_id bigint,

  payment_method text,
  razorpay_order_id text,
  razorpay_payment_id text,

  billing_ruleset_version integer,
  billing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  charges jsonb NOT NULL DEFAULT '[]'::jsonb,
  discounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  taxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  breakdown_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  gst_components jsonb NOT NULL DEFAULT '{}'::jsonb,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_customer_payment_snapshots_order_core_idx
  ON ride_customer_payment_snapshots(order_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_customer_payment_snapshots_order_id_idx
  ON ride_customer_payment_snapshots(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_customer_payment_snapshots_customer_idx
  ON ride_customer_payment_snapshots(customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ride_customer_payment_snapshots_phase_idx
  ON ride_customer_payment_snapshots(order_core_id, snapshot_phase, created_at DESC);

COMMENT ON TABLE ride_customer_payment_snapshots IS
  'Immutable ride fare billing snapshots: booking estimate, pre-payment quote (with offers), and confirmed payment.';
