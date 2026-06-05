-- ts_ms stores epoch milliseconds; INTEGER overflows (~2.1B). Client sends values like 1780387807293.
ALTER TABLE rider_location_events
  ALTER COLUMN ts_ms TYPE BIGINT USING ts_ms::bigint;
