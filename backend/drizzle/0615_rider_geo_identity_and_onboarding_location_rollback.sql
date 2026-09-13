-- Rollback for 0615_rider_geo_identity_and_onboarding_location.sql
DROP INDEX IF EXISTS public.rider_geo_identity_methods_lookup_idx;
DROP INDEX IF EXISTS public.rider_geo_identity_methods_active_uq;
DROP TABLE IF EXISTS public.rider_geo_identity_methods;

ALTER TABLE public.riders DROP CONSTRAINT IF EXISTS riders_location_source_check;
ALTER TABLE public.riders DROP COLUMN IF EXISTS location_other_district;
ALTER TABLE public.riders DROP COLUMN IF EXISTS location_other_state;
ALTER TABLE public.riders DROP COLUMN IF EXISTS location_source;
ALTER TABLE public.riders DROP COLUMN IF EXISTS district_id;
ALTER TABLE public.riders DROP COLUMN IF EXISTS region_id;
ALTER TABLE public.riders DROP COLUMN IF EXISTS state_id;
ALTER TABLE public.riders DROP COLUMN IF EXISTS region;
ALTER TABLE public.riders DROP COLUMN IF EXISTS district;
