-- Service-based active assignment limits (replaces global max in rider_assignment_control_settings).
-- Runtime: rider-assignment-control.ts — no hardcoded limits.

-- ---------------------------------------------------------------------------
-- Per-service limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_service_assignment_limits (
  id bigserial PRIMARY KEY,
  service_type text NOT NULL,
  max_active_assignments integer NOT NULL,
  exclusive_mode boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_service_assignment_limits_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_service_assignment_limits_max_check
    CHECK (max_active_assignments >= 1 AND max_active_assignments <= 10),
  CONSTRAINT platform_service_assignment_limits_service_unique UNIQUE (service_type)
);

CREATE INDEX IF NOT EXISTS platform_service_assignment_limits_active_idx
  ON public.platform_service_assignment_limits (service_type)
  WHERE is_active = true;

COMMENT ON TABLE public.platform_service_assignment_limits IS
  'Super Admin: max concurrent active assignments per service (food / parcel / person_ride).';

INSERT INTO public.platform_service_assignment_limits (
  service_type, max_active_assignments, exclusive_mode, is_active
)
VALUES
  ('food', 2, false, true),
  ('parcel', 2, false, true),
  ('person_ride', 1, true, true)
ON CONFLICT (service_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_service_assignment_limits_audit (
  id bigserial PRIMARY KEY,
  limit_id bigint NOT NULL REFERENCES public.platform_service_assignment_limits(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  max_active_assignments integer NOT NULL,
  exclusive_mode boolean NOT NULL,
  is_active boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  changed_by_dashboard_user_id text,
  change_source text NOT NULL DEFAULT 'dashboard'
);

CREATE INDEX IF NOT EXISTS platform_service_assignment_limits_audit_changed_at_idx
  ON public.platform_service_assignment_limits_audit (changed_at DESC);

-- ---------------------------------------------------------------------------
-- Global dispatch assignment settings (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_dispatch_assignment_settings (
  id integer PRIMARY KEY DEFAULT 1,
  allow_cross_service_assignments boolean NOT NULL DEFAULT false,
  person_ride_exclusive_mode boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_dispatch_assignment_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.platform_dispatch_assignment_settings IS
  'Super Admin: cross-service stacking and person-ride exclusivity toggle.';

INSERT INTO public.platform_dispatch_assignment_settings (
  id,
  allow_cross_service_assignments,
  person_ride_exclusive_mode,
  is_active
)
VALUES (1, false, true, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_dispatch_assignment_settings_audit (
  id bigserial PRIMARY KEY,
  settings_id integer NOT NULL REFERENCES public.platform_dispatch_assignment_settings(id) ON DELETE CASCADE,
  allow_cross_service_assignments boolean NOT NULL,
  person_ride_exclusive_mode boolean NOT NULL,
  is_active boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  changed_by_dashboard_user_id text,
  change_source text NOT NULL DEFAULT 'dashboard'
);

-- ---------------------------------------------------------------------------
-- Eligibility audit (dispatch offer / accept checks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_dispatch_eligibility_audit (
  id bigserial PRIMARY KEY,
  order_core_id bigint REFERENCES public.orders_core(id) ON DELETE SET NULL,
  order_id text,
  rider_id bigint NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  active_food_orders integer NOT NULL DEFAULT 0,
  active_parcel_orders integer NOT NULL DEFAULT 0,
  active_person_rides integer NOT NULL DEFAULT 0,
  assignment_limit_used integer,
  cross_service_rule_applied boolean NOT NULL DEFAULT false,
  person_ride_exclusive_applied boolean NOT NULL DEFAULT false,
  eligibility_result text NOT NULL,
  block_reason text,
  event_context text NOT NULL DEFAULT 'dispatch_offer',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_dispatch_eligibility_audit_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_dispatch_eligibility_audit_result_check
    CHECK (eligibility_result IN ('eligible', 'blocked'))
);

CREATE INDEX IF NOT EXISTS rider_dispatch_eligibility_audit_rider_created_idx
  ON public.rider_dispatch_eligibility_audit (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rider_dispatch_eligibility_audit_order_created_idx
  ON public.rider_dispatch_eligibility_audit (order_core_id, created_at DESC)
  WHERE order_core_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS platform_service_assignment_limits_touch
  ON public.platform_service_assignment_limits;
CREATE TRIGGER platform_service_assignment_limits_touch
BEFORE UPDATE ON public.platform_service_assignment_limits
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION audit_platform_service_assignment_limits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.platform_service_assignment_limits_audit (
    limit_id, service_type, max_active_assignments, exclusive_mode, is_active,
    changed_by_dashboard_user_id, change_source
  )
  VALUES (
    NEW.id, NEW.service_type, NEW.max_active_assignments, NEW.exclusive_mode, NEW.is_active,
    NULLIF(current_setting('app.dashboard_user_id', true), ''),
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'dashboard')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_service_assignment_limits_audit_trigger
  ON public.platform_service_assignment_limits;
CREATE TRIGGER platform_service_assignment_limits_audit_trigger
AFTER INSERT OR UPDATE ON public.platform_service_assignment_limits
FOR EACH ROW EXECUTE FUNCTION audit_platform_service_assignment_limits();

DROP TRIGGER IF EXISTS platform_dispatch_assignment_settings_touch
  ON public.platform_dispatch_assignment_settings;
CREATE TRIGGER platform_dispatch_assignment_settings_touch
BEFORE UPDATE ON public.platform_dispatch_assignment_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION audit_platform_dispatch_assignment_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.platform_dispatch_assignment_settings_audit (
    settings_id, allow_cross_service_assignments, person_ride_exclusive_mode, is_active,
    changed_by_dashboard_user_id, change_source
  )
  VALUES (
    NEW.id, NEW.allow_cross_service_assignments, NEW.person_ride_exclusive_mode, NEW.is_active,
    NULLIF(current_setting('app.dashboard_user_id', true), ''),
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'dashboard')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_dispatch_assignment_settings_audit_trigger
  ON public.platform_dispatch_assignment_settings;
CREATE TRIGGER platform_dispatch_assignment_settings_audit_trigger
AFTER INSERT OR UPDATE ON public.platform_dispatch_assignment_settings
FOR EACH ROW EXECUTE FUNCTION audit_platform_dispatch_assignment_settings();

-- Extend dispatch assignment audit event types
ALTER TABLE public.order_rider_dispatch_assignment_audit
  DROP CONSTRAINT IF EXISTS order_rider_dispatch_assignment_audit_event_check;

ALTER TABLE public.order_rider_dispatch_assignment_audit
  ADD CONSTRAINT order_rider_dispatch_assignment_audit_event_check
  CHECK (event_type IN (
    'offer_sent',
    'offer_viewed',
    'accepted',
    'rejected',
    'assigned',
    'unassigned',
    'timeout',
    'cancelled',
    'removed',
    'eligibility_checked'
  ));
