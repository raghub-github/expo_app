SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS n FROM public.orders_core
UNION ALL SELECT 'orders_food', COUNT(*)::bigint FROM public.orders_food
UNION ALL SELECT 'orders_ride', COUNT(*)::bigint FROM public.orders_ride
UNION ALL SELECT 'pending_orders', COUNT(*)::bigint FROM public.pending_orders
UNION ALL SELECT 'payment_intents', COUNT(*)::bigint FROM public.payment_intents
UNION ALL SELECT 'payment_transactions', COUNT(*)::bigint FROM public.payment_transactions
UNION ALL SELECT 'order-linked tickets', COUNT(*)::bigint FROM public.unified_tickets WHERE order_id IS NOT NULL;
