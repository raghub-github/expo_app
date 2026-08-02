-- Rollback 0474: rider auto-cancel (engine channel) per-service config
DROP INDEX IF EXISTS public.gm_rider_auto_cancel_config_service_phase_uidx;
DROP TABLE IF EXISTS public.gm_rider_auto_cancel_config;
