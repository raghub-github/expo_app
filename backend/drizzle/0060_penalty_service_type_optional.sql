-- Make rider_penalties.service_type optional (align with dashboard 0088).
ALTER TABLE rider_penalties
  ALTER COLUMN service_type DROP NOT NULL;
