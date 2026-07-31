-- Rollback 0463: Ride Settlement Engine v1
--
-- Drops the ride settlement + wallet-config objects and reverts orders_ride
-- extensions. Existing production wallet / rider payout tables are NOT touched.

DROP INDEX IF EXISTS orders_ride_settlement_idx;
DROP INDEX IF EXISTS orders_ride_cash_collected_idx;

ALTER TABLE orders_ride
  DROP CONSTRAINT IF EXISTS orders_ride_cash_collected_by_rider_fkey;

ALTER TABLE orders_ride DROP COLUMN IF EXISTS settlement_id;
ALTER TABLE orders_ride DROP COLUMN IF EXISTS cash_collected_by_rider_id;
ALTER TABLE orders_ride DROP COLUMN IF EXISTS cash_collected_at;

DROP TABLE IF EXISTS ride_wallet_config_history;
DROP INDEX IF EXISTS ride_wallet_config_active_uidx;
DROP TABLE IF EXISTS ride_wallet_config;

DROP TABLE IF EXISTS ride_settlement_ledger;
DROP TABLE IF EXISTS ride_settlements;
