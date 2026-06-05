-- Dispatch expansion waves + session tracking (pickup-radius expansion only; never drop distance).
-- Wave 1 always uses platform_rider_dispatch_pickup_radius; waves 2+ use expansion rows below.

CREATE TABLE IF NOT EXISTS public.platform_rider_dispatch_wave_settings (
  service_type TEXT PRIMARY KEY,
  wave_interval_seconds INTEGER NOT NULL,
  max_waves INTEGER NOT NULL,
  max_dispatch_radius_meters INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_rider_dispatch_wave_settings_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_dispatch_wave_settings_interval_check
    CHECK (wave_interval_seconds >= 5 AND wave_interval_seconds <= 600),
  CONSTRAINT platform_rider_dispatch_wave_settings_max_waves_check
    CHECK (max_waves >= 1 AND max_waves <= 10),
  CONSTRAINT platform_rider_dispatch_wave_settings_max_radius_check
    CHECK (max_dispatch_radius_meters > 0 AND max_dispatch_radius_meters <= 50000)
);

COMMENT ON TABLE public.platform_rider_dispatch_wave_settings IS
  'Per-service dispatch wave timing and max search radius (pickup point only).';

CREATE TABLE IF NOT EXISTS public.platform_rider_dispatch_wave_expansion (
  service_type TEXT NOT NULL,
  wave_number INTEGER NOT NULL,
  effective_radius_meters INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_type, wave_number),
  CONSTRAINT platform_rider_dispatch_wave_expansion_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_dispatch_wave_expansion_wave_check
    CHECK (wave_number >= 2 AND wave_number <= 10),
  CONSTRAINT platform_rider_dispatch_wave_expansion_radius_check
    CHECK (effective_radius_meters > 0 AND effective_radius_meters <= 50000)
);

COMMENT ON TABLE public.platform_rider_dispatch_wave_expansion IS
  'Absolute effective pickup-radius (meters) for dispatch waves 2+. Must exceed wave-1 base radius.';

CREATE TABLE IF NOT EXISTS public.order_dispatch_sessions (
  id BIGSERIAL PRIMARY KEY,
  order_core_id INTEGER NOT NULL UNIQUE REFERENCES orders_core(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  current_wave INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  last_wave_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_wave_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_dispatch_sessions_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT order_dispatch_sessions_status_check
    CHECK (status IN ('active', 'accepted', 'expired', 'cancelled')),
  CONSTRAINT order_dispatch_sessions_wave_check
    CHECK (current_wave >= 1 AND current_wave <= 10)
);

CREATE INDEX IF NOT EXISTS order_dispatch_sessions_status_next_wave_idx
  ON public.order_dispatch_sessions (status, next_wave_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS order_dispatch_sessions_order_id_idx
  ON public.order_dispatch_sessions (order_id);

COMMENT ON TABLE public.order_dispatch_sessions IS
  'Active dispatch search for an unassigned order; drives wave expansion and notification audit.';

CREATE TABLE IF NOT EXISTS public.order_dispatch_rider_notifications (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES order_dispatch_sessions(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  wave_number INTEGER NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_dispatch_rider_notifications_unique UNIQUE (session_id, rider_id)
);

CREATE INDEX IF NOT EXISTS order_dispatch_rider_notifications_session_idx
  ON public.order_dispatch_rider_notifications (session_id);

-- Defaults: wave 1 = base pickup radius; expansions are absolute effective radii for waves 2+.
INSERT INTO public.platform_rider_dispatch_wave_settings
  (service_type, wave_interval_seconds, max_waves, max_dispatch_radius_meters, enabled)
VALUES
  ('food', 45, 3, 8000, TRUE),
  ('parcel', 45, 3, 8000, TRUE),
  ('person_ride', 30, 4, 30000, TRUE)
ON CONFLICT (service_type) DO NOTHING;

INSERT INTO public.platform_rider_dispatch_wave_expansion
  (service_type, wave_number, effective_radius_meters)
VALUES
  ('food', 2, 5000),
  ('food', 3, 8000),
  ('parcel', 2, 5000),
  ('parcel', 3, 8000),
  ('person_ride', 2, 20000),
  ('person_ride', 3, 25000),
  ('person_ride', 4, 30000)
ON CONFLICT (service_type, wave_number) DO NOTHING;

DROP TRIGGER IF EXISTS platform_rider_dispatch_wave_settings_touch
  ON public.platform_rider_dispatch_wave_settings;
CREATE TRIGGER platform_rider_dispatch_wave_settings_touch
BEFORE UPDATE ON public.platform_rider_dispatch_wave_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS platform_rider_dispatch_wave_expansion_touch
  ON public.platform_rider_dispatch_wave_expansion;
CREATE TRIGGER platform_rider_dispatch_wave_expansion_touch
BEFORE UPDATE ON public.platform_rider_dispatch_wave_expansion
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_dispatch_sessions_touch
  ON public.order_dispatch_sessions;
CREATE TRIGGER order_dispatch_sessions_touch
BEFORE UPDATE ON public.order_dispatch_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
