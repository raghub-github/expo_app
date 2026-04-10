-- One-shot fix for dashboard_access_points:
-- 1) Ensure column/index model is correct
-- 2) Backfill canonical allowed_actions for all known groups
-- 3) Enforce non-empty allowed_actions on every INSERT/UPDATE via trigger

-- =========================
-- 1) Schema/index alignment
-- =========================
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

-- ==========================================
-- 2) Canonical actions resolver + enforcement
-- ==========================================
CREATE OR REPLACE FUNCTION public.resolve_dashboard_access_point_actions(
  p_access_point_group text,
  p_allowed_actions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_group text := upper(trim(coalesce(p_access_point_group, '')));
  v_actions jsonb := p_allowed_actions;
BEGIN
  IF v_actions IS NOT NULL
     AND jsonb_typeof(v_actions) = 'array'
     AND jsonb_array_length(v_actions) > 0 THEN
    RETURN v_actions;
  END IF;

  CASE v_group
    WHEN 'RIDER_VIEW' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'RIDER_ACTIONS_FOOD' THEN RETURN '["UPDATE","CANCEL","BLOCK","UNBLOCK"]'::jsonb;
    WHEN 'RIDER_ACTIONS_PARCEL' THEN RETURN '["UPDATE","CANCEL","BLOCK","UNBLOCK"]'::jsonb;
    WHEN 'RIDER_ACTIONS_PERSON_RIDE' THEN RETURN '["UPDATE","CANCEL","BLOCK","UNBLOCK"]'::jsonb;
    WHEN 'RIDER_WALLET_CREDITS' THEN RETURN '["CREATE","VIEW","APPROVE","REJECT"]'::jsonb;

    WHEN 'MERCHANT_VIEW' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'MERCHANT_ONBOARDING' THEN RETURN '["UPDATE","APPROVE","REJECT"]'::jsonb;
    WHEN 'MERCHANT_OPERATIONS' THEN RETURN '["UPDATE"]'::jsonb;
    WHEN 'MERCHANT_STORE_MANAGEMENT' THEN RETURN '["CREATE","UPDATE","DELETE"]'::jsonb;
    WHEN 'MERCHANT_WALLET' THEN RETURN '["UPDATE"]'::jsonb;
    WHEN 'MERCHANT_ADMIN_MERCHANT_ACCESS' THEN RETURN '["ADMIN_MERCHANT_PANEL"]'::jsonb;

    WHEN 'CUSTOMER_VIEW' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'CUSTOMER_ACTIONS_FOOD' THEN RETURN '["BLOCK","UNBLOCK","UPDATE"]'::jsonb;
    WHEN 'CUSTOMER_ACTIONS_PARCEL' THEN RETURN '["BLOCK","UNBLOCK","UPDATE"]'::jsonb;
    WHEN 'CUSTOMER_ACTIONS_PERSON_RIDE' THEN RETURN '["BLOCK","UNBLOCK","UPDATE"]'::jsonb;

    WHEN 'ORDER_VIEW' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'ORDER_ASSIGN' THEN RETURN '["ASSIGN","UPDATE"]'::jsonb;
    WHEN 'ORDER_CANCEL' THEN RETURN '["CANCEL","UPDATE"]'::jsonb;
    WHEN 'ORDER_REFUND' THEN RETURN '["REFUND","UPDATE"]'::jsonb;

    WHEN 'TICKET_VIEW_FOOD' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'TICKET_VIEW_PARCEL' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'TICKET_VIEW_PERSON_RIDE' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'TICKET_ACTIONS_FOOD' THEN RETURN '["ASSIGN","UPDATE","APPROVE","REJECT"]'::jsonb;
    WHEN 'TICKET_ACTIONS_PARCEL' THEN RETURN '["ASSIGN","UPDATE","APPROVE","REJECT"]'::jsonb;
    WHEN 'TICKET_ACTIONS_PERSON_RIDE' THEN RETURN '["ASSIGN","UPDATE","APPROVE","REJECT"]'::jsonb;
    WHEN 'TICKET_AGENT_STATUS_TOGGLE' THEN RETURN '["UPDATE"]'::jsonb;
    WHEN 'TICKET_QUEUE_SUPERVISOR' THEN RETURN '["VIEW"]'::jsonb;
    WHEN 'TICKET_QUEUE_MANAGER' THEN RETURN '["VIEW"]'::jsonb;

    WHEN 'OFFER_RIDER' THEN RETURN '["CREATE","UPDATE","DELETE"]'::jsonb;
    WHEN 'OFFER_CUSTOMER' THEN RETURN '["CREATE","UPDATE","DELETE"]'::jsonb;
    WHEN 'OFFER_MERCHANT' THEN RETURN '["CREATE","UPDATE","DELETE"]'::jsonb;

    WHEN 'AREA_MANAGER_MERCHANT' THEN RETURN '["CREATE","UPDATE","APPROVE","VIEW"]'::jsonb;
    WHEN 'AREA_MANAGER_RIDER' THEN RETURN '["CREATE","UPDATE","APPROVE","VIEW"]'::jsonb;

    WHEN 'PAYMENT_MANAGEMENT' THEN RETURN '["VIEW","UPDATE","APPROVE","REJECT","CANCEL"]'::jsonb;
    ELSE
      RETURN '["VIEW"]'::jsonb;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_dashboard_access_point_allowed_actions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.allowed_actions := public.resolve_dashboard_access_point_actions(
    NEW.access_point_group,
    NEW.allowed_actions
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_access_points_set_actions ON public.dashboard_access_points;

CREATE TRIGGER trg_dashboard_access_points_set_actions
BEFORE INSERT OR UPDATE ON public.dashboard_access_points
FOR EACH ROW
EXECUTE FUNCTION public.set_dashboard_access_point_allowed_actions();

-- =========================
-- 3) Backfill existing data
-- =========================
UPDATE public.dashboard_access_points
SET
  allowed_actions = public.resolve_dashboard_access_point_actions(access_point_group, allowed_actions),
  updated_at = NOW()
WHERE true;
