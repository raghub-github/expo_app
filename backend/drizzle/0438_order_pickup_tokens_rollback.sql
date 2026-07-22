-- Rollback 0435 · drop the pickup-token backbone (generated tokens are lost).
DROP TRIGGER IF EXISTS trg_pickup_token_rider ON orders_food;
DROP TRIGGER IF EXISTS trg_order_pickup_token ON orders_core;
DROP FUNCTION IF EXISTS sync_pickup_token_rider();
DROP FUNCTION IF EXISTS assign_order_pickup_token();
DROP FUNCTION IF EXISTS gm_generate_pickup_token();
DROP TABLE IF EXISTS order_pickup_scan_audit;
DROP TABLE IF EXISTS order_pickup_tokens;
DROP TYPE IF EXISTS order_pickup_token_status;
