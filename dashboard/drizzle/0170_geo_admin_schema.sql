-- Geo Super Admin: service flags, M2M pincode↔post office, pricing rules, indexes.
-- Assumes public.states, regions, districts, divisions, post_offices, pincodes exist (India Post import).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Service + override flags (override = admin explicitly set; inherited shown in API via comparison)
-- ---------------------------------------------------------------------------
ALTER TABLE states ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE states ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE states ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE states ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE states ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE states ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE states ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE districts ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE post_offices ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS is_food_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS is_parcel_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS is_ride_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS food_override boolean NOT NULL DEFAULT false;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS parcel_override boolean NOT NULL DEFAULT false;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS ride_override boolean NOT NULL DEFAULT false;
ALTER TABLE pincodes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Many-to-many: pincode ↔ post_office
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pincode_post_offices (
  pincode_id uuid NOT NULL REFERENCES pincodes(id) ON DELETE CASCADE,
  post_office_id uuid NOT NULL REFERENCES post_offices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pincode_id, post_office_id)
);

CREATE INDEX IF NOT EXISTS pincode_post_offices_post_office_id_idx ON pincode_post_offices (post_office_id);

DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pincodes' AND column_name = 'post_office_id'
  ) THEN
    INSERT INTO pincode_post_offices (pincode_id, post_office_id)
    SELECT p.id, p.post_office_id
    FROM pincodes p
    WHERE p.post_office_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    FOR r IN
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND t.relname = 'pincodes'
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE '%post_office%'
    LOOP
      EXECUTE format('ALTER TABLE pincodes DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    ALTER TABLE pincodes DROP COLUMN post_office_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Geo pricing (separate from billing_pricing_rules)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE geo_pricing_level AS ENUM (
    'state', 'region', 'district', 'division', 'post_office', 'pincode'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE geo_service AS ENUM ('food', 'parcel', 'ride');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS geo_service_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level geo_pricing_level NOT NULL,
  ref_id uuid NOT NULL,
  service geo_service NOT NULL,
  rule_type text NOT NULL,
  value_numeric numeric,
  value_json jsonb,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_service_pricing_rules_lookup_idx
  ON geo_service_pricing_rules (service, level, ref_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS geo_service_pricing_rules_priority_idx
  ON geo_service_pricing_rules (ref_id, priority);

-- ---------------------------------------------------------------------------
-- Search / filter indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS pincodes_pincode_idx ON pincodes (pincode);
CREATE INDEX IF NOT EXISTS pincodes_food_idx ON pincodes (is_food_enabled) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS pincodes_parcel_idx ON pincodes (is_parcel_enabled) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS pincodes_ride_idx ON pincodes (is_ride_enabled) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS states_name_lower_trgm_idx ON states USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS regions_name_lower_trgm_idx ON regions USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS districts_name_lower_trgm_idx ON districts USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS divisions_name_lower_trgm_idx ON divisions USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS post_offices_name_lower_trgm_idx ON post_offices USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pincodes_pincode_trgm_idx ON pincodes USING gin (pincode gin_trgm_ops);

CREATE INDEX IF NOT EXISTS regions_state_id_idx ON regions (state_id);
CREATE INDEX IF NOT EXISTS districts_region_id_idx ON districts (region_id);
CREATE INDEX IF NOT EXISTS divisions_district_id_idx ON divisions (district_id);
CREATE INDEX IF NOT EXISTS post_offices_division_id_idx ON post_offices (division_id);

-- Support ON CONFLICT for geo_upsert_location (safe if already present)
CREATE UNIQUE INDEX IF NOT EXISTS regions_state_id_name_uidx ON regions (state_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS districts_region_id_name_uidx ON districts (region_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS divisions_district_id_name_uidx ON divisions (district_id, name);
