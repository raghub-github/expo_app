-- =========================
-- ORDERS (MASTER TABLE)
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'orders') THEN
    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      order_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
      order_category TEXT,
      order_type TEXT,
      veg_non_veg TEXT,
      order_source TEXT,
      buyer_app_name TEXT,
      merchant_id BIGINT,
      merchant_parent_id BIGINT,
      merchant_name TEXT,
      merchant_address TEXT,
      merchant_lat NUMERIC(10,6),
      merchant_lng NUMERIC(10,6),
      customer_id BIGINT,
      customer_name TEXT,
      customer_mobile TEXT,
      customer_email TEXT,
      delivery_address_auto TEXT,
      delivery_address_manual TEXT,
      delivery_lat NUMERIC(10,6),
      delivery_lng NUMERIC(10,6),
      alternate_mobiles TEXT[],
      device_type TEXT,
      device_os TEXT,
      device_app_version TEXT,
      device_ip TEXT,
      is_self_order BOOLEAN,
      order_for_name TEXT,
      order_for_mobile TEXT,
      contact_less_delivery BOOLEAN,
      special_delivery_notes TEXT,
      total_item_value NUMERIC(12,2),
      total_tax NUMERIC(12,2),
      total_discount NUMERIC(12,2),
      total_delivery_fee NUMERIC(12,2),
      total_ctm NUMERIC(12,2),
      total_payable NUMERIC(12,2),
      has_tip BOOLEAN,
      tip_amount NUMERIC(10,2),
      is_bulk_order BOOLEAN,
      bulk_reason TEXT,
      delivery_type TEXT,
      delivery_initiator TEXT,
      locality_type TEXT,
      delivered_by TEXT,
      default_system_kpt_minutes INTEGER,
      merchant_updated_kpt_minutes INTEGER,
      first_eta TIMESTAMP,
      promised_eta TIMESTAMP,
      current_status TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(order_uuid)
    );
  END IF;
  EXECUTE 'ALTER TABLE orders ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER ITEMS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_items') THEN
    CREATE TABLE order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
      item_id BIGINT,
      merchant_menu_id BIGINT,
      item_name TEXT,
      item_title TEXT,
      item_description TEXT,
      item_image_url TEXT,
      unit_price NUMERIC(10,2),
      quantity INTEGER,
      tax_percentage NUMERIC(5,2),
      tax_amount NUMERIC(10,2),
      customization_id BIGINT,
      addon_id BIGINT
    );
  END IF;
  EXECUTE 'ALTER TABLE order_items ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER CUSTOMIZATIONS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_customizations') THEN
    CREATE TABLE order_customizations (
      id BIGSERIAL PRIMARY KEY,
      order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
      title TEXT,
      required BOOLEAN,
      max_selection INTEGER,
      created_at TIMESTAMP DEFAULT now()
    );
  END IF;
  EXECUTE 'ALTER TABLE order_customizations ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER ADDONS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_addons') THEN
    CREATE TABLE order_addons (
      id BIGSERIAL PRIMARY KEY,
      customization_id BIGINT REFERENCES order_customizations(id) ON DELETE CASCADE,
      addon_item_id BIGINT,
      addon_name TEXT,
      addon_price NUMERIC(10,2),
      created_at TIMESTAMP DEFAULT now()
    );
  END IF;
  EXECUTE 'ALTER TABLE order_addons ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER STATUS HISTORY
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_status_history') THEN
    CREATE TABLE order_status_history (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT,
      changed_by_app TEXT,
      changed_by_user_id TEXT,
      changed_by_role TEXT,
      changed_by_name TEXT,
      changed_at TIMESTAMP DEFAULT now()
    );
  END IF;
  EXECUTE 'ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER PAYMENTS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_payments') THEN
    CREATE TABLE order_payments (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
      payment_method TEXT,
      payment_status TEXT,
      transaction_id TEXT,
      paid_at TIMESTAMP,
      refund_status TEXT,
      refund_amount NUMERIC(12,2),
      refund_reason TEXT
    );
  END IF;
  EXECUTE 'ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- ORDER DELIVERY
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_delivery') THEN
    CREATE TABLE order_delivery (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
      assigned_rider_id BIGINT,
      assigned_rider_name TEXT,
      assigned_rider_mobile TEXT,
      delivery_otp TEXT,
      delivery_proof_image TEXT,
      delivery_status TEXT,
      picked_up_at TIMESTAMP,
      delivered_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      cancel_reason TEXT
    );
  END IF;
  EXECUTE 'ALTER TABLE order_delivery ENABLE ROW LEVEL SECURITY';
END$$;

-- =========================
-- AUDIT LOGS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_logs') THEN
    CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      entity_type TEXT,
      entity_id TEXT,
      action TEXT,
      old_data JSONB,
      new_data JSONB,
      performed_by TEXT,
      performed_by_email TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  END IF;
  EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
END$$;