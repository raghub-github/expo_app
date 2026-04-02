-- Reconcile dashboard_access_points indexes with current permission model.
-- Ensures service-specific (order_type) permission rows can coexist safely.

ALTER TABLE public.dashboard_access_points
  ADD COLUMN IF NOT EXISTS order_type text;

CREATE INDEX IF NOT EXISTS dashboard_access_points_user_id_idx
  ON public.dashboard_access_points USING btree (system_user_id);

CREATE INDEX IF NOT EXISTS dashboard_access_points_dashboard_type_idx
  ON public.dashboard_access_points USING btree (dashboard_type);

CREATE INDEX IF NOT EXISTS dashboard_access_points_group_idx
  ON public.dashboard_access_points USING btree (access_point_group);

CREATE INDEX IF NOT EXISTS dashboard_access_points_is_active_idx
  ON public.dashboard_access_points USING btree (is_active)
  WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS dashboard_access_points_order_type_idx
  ON public.dashboard_access_points USING btree (order_type)
  WHERE (order_type IS NOT NULL);

CREATE INDEX IF NOT EXISTS dashboard_access_points_service_type_idx
  ON public.dashboard_access_points USING btree (dashboard_type, order_type, access_point_group)
  WHERE ((order_type IS NOT NULL) AND (is_active = true));

-- Remove old uniqueness model that ignored order_type, then apply current one.
DROP INDEX IF EXISTS public.dashboard_access_points_user_dashboard_group_unique;
DROP INDEX IF EXISTS public.dashboard_access_points_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_access_points_unique_idx
  ON public.dashboard_access_points USING btree (
    system_user_id,
    dashboard_type,
    access_point_group,
    order_type
  )
  WHERE (is_active = true);
