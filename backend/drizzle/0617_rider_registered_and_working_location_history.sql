-- 0617: Separate Registered Address vs Working Location + working-location history.
-- Idempotent / production-safe: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
-- No full-table rewrite. Soft backfill only where registered_* is still NULL.

-- A) Registered address (permanent snapshot — not overwritten by working-location updates).
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS registered_city text,
  ADD COLUMN IF NOT EXISTS registered_state text,
  ADD COLUMN IF NOT EXISTS registered_region text,
  ADD COLUMN IF NOT EXISTS registered_district text,
  ADD COLUMN IF NOT EXISTS registered_pincode text,
  ADD COLUMN IF NOT EXISTS registered_address text,
  ADD COLUMN IF NOT EXISTS registered_lat double precision,
  ADD COLUMN IF NOT EXISTS registered_lon double precision,
  ADD COLUMN IF NOT EXISTS registered_state_id uuid,
  ADD COLUMN IF NOT EXISTS registered_region_id uuid,
  ADD COLUMN IF NOT EXISTS registered_district_id uuid;

COMMENT ON COLUMN public.riders.registered_state IS
  'Permanent registered address state. Independent of current working location.';
COMMENT ON COLUMN public.riders.state IS
  'Current working location state (may change). See rider_working_location_history for past values.';

-- Soft backfill: one-time snapshot of existing location into registered_* when empty.
-- Existing riders.state/district/... are the onboarding work location — preserve as registered
-- baseline so future working-location changes do not erase the original account address.
UPDATE public.riders
SET
  registered_city = city,
  registered_state = state,
  registered_region = region,
  registered_district = district,
  registered_pincode = pincode,
  registered_address = address,
  registered_lat = lat,
  registered_lon = lon,
  registered_state_id = state_id,
  registered_region_id = region_id,
  registered_district_id = district_id
WHERE registered_state IS NULL
  AND state IS NOT NULL
  AND btrim(state) <> '';

-- B) Working location history (append-only snapshots).
CREATE TABLE IF NOT EXISTS public.rider_working_location_history (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  state text,
  region text,
  district text,
  city text,
  pincode text,
  address text,
  state_id uuid,
  region_id uuid,
  district_id uuid,
  lat double precision,
  lon double precision,
  source text,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rider_working_location_history_source_check'
      AND conrelid = 'public.rider_working_location_history'::regclass
  ) THEN
    ALTER TABLE public.rider_working_location_history
      ADD CONSTRAINT rider_working_location_history_source_check
      CHECK (
        source IS NULL
        OR source IN ('gps_auto', 'manual_select', 'manual_other', 'system_backfill', 'duty_update')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rider_working_location_history_rider_changed_idx
  ON public.rider_working_location_history (rider_id, changed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS rider_working_location_history_current_uq
  ON public.rider_working_location_history (rider_id)
  WHERE is_current;

COMMENT ON TABLE public.rider_working_location_history IS
  'Append-only working location changes. riders.* columns hold the current working location; this table keeps prior snapshots.';

-- Seed one current history row for riders that already have a working location and no history yet.
INSERT INTO public.rider_working_location_history (
  rider_id, state, region, district, city, pincode, address,
  state_id, region_id, district_id, lat, lon, source, is_current, changed_at
)
SELECT
  r.id,
  r.state,
  r.region,
  r.district,
  r.city,
  r.pincode,
  r.address,
  r.state_id,
  r.region_id,
  r.district_id,
  r.lat,
  r.lon,
  COALESCE(r.location_source, 'system_backfill'),
  TRUE,
  COALESCE(r.updated_at, NOW())
FROM public.riders r
WHERE r.state IS NOT NULL
  AND btrim(r.state) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.rider_working_location_history h WHERE h.rider_id = r.id
  );
