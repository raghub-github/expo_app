-- Rollback 0500_no_rider_available_catalog_and_exhaust_flag.sql
-- Does NOT drop platform_rider_dispatch_strategy_config / service_radius (may be in use).

DELETE FROM public.order_cancellation_reason_catalog
WHERE reason_code = 'NO_RIDER_AVAILABLE';

ALTER TABLE public.platform_rider_dispatch_strategy_config
  DROP COLUMN IF EXISTS auto_cancel_on_exhaustion;
