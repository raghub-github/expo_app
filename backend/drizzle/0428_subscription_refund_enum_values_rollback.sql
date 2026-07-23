-- Rollback 0428 · Postgres cannot DROP a value from an enum. No-op.
-- The added values ('REFUND_PENDING', 'REFUNDED') are additive and harmless if
-- left in place. To truly remove them you must recreate the enum type and
-- rewrite every dependent column — do that from a backup, not here.
SELECT 1;
