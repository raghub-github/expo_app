-- Rollback for 0624_dispatch_batch_foundation.
DROP TABLE IF EXISTS public.dispatch_batch_decision_log;
DROP TABLE IF EXISTS public.delivery_batch_orders;
DROP TABLE IF EXISTS public.delivery_batch;
DROP TABLE IF EXISTS public.dispatch_batch_config;
