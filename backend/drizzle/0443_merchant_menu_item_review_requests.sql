-- =============================================================================
-- 0443_merchant_menu_item_review_requests.sql
-- Field-level merchant menu ADD/EDIT/DELETE review workflow.
-- Mirrors dashboard/drizzle/0438_merchant_menu_item_review_requests.sql
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_review_request_type') THEN
    CREATE TYPE merchant_menu_item_review_request_type AS ENUM ('ADD', 'EDIT', 'DELETE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_review_request_status') THEN
    CREATE TYPE merchant_menu_item_review_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_review_source') THEN
    CREATE TYPE merchant_menu_item_review_source AS ENUM ('MERCHANT_APP', 'PARTNER_SITE', 'DASHBOARD', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_review_action') THEN
    CREATE TYPE merchant_menu_item_review_action AS ENUM ('APPROVE', 'REJECT', 'SUBMIT', 'CANCEL');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS merchant_menu_item_review_requests (
  id BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT REFERENCES merchant_parents(id) ON DELETE SET NULL,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE SET NULL,
  request_type merchant_menu_item_review_request_type NOT NULL,
  status merchant_menu_item_review_request_status NOT NULL DEFAULT 'PENDING',
  submitted_by TEXT NOT NULL,
  submitted_by_role TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_by_role TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  source merchant_menu_item_review_source NOT NULL DEFAULT 'OTHER',
  client_ip TEXT,
  device_info TEXT,
  add_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_menu_item_review_requests_add_payload_chk
    CHECK (
      (request_type = 'ADD' AND add_payload IS NOT NULL)
      OR (request_type <> 'ADD')
    ),
  CONSTRAINT merchant_menu_item_review_requests_edit_item_chk
    CHECK (
      (request_type IN ('EDIT', 'DELETE') AND menu_item_id IS NOT NULL)
      OR (request_type = 'ADD')
    )
);

COMMENT ON TABLE merchant_menu_item_review_requests IS
  'Pending merchant menu ADD/EDIT/DELETE requests reviewed by agents. Live menu is untouched until approve.';

CREATE TABLE IF NOT EXISTS merchant_menu_item_review_changes (
  id BIGSERIAL PRIMARY KEY,
  review_request_id BIGINT NOT NULL
    REFERENCES merchant_menu_item_review_requests(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_menu_item_review_changes IS
  'Only fields that actually changed for an EDIT review request (old vs new).';

CREATE TABLE IF NOT EXISTS merchant_menu_item_review_rejection_history (
  id BIGSERIAL PRIMARY KEY,
  original_request_id BIGINT,
  merchant_id BIGINT,
  store_id BIGINT NOT NULL,
  menu_item_id BIGINT,
  request_type merchant_menu_item_review_request_type NOT NULL,
  submitted_by TEXT,
  submitted_by_role TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_by_role TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rejection_reason TEXT,
  source merchant_menu_item_review_source,
  client_ip TEXT,
  device_info TEXT,
  add_payload JSONB,
  changes_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_menu_item_review_rejection_history IS
  'Archive of rejected menu review requests after pending rows are deleted.';

CREATE TABLE IF NOT EXISTS merchant_menu_item_review_action_log (
  id BIGSERIAL PRIMARY KEY,
  review_request_id BIGINT,
  action merchant_menu_item_review_action NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT,
  source merchant_menu_item_review_source,
  client_ip TEXT,
  device_info TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_menu_item_review_action_log IS
  'Audit log for menu review submit/approve/reject actions.';

CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_item_review_requests_pending_edit_delete_uidx
  ON merchant_menu_item_review_requests (menu_item_id, request_type)
  WHERE status = 'PENDING' AND request_type IN ('EDIT', 'DELETE') AND menu_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_requests_status_submitted_idx
  ON merchant_menu_item_review_requests (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_requests_store_status_idx
  ON merchant_menu_item_review_requests (store_id, status);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_requests_menu_item_id_idx
  ON merchant_menu_item_review_requests (menu_item_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_requests_type_status_idx
  ON merchant_menu_item_review_requests (request_type, status);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_requests_merchant_id_idx
  ON merchant_menu_item_review_requests (merchant_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_changes_request_id_idx
  ON merchant_menu_item_review_changes (review_request_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_rejection_history_store_idx
  ON merchant_menu_item_review_rejection_history (store_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_action_log_request_idx
  ON merchant_menu_item_review_action_log (review_request_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_review_action_log_created_idx
  ON merchant_menu_item_review_action_log (created_at DESC);
