-- Favorite pin + favorite journey persistence for customer ride/parcel.
-- I/O-safe: IF NOT EXISTS only, no backfill, no table rewrite, no extra hot-table indexes.
-- Recents stay on-device. This table is written only on heart (favorite) toggles.

-- Reuse 0013 table when present (CREATE is a no-op). Do not drop or rebuild it.
CREATE TABLE IF NOT EXISTS public.customer_saved_locations (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  location_type TEXT,
  formatted_address TEXT NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NULL default: catalog-only ADD COLUMN (no rewrite, no scan).
ALTER TABLE public.customer_saved_locations
  ADD COLUMN IF NOT EXISTS lat_key NUMERIC(8, 4);
ALTER TABLE public.customer_saved_locations
  ADD COLUMN IF NOT EXISTS lng_key NUMERIC(8, 4);

-- Upsert key for favorite pins. Empty/NULL keys are unused by the API (no backfill).
CREATE UNIQUE INDEX IF NOT EXISTS customer_saved_locations_customer_coord_uidx
  ON public.customer_saved_locations (customer_id, lat_key, lng_key);

CREATE TABLE IF NOT EXISTS public.customer_saved_journeys (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_kind TEXT NOT NULL CHECK (service_kind IN ('ride', 'parcel')),
  pickup_name TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat NUMERIC(10, 8) NOT NULL,
  pickup_lng NUMERIC(11, 8) NOT NULL,
  drop_name TEXT NOT NULL,
  drop_address TEXT NOT NULL,
  drop_lat NUMERIC(10, 8) NOT NULL,
  drop_lng NUMERIC(11, 8) NOT NULL,
  pickup_lat_key NUMERIC(8, 4) NOT NULL,
  pickup_lng_key NUMERIC(8, 4) NOT NULL,
  drop_lat_key NUMERIC(8, 4) NOT NULL,
  drop_lng_key NUMERIC(8, 4) NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_saved_journeys_coord_uidx
  ON public.customer_saved_journeys (
    customer_id,
    service_kind,
    pickup_lat_key,
    pickup_lng_key,
    drop_lat_key,
    drop_lng_key
  );

COMMENT ON TABLE public.customer_saved_journeys IS
  'Customer favorite pickup→drop pairs for ride/parcel. Written on heart only.';
