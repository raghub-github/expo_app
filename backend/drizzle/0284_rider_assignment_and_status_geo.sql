-- Rider multi-service assignment controls + milestone geo-fence radii (DB-driven).
-- Runtime: rider-assignment-control.ts, rider-status-geo-fence.ts (no hardcoded distances).

-- ---------------------------------------------------------------------------
-- 1) Rider assignment control (singleton active row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_assignment_control_settings (
  id integer PRIMARY KEY DEFAULT 1,
  max_active_assignments integer NOT NULL DEFAULT 1,
  allow_cross_service_assignments boolean NOT NULL DEFAULT false,
  allow_multiple_food_orders boolean NOT NULL DEFAULT false,
  allow_multiple_parcel_orders boolean NOT NULL DEFAULT false,
  allow_multiple_person_rides boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_assignment_control_settings_singleton CHECK (id = 1),
  CONSTRAINT rider_assignment_control_settings_max_assignments_check
    CHECK (max_active_assignments >= 1 AND max_active_assignments <= 10)
);

COMMENT ON TABLE public.rider_assignment_control_settings IS
  'Super Admin: max concurrent rider assignments and per-service stacking / cross-service rules.';

INSERT INTO public.rider_assignment_control_settings (
  id,
  max_active_assignments,
  allow_cross_service_assignments,
  allow_multiple_food_orders,
  allow_multiple_parcel_orders,
  allow_multiple_person_rides,
  is_active
)
VALUES (1, 1, false, false, false, false, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rider_assignment_control_settings_audit (
  id bigserial PRIMARY KEY,
  settings_id integer NOT NULL REFERENCES public.rider_assignment_control_settings(id) ON DELETE CASCADE,
  max_active_assignments integer NOT NULL,
  allow_cross_service_assignments boolean NOT NULL,
  allow_multiple_food_orders boolean NOT NULL,
  allow_multiple_parcel_orders boolean NOT NULL,
  allow_multiple_person_rides boolean NOT NULL,
  is_active boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  changed_by_dashboard_user_id text,
  change_source text NOT NULL DEFAULT 'dashboard'
);

CREATE INDEX IF NOT EXISTS rider_assignment_control_settings_audit_changed_at_idx
  ON public.rider_assignment_control_settings_audit (changed_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Milestone geo-fence radius rules (per service + milestone)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_rider_status_radius_rules (
  id bigserial PRIMARY KEY,
  service_type text NOT NULL,
  milestone_key text NOT NULL,
  radius_meters integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_rider_status_radius_rules_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_status_radius_rules_milestone_check
    CHECK (
      (service_type = 'food' AND milestone_key IN (
        'reach_store', 'mark_picked_up', 'reach_customer', 'mark_delivered'
      ))
      OR (service_type = 'parcel' AND milestone_key IN (
        'reach_pickup', 'pickup_confirmation', 'reach_drop', 'delivery_confirmation'
      ))
      OR (service_type = 'person_ride' AND milestone_key IN (
        'reach_pickup', 'pickup_confirmation', 'start_ride', 'reach_destination', 'complete_ride'
      ))
    ),
  CONSTRAINT platform_rider_status_radius_rules_meters_check
    CHECK (radius_meters > 0 AND radius_meters <= 5000)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_rider_status_radius_rules_service_milestone_uidx
  ON public.platform_rider_status_radius_rules (service_type, milestone_key);

CREATE INDEX IF NOT EXISTS platform_rider_status_radius_rules_active_idx
  ON public.platform_rider_status_radius_rules (service_type, milestone_key)
  WHERE is_active = true;

COMMENT ON TABLE public.platform_rider_status_radius_rules IS
  'Max distance (meters) from rider GPS to target point before a milestone status update is allowed.';

CREATE TABLE IF NOT EXISTS public.platform_rider_status_radius_rules_audit (
  id bigserial PRIMARY KEY,
  rule_id bigint NOT NULL REFERENCES public.platform_rider_status_radius_rules(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  milestone_key text NOT NULL,
  radius_meters integer NOT NULL,
  is_active boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  changed_by_dashboard_user_id text,
  change_source text NOT NULL DEFAULT 'dashboard'
);

CREATE INDEX IF NOT EXISTS platform_rider_status_radius_rules_audit_changed_at_idx
  ON public.platform_rider_status_radius_rules_audit (changed_at DESC);

-- Default milestone radii (meters)
INSERT INTO public.platform_rider_status_radius_rules (service_type, milestone_key, radius_meters)
VALUES
  ('food', 'reach_store', 500),
  ('food', 'mark_picked_up', 300),
  ('food', 'reach_customer', 200),
  ('food', 'mark_delivered', 150),
  ('parcel', 'reach_pickup', 500),
  ('parcel', 'pickup_confirmation', 300),
  ('parcel', 'reach_drop', 200),
  ('parcel', 'delivery_confirmation', 150),
  ('person_ride', 'reach_pickup', 500),
  ('person_ride', 'pickup_confirmation', 300),
  ('person_ride', 'start_ride', 300),
  ('person_ride', 'reach_destination', 200),
  ('person_ride', 'complete_ride', 150)
ON CONFLICT (service_type, milestone_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS rider_assignment_control_settings_touch
  ON public.rider_assignment_control_settings;
CREATE TRIGGER rider_assignment_control_settings_touch
BEFORE UPDATE ON public.rider_assignment_control_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION audit_rider_assignment_control_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.rider_assignment_control_settings_audit (
    settings_id,
    max_active_assignments,
    allow_cross_service_assignments,
    allow_multiple_food_orders,
    allow_multiple_parcel_orders,
    allow_multiple_person_rides,
    is_active,
    changed_by_dashboard_user_id,
    change_source
  )
  VALUES (
    NEW.id,
    NEW.max_active_assignments,
    NEW.allow_cross_service_assignments,
    NEW.allow_multiple_food_orders,
    NEW.allow_multiple_parcel_orders,
    NEW.allow_multiple_person_rides,
    NEW.is_active,
    NULLIF(current_setting('app.dashboard_user_id', true), ''),
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'dashboard')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_assignment_control_settings_audit_trigger
  ON public.rider_assignment_control_settings;
CREATE TRIGGER rider_assignment_control_settings_audit_trigger
AFTER INSERT OR UPDATE ON public.rider_assignment_control_settings
FOR EACH ROW EXECUTE FUNCTION audit_rider_assignment_control_settings();

DROP TRIGGER IF EXISTS platform_rider_status_radius_rules_touch
  ON public.platform_rider_status_radius_rules;
CREATE TRIGGER platform_rider_status_radius_rules_touch
BEFORE UPDATE ON public.platform_rider_status_radius_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION audit_platform_rider_status_radius_rules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.platform_rider_status_radius_rules_audit (
    rule_id,
    service_type,
    milestone_key,
    radius_meters,
    is_active,
    changed_by_dashboard_user_id,
    change_source
  )
  VALUES (
    NEW.id,
    NEW.service_type,
    NEW.milestone_key,
    NEW.radius_meters,
    NEW.is_active,
    NULLIF(current_setting('app.dashboard_user_id', true), ''),
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'dashboard')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_rider_status_radius_rules_audit_trigger
  ON public.platform_rider_status_radius_rules;
CREATE TRIGGER platform_rider_status_radius_rules_audit_trigger
AFTER INSERT OR UPDATE ON public.platform_rider_status_radius_rules
FOR EACH ROW EXECUTE FUNCTION audit_platform_rider_status_radius_rules();
