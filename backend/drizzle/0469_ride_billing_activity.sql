-- 0469: Ride billing activity audit trail (append-only).

CREATE TABLE IF NOT EXISTS ride_billing_activity (
  id                bigserial PRIMARY KEY,
  order_core_id     bigint REFERENCES orders_core(id) ON DELETE SET NULL,
  rider_id          integer,
  customer_id       bigint,
  event_type        text NOT NULL,
  amount            numeric(14, 2),
  currency          text NOT NULL DEFAULT 'INR',
  summary           text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type        text,
  actor_id          text,
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_billing_activity_order_idx
  ON ride_billing_activity (order_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_billing_activity_type_idx
  ON ride_billing_activity (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_billing_activity_rider_idx
  ON ride_billing_activity (rider_id, created_at DESC)
  WHERE rider_id IS NOT NULL;

COMMENT ON TABLE ride_billing_activity IS
  'Append-only audit log for ride billing events (estimate, waiting, surge, toll, settlement, wallet, cancel).';
