-- Order CS ownership ("Routed To"): denormalized latest actor on orders_core
-- plus append-only history for every agent action that claims the order.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS routed_to_system_user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS routed_to_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS routed_to_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders_core.routed_to_system_user_id IS
  'Latest dashboard system_users.id that performed a CS action on this order.';
COMMENT ON COLUMN public.orders_core.routed_to_email IS
  'Latest agent email shown as Routed To on order details / list.';
COMMENT ON COLUMN public.orders_core.routed_to_at IS
  'When routed_to_* was last stamped.';

CREATE INDEX IF NOT EXISTS orders_core_routed_to_email_idx
  ON public.orders_core (routed_to_email)
  WHERE routed_to_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_core_routed_to_system_user_id_idx
  ON public.orders_core (routed_to_system_user_id)
  WHERE routed_to_system_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_routed_to_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders_core (id) ON DELETE CASCADE,
  system_user_id BIGINT NULL,
  actor_email TEXT NULL,
  actor_name TEXT NULL,
  actor_role TEXT NULL,
  action TEXT NOT NULL,
  action_label TEXT NULL,
  action_ref_table TEXT NULL,
  action_ref_id TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_routed_to_history IS
  'Append-only log of agents who performed CS actions (remark, refund, cancel, status, rider cancel, recon, cx notification).';
COMMENT ON COLUMN public.order_routed_to_history.action IS
  'remark | refund | cancel | status_update | rider_cancel | rider_recon | cx_notification';

CREATE INDEX IF NOT EXISTS order_routed_to_history_order_created_idx
  ON public.order_routed_to_history (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_routed_to_history_actor_email_idx
  ON public.order_routed_to_history (actor_email)
  WHERE actor_email IS NOT NULL;

-- Backfill latest Routed To from the most recent order_remarks row per order.
WITH latest_remark AS (
  SELECT DISTINCT ON (orx.order_id)
    orx.order_id,
    orx.actor_id,
    COALESCE(
      NULLIF(BTRIM(orx.remark_metadata ->> 'actorEmail'), ''),
      su.email
    ) AS actor_email,
    orx.created_at
  FROM public.order_remarks orx
  LEFT JOIN public.system_users su ON su.id = orx.actor_id
  ORDER BY orx.order_id, orx.created_at DESC
)
UPDATE public.orders_core oc
SET
  routed_to_system_user_id = lr.actor_id,
  routed_to_email = lr.actor_email,
  routed_to_at = lr.created_at
FROM latest_remark lr
WHERE oc.id = lr.order_id
  AND oc.routed_to_email IS NULL
  AND lr.actor_email IS NOT NULL;

-- Seed history from existing remarks so the side sheet has prior ownership context.
INSERT INTO public.order_routed_to_history (
  order_id,
  system_user_id,
  actor_email,
  actor_name,
  actor_role,
  action,
  action_label,
  action_ref_table,
  action_ref_id,
  metadata,
  created_at
)
SELECT
  orx.order_id,
  orx.actor_id,
  COALESCE(
    NULLIF(BTRIM(orx.remark_metadata ->> 'actorEmail'), ''),
    su.email
  ),
  COALESCE(orx.actor_name, su.full_name),
  COALESCE(orx.actor_type, su.primary_role::text),
  'remark',
  'Added remark',
  'order_remarks',
  orx.id::text,
  jsonb_build_object(
    'remarkCategory', orx.remark_category,
    'backfilled', true
  ),
  orx.created_at
FROM public.order_remarks orx
LEFT JOIN public.system_users su ON su.id = orx.actor_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.order_routed_to_history h
  WHERE h.order_id = orx.order_id
    AND h.action_ref_table = 'order_remarks'
    AND h.action_ref_id = orx.id::text
)
AND COALESCE(
  NULLIF(BTRIM(orx.remark_metadata ->> 'actorEmail'), ''),
  su.email
) IS NOT NULL;
