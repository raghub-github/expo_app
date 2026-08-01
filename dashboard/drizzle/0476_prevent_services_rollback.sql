-- Rollback 0476_prevent_services.sql

DROP FUNCTION IF EXISTS public.prevent_services_check_point(DOUBLE PRECISION, DOUBLE PRECISION, TEXT);
DROP FUNCTION IF EXISTS public.prevent_services_expire_due();

DROP TABLE IF EXISTS public.prevent_service_logs;
DROP TABLE IF EXISTS public.prevent_service_services;
DROP TABLE IF EXISTS public.prevent_service_rules;
DROP TABLE IF EXISTS public.prevent_service_locations;
