DROP TRIGGER IF EXISTS trg_orders_core_purge_offer_records ON public.orders_core;
DROP FUNCTION IF EXISTS public.purge_offer_records_for_deleted_core_order();
