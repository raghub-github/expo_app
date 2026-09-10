-- Rollback 0614 abandoned cart push template + queue.
DELETE FROM public.notification_settings WHERE key = 'abandoned_cart_delay_min';
DELETE FROM public.notification_templates WHERE code = 'CUSTOMER_ABANDONED_CART';
DROP TABLE IF EXISTS public.customer_abandoned_cart_reminders;
