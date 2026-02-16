-- ============================================================================
-- Individual Ticket View — Schema extensions
-- ============================================================================
-- Adds: group_id, requester, merge/spam/reopen on tickets;
--       ticket_field_values, ticket_attachments (if not exists);
--       seed for ticket_custom_fields (uses field_code to match backend 0061).
-- Does NOT create ticket_custom_fields — use backend 0061 or existing schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend tickets table
-- ----------------------------------------------------------------------------

-- Per-ticket group (assignment group / team)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN group_id INTEGER REFERENCES ticket_groups(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS tickets_group_id_idx ON tickets(group_id);
  END IF;
END $$;

-- Requester (polymorphic: who raised the ticket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'requester_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN requester_id BIGINT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'requester_type'
  ) THEN
    ALTER TABLE tickets ADD COLUMN requester_type TEXT;
  END IF;
END $$;

-- Merge tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'is_merged'
  ) THEN
    ALTER TABLE tickets ADD COLUMN is_merged BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'merged_into_ticket_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN merged_into_ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Spam / Reopen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'spam_at'
  ) THEN
    ALTER TABLE tickets ADD COLUMN spam_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'reopened_at'
  ) THEN
    ALTER TABLE tickets ADD COLUMN reopened_at TIMESTAMPTZ;
  END IF;
END $$;

-- Source channel (email, app, api)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'source_channel'
  ) THEN
    ALTER TABLE tickets ADD COLUMN source_channel TEXT;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ticket_field_values (per-ticket values for custom fields)
-- Only create if ticket_custom_fields exists (e.g. from backend 0061).
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_custom_fields'
  ) THEN
    CREATE TABLE IF NOT EXISTS ticket_field_values (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      field_id BIGINT NOT NULL REFERENCES ticket_custom_fields(id) ON DELETE CASCADE,
      value JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(ticket_id, field_id)
    );
    CREATE INDEX IF NOT EXISTS ticket_field_values_ticket_id_idx ON ticket_field_values(ticket_id);
    CREATE INDEX IF NOT EXISTS ticket_field_values_field_id_idx ON ticket_field_values(field_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ticket_attachments (file metadata for R2)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES ticket_messages(id) ON DELETE SET NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by_user_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_id_idx ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_attachments_message_id_idx ON ticket_attachments(message_id);

-- ----------------------------------------------------------------------------
-- 4. Index for ticket_actions_audit (only if table exists)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_actions_audit'
  ) THEN
    CREATE INDEX IF NOT EXISTS ticket_actions_audit_ticket_created_desc_idx
      ON ticket_actions_audit(ticket_id, created_at DESC);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Seed common custom fields (only if ticket_custom_fields has field_code)
-- Matches backend 0061 schema. Safe to run multiple times.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_custom_fields' AND column_name = 'field_code'
  ) THEN
    INSERT INTO ticket_custom_fields (field_code, field_name, field_type, display_order)
    VALUES
      ('order_id', 'Order ID', 'text', 10),
      ('transaction_id', 'Transaction ID', 'text', 20),
      ('rider_id', 'Rider ID', 'text', 30),
      ('merchant_id', 'Merchant ID', 'text', 40),
      ('customer_id', 'Customer ID', 'text', 50)
    ON CONFLICT (field_code) DO NOTHING;
  END IF;
END $$;
