-- Rollback for 0621_rider_cancellation_auto_block.
DROP TABLE IF EXISTS public.rider_cancellation_service_blocks;
DROP TABLE IF EXISTS public.rider_cancellation_block_config;
