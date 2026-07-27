-- Rollback: 0436_order_routed_to_ownership.sql

DROP INDEX IF EXISTS public.order_routed_to_history_actor_email_idx;
DROP INDEX IF EXISTS public.order_routed_to_history_order_created_idx;
DROP TABLE IF EXISTS public.order_routed_to_history;

DROP INDEX IF EXISTS public.orders_core_routed_to_system_user_id_idx;
DROP INDEX IF EXISTS public.orders_core_routed_to_email_idx;

ALTER TABLE public.orders_core
  DROP COLUMN IF EXISTS routed_to_at,
  DROP COLUMN IF EXISTS routed_to_email,
  DROP COLUMN IF EXISTS routed_to_system_user_id;
