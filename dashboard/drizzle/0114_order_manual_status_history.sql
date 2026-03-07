-- ============================================================================
-- Order manual status update tracking (dashboard: who updated status, history).
-- ============================================================================

ALTER TABLE orders_core
  ADD COLUMN IF NOT EXISTS manual_status_updated_by_email TEXT;

COMMENT ON COLUMN orders_core.manual_status_updated_by_email IS
  'Email of the last dashboard user who manually updated order status (Dispatch Ready / Dispatched / Delivered).';

CREATE TABLE IF NOT EXISTS order_manual_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  to_status TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_manual_status_history IS
  'History of manual order status updates from dashboard (Dispatch Ready, Dispatched, Delivered) with actor email.';

CREATE INDEX IF NOT EXISTS order_manual_status_history_order_id_idx ON order_manual_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_manual_status_history_created_at_idx ON order_manual_status_history(created_at);
