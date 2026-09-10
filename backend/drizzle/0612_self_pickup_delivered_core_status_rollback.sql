-- Rollback 0612: only reverts rows that look like self-pickup delivered by the forward migration
-- is unsafe to guess; leave as no-op. Prefer restoring from backup if needed.
SELECT 1;
