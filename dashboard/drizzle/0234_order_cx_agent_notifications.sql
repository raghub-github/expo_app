-- Dashboard agent-sent customer notifications (order detail sidebar history).

CREATE TABLE IF NOT EXISTS order_cx_agent_notifications (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sent_by_email TEXT,
  sent_by_name TEXT,
  sent_by_role TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS order_cx_agent_notifications_order_id_idx
  ON order_cx_agent_notifications(order_id);

CREATE INDEX IF NOT EXISTS order_cx_agent_notifications_order_sent_at_idx
  ON order_cx_agent_notifications(order_id, sent_at DESC);

COMMENT ON TABLE order_cx_agent_notifications IS
  'Manual CX notifications sent from dashboard order page by agents.';
