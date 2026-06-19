-- Rider ↔ customer in-app chat during live orders (not support tickets).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_partner_chat_sender') THEN
    CREATE TYPE order_partner_chat_sender AS ENUM ('CUSTOMER', 'RIDER', 'SYSTEM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_partner_chat_messages (
  id bigserial PRIMARY KEY,
  order_core_id bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  order_public_id text NOT NULL,
  sender_type order_partner_chat_sender NOT NULL,
  sender_customer_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  sender_rider_id integer REFERENCES riders(id) ON DELETE SET NULL,
  body text NOT NULL,
  read_by_customer_at timestamptz,
  read_by_rider_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_partner_chat_body_len CHECK (
    char_length(trim(body)) >= 1 AND char_length(body) <= 500
  )
);

CREATE INDEX IF NOT EXISTS order_partner_chat_messages_core_created_idx
  ON order_partner_chat_messages (order_core_id, created_at);

CREATE INDEX IF NOT EXISTS order_partner_chat_messages_public_created_idx
  ON order_partner_chat_messages (order_public_id, created_at);

CREATE INDEX IF NOT EXISTS order_partner_chat_messages_rider_unread_idx
  ON order_partner_chat_messages (order_core_id, created_at)
  WHERE sender_type = 'CUSTOMER' AND read_by_rider_at IS NULL;

CREATE INDEX IF NOT EXISTS order_partner_chat_messages_customer_unread_idx
  ON order_partner_chat_messages (order_core_id, created_at)
  WHERE sender_type = 'RIDER' AND read_by_customer_at IS NULL;

COMMENT ON TABLE order_partner_chat_messages IS
  'Peer chat between assigned rider and customer for a live order. Distinct from unified support tickets.';
