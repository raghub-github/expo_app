-- Verify store 77 / GMMC1025 data BEFORE or AFTER purge.
-- Run alone in Supabase (no BEGIN/ROLLBACK).

SELECT ms.id, ms.store_id, ms.store_name
FROM public.merchant_stores ms
WHERE ms.store_id = 'GMMC1025';

SELECT 'orders_core' AS label, COUNT(*)::bigint AS cnt
FROM public.orders_core c WHERE c.merchant_store_id = 77
UNION ALL SELECT 'orders_food', COUNT(*)::bigint
FROM public.orders_food f WHERE f.merchant_store_id = 77
UNION ALL SELECT 'pending_orders', COUNT(*)::bigint
FROM public.pending_orders po WHERE po.merchant_store_id = 77
UNION ALL SELECT 'merchant_store_ratings', COUNT(*)::bigint
FROM public.merchant_store_ratings msr WHERE msr.store_id = 77
UNION ALL SELECT 'restaurant_reports', COUNT(*)::bigint
FROM public.restaurant_reports rr WHERE rr.store_id = 77
UNION ALL SELECT 'unified_tickets (store)', COUNT(*)::bigint
FROM public.unified_tickets ut WHERE ut.merchant_store_id = 77
UNION ALL SELECT 'unified_tickets (order)', COUNT(*)::bigint
FROM public.unified_tickets ut
WHERE ut.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
UNION ALL SELECT 'customer_ratings_given', COUNT(*)::bigint
FROM public.customer_ratings_given crg
WHERE crg.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
   OR (crg.target_type ILIKE '%merchant%' AND crg.target_id = 77)
UNION ALL SELECT 'merchant_wallet_ledger', COUNT(*)::bigint
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77);

SELECT c.id, c.formatted_order_id, c.status, c.current_status, c.created_at
FROM public.orders_core c
WHERE c.merchant_store_id = 77
ORDER BY c.created_at DESC
LIMIT 10;
