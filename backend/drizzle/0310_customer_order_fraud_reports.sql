-- Order-linked fraud reports from customer help hub (restaurant / delivery partner).

CREATE TABLE IF NOT EXISTS customer_order_fraud_report_options (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('merchant', 'rider')),
  option_code TEXT NOT NULL,
  option_text TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  requires_details BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, option_code)
);

INSERT INTO customer_order_fraud_report_options (target_type, option_code, option_text, display_order, requires_details)
VALUES
  ('merchant', 'dine_in_lower_prices', 'Item prices are lower on their dine-in menu', 1, FALSE),
  ('merchant', 'cancel_off_platform_payment', 'They asked me to cancel the order and pay directly to them', 2, FALSE),
  ('merchant', 'smaller_serving_size', 'Item serving size in this order is lesser compared to what they give in dine-in', 3, FALSE),
  ('merchant', 'other', 'My concern is not listed here', 4, TRUE),
  ('rider', 'cancel_pay_cash', 'They asked me to cancel the order and pay cash', 1, FALSE),
  ('rider', 'refusing_delivery', 'They are refusing to deliver the order', 2, FALSE),
  ('rider', 'change_address', 'They asked me to change my address', 3, FALSE),
  ('rider', 'other', 'My concern is not listed here', 4, TRUE)
ON CONFLICT (target_type, option_code) DO UPDATE SET
  option_text = EXCLUDED.option_text,
  display_order = EXCLUDED.display_order,
  requires_details = EXCLUDED.requires_details,
  is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS customer_order_fraud_reports (
  id BIGSERIAL PRIMARY KEY,
  order_core_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('merchant', 'rider')),
  selected_option_codes TEXT[] NOT NULL,
  custom_details TEXT,
  unified_ticket_id BIGINT REFERENCES unified_tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_order_fraud_reports_order_idx
  ON customer_order_fraud_reports (order_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_order_fraud_reports_customer_idx
  ON customer_order_fraud_reports (customer_id, created_at DESC);

COMMENT ON TABLE customer_order_fraud_report_options IS 'Selectable fraud reasons shown in customer app help bottom sheet.';
COMMENT ON TABLE customer_order_fraud_reports IS 'Structured fraud submissions linked to orders and support tickets.';
