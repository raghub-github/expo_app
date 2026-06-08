-- Super Admin: food pickup verification method toggles (barcode / OTP).
CREATE TABLE IF NOT EXISTS public.platform_food_pickup_verification_settings (
  id integer PRIMARY KEY DEFAULT 1,
  barcode_verification_enabled boolean NOT NULL DEFAULT true,
  otp_verification_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_food_pickup_verification_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.platform_food_pickup_verification_settings IS
  'Super Admin: rider food pickup verification — barcode scan and/or OTP; both off = direct pickup on slide.';

INSERT INTO public.platform_food_pickup_verification_settings (
  id,
  barcode_verification_enabled,
  otp_verification_enabled,
  is_active
)
VALUES (1, true, true, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_food_pickup_verification_settings_audit (
  id bigserial PRIMARY KEY,
  settings_id integer NOT NULL REFERENCES public.platform_food_pickup_verification_settings(id) ON DELETE CASCADE,
  barcode_verification_enabled boolean NOT NULL,
  otp_verification_enabled boolean NOT NULL,
  is_active boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW(),
  changed_by_dashboard_user_id text,
  change_source text NOT NULL DEFAULT 'dashboard'
);

CREATE OR REPLACE FUNCTION touch_platform_food_pickup_verification_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_food_pickup_verification_settings_touch
  ON public.platform_food_pickup_verification_settings;
CREATE TRIGGER platform_food_pickup_verification_settings_touch
BEFORE UPDATE ON public.platform_food_pickup_verification_settings
FOR EACH ROW EXECUTE FUNCTION touch_platform_food_pickup_verification_settings();
