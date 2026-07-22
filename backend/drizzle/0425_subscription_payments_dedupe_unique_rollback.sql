-- Rollback 0425 · drop the per-gateway-id uniqueness guard.
-- NOTE: the duplicate rows deleted by the forward migration cannot be restored
-- (they were invalid duplicates of a single payment). This only removes the index.
DROP INDEX IF EXISTS subscription_payments_gateway_id_uq;
