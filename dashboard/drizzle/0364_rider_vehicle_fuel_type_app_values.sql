-- Align fuel_type with rider app codes: petrol, diesel, cng, electric, hybrid.
-- Legacy DBs used EV / Petrol / Diesel / CNG; the app sends lowercase labels.
--
-- Uses enum REPLACEMENT (not ADD VALUE + UPDATE) so this runs in one Supabase
-- SQL Editor transaction — PostgreSQL error 55P04 otherwise.

DO $$
DECLARE
  v_udt_name TEXT;
  v_has_legacy BOOLEAN;
  v_has_app_only BOOLEAN;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'rider_vehicles'
    AND c.column_name = 'fuel_type';

  IF v_udt_name IS NULL THEN
    RAISE NOTICE 'rider_vehicles.fuel_type column not found — skipping';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_type') THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'fuel_type'
        AND e.enumlabel IN ('Petrol', 'Diesel', 'CNG', 'EV')
    ) INTO v_has_legacy;

    SELECT NOT v_has_legacy AND EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'fuel_type'
        AND e.enumlabel = 'petrol'
    ) INTO v_has_app_only;

    IF v_has_app_only THEN
      RAISE NOTICE 'fuel_type already uses app values — skipping';
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_type_app') THEN
    DROP TYPE fuel_type_app;
  END IF;

  CREATE TYPE fuel_type_app AS ENUM ('petrol', 'diesel', 'cng', 'electric', 'hybrid');

  IF v_udt_name = 'text' THEN
    ALTER TABLE rider_vehicles
      ALTER COLUMN fuel_type TYPE fuel_type_app
      USING (
        CASE
          WHEN fuel_type IS NULL OR trim(fuel_type) = '' THEN NULL
          WHEN lower(trim(fuel_type)) IN ('petrol', 'gasoline') OR fuel_type = 'Petrol'
            THEN 'petrol'::fuel_type_app
          WHEN lower(trim(fuel_type)) = 'diesel' OR fuel_type = 'Diesel'
            THEN 'diesel'::fuel_type_app
          WHEN lower(trim(fuel_type)) = 'cng' OR fuel_type = 'CNG'
            THEN 'cng'::fuel_type_app
          WHEN lower(trim(fuel_type)) IN ('electric', 'ev') OR fuel_type = 'EV'
            THEN 'electric'::fuel_type_app
          WHEN lower(trim(fuel_type)) = 'hybrid'
            THEN 'hybrid'::fuel_type_app
          ELSE NULL
        END
      );
  ELSE
    ALTER TABLE rider_vehicles
      ALTER COLUMN fuel_type TYPE fuel_type_app
      USING (
        CASE fuel_type::text
          WHEN 'Petrol' THEN 'petrol'::fuel_type_app
          WHEN 'Diesel' THEN 'diesel'::fuel_type_app
          WHEN 'CNG' THEN 'cng'::fuel_type_app
          WHEN 'EV' THEN 'electric'::fuel_type_app
          WHEN 'petrol' THEN 'petrol'::fuel_type_app
          WHEN 'diesel' THEN 'diesel'::fuel_type_app
          WHEN 'cng' THEN 'cng'::fuel_type_app
          WHEN 'electric' THEN 'electric'::fuel_type_app
          WHEN 'hybrid' THEN 'hybrid'::fuel_type_app
          ELSE NULL
        END
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_type') THEN
    DROP TYPE fuel_type;
  END IF;

  ALTER TYPE fuel_type_app RENAME TO fuel_type;

  RAISE NOTICE 'fuel_type migrated to app values (petrol, diesel, cng, electric, hybrid)';
END $$;
