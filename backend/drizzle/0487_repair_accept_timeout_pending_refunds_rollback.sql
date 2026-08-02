-- Rollback 0487 — data repair only; cannot safely reverse wallet credits.
-- This file is intentionally a no-op marker so deploy tooling has a pair.
-- Manual reverse (if ever needed): reverse specific customer_wallet_transactions
-- with metadata.repair_migration = '0487' after ops review — do not auto-debit.
SELECT 1;
