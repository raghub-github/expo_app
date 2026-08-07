-- 0512: Allow ticket_titles.service_type = 'all' (topic visible on every service)

DO $$ BEGIN
  ALTER TYPE ticket_service_type ADD VALUE 'all';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE ticket_service_type IS 'Service type: food, parcel, person_ride, other, all (all = every service)';
