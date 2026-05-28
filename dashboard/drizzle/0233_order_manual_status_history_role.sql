-- Store dashboard agent role on manual status updates (parity with order remarks actor_type).

ALTER TABLE order_manual_status_history
  ADD COLUMN IF NOT EXISTS updated_by_role TEXT;

COMMENT ON COLUMN order_manual_status_history.updated_by_role IS
  'system_users.primary_role at time of update (e.g. SUPER_ADMIN, AGENT).';
