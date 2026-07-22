-- Rollback for 0439_kot_number_and_print_events.sql
DROP TABLE IF EXISTS order_kot_print_events;
DROP FUNCTION IF EXISTS gm_allocate_kot_number(bigint);

ALTER TABLE order_pickup_tokens
  DROP COLUMN IF EXISTS kot_print_count,
  DROP COLUMN IF EXISTS last_kot_printed_at,
  DROP COLUMN IF EXISTS kot_version,
  DROP COLUMN IF EXISTS kot_number;

DROP TABLE IF EXISTS store_kot_counters;
