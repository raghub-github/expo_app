-- Rollback for 0611_merchant_ranking_metrics.sql — additive table, safe to drop.
BEGIN;
DROP TABLE IF EXISTS merchant_ranking_metrics;
COMMIT;
