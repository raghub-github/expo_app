-- Make rider_penalties.service_type optional so agents can record "for which service"
-- without mandating it. Wallet allocation for unspecified penalties uses parcel.
-- Optional service is also used for wallet credit requests (already nullable).

-- rider_penalties: allow NULL service_type
ALTER TABLE rider_penalties
  ALTER COLUMN service_type DROP NOT NULL;

COMMENT ON COLUMN rider_penalties.service_type IS 'Service for which penalty applies: food, parcel, person_ride. NULL = unspecified (wallet allocation uses parcel).';
