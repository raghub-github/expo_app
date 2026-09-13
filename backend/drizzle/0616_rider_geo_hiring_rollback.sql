-- Rollback 0616: rider geo hiring
DROP INDEX IF EXISTS public.rider_geo_hiring_lookup_idx;
DROP INDEX IF EXISTS public.rider_geo_hiring_active_uq;
DROP TABLE IF EXISTS public.rider_geo_hiring;
