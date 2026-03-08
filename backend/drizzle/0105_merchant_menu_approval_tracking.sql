-- Approval tracking: log and set item PENDING when merchant edits.
-- Idempotent.

-- Log every approval status change for items (audit trail)
CREATE TABLE IF NOT EXISTS merchant_menu_item_approval_log (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_by_role TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_approval_log_menu_item_id_idx ON merchant_menu_item_approval_log(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_approval_log_created_at_idx ON merchant_menu_item_approval_log(created_at DESC);

COMMENT ON TABLE merchant_menu_item_approval_log IS 'Audit log for item approval status changes (PENDING/APPROVED/REJECTED).';
