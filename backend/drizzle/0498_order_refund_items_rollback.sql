-- Rollback 0498 · order_refund_items
DROP INDEX IF EXISTS public.order_refund_items_item_id_idx;
DROP INDEX IF EXISTS public.order_refund_items_refund_id_idx;
DROP INDEX IF EXISTS public.order_refund_items_order_id_idx;
DROP TABLE IF EXISTS public.order_refund_items;
