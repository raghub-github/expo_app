-- Rollback 0602. Does not drop customer_saved_locations (owned by 0013).

DROP INDEX IF EXISTS public.customer_saved_journeys_coord_uidx;
DROP TABLE IF EXISTS public.customer_saved_journeys;

DROP INDEX IF EXISTS public.customer_saved_locations_customer_coord_uidx;
ALTER TABLE public.customer_saved_locations DROP COLUMN IF EXISTS lat_key;
ALTER TABLE public.customer_saved_locations DROP COLUMN IF EXISTS lng_key;
