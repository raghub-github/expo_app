-- =============================================================================
-- 0117_merchant_menu_item_change_requests.sql
-- Change-request workflow for merchant menu items (Swiggy/Zomato style).
--
-- Tracks merchant-submitted requests to create/update/delete items which
-- an agent later approves or rejects. Used by both merchant app and dashboard.
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_change_request_type') THEN
    CREATE TYPE merchant_menu_item_change_request_type AS ENUM ('CREATE', 'UPDATE', 'DELETE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_change_request_status') THEN
    CREATE TYPE merchant_menu_item_change_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS merchant_menu_item_change_requests (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  request_type merchant_menu_item_change_request_type NOT NULL,
  status merchant_menu_item_change_request_status NOT NULL DEFAULT 'PENDING',
  requested_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_snapshot JSONB,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_by_role TEXT,
  reviewed_by TEXT,
  reviewed_by_role TEXT,
  reviewed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes to support dashboard queries and per-item lookups.
CREATE INDEX IF NOT EXISTS merchant_menu_item_change_requests_store_id_idx
  ON merchant_menu_item_change_requests(store_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_change_requests_menu_item_id_idx
  ON merchant_menu_item_change_requests(menu_item_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_change_requests_status_idx
  ON merchant_menu_item_change_requests(status);

CREATE INDEX IF NOT EXISTS merchant_menu_item_change_requests_type_status_idx
  ON merchant_menu_item_change_requests(request_type, status);

CREATE INDEX IF NOT EXISTS merchant_menu_item_change_requests_created_at_idx
  ON merchant_menu_item_change_requests(created_at DESC);

COMMENT ON TABLE merchant_menu_item_change_requests IS
  'Merchant-submitted change requests for menu items (CREATE/UPDATE/DELETE) reviewed by agents.';

COMMENT ON COLUMN merchant_menu_item_change_requests.requested_payload IS
  'Proposed item data (partial or full). For CREATE, this is the payload to insert; for UPDATE, the patch; for DELETE, optional context.';

COMMENT ON COLUMN merchant_menu_item_change_requests.current_snapshot IS
  'Snapshot of current item record at time of request (for diff and rollback). NULL for CREATE when item does not yet exist.';

