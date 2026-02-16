-- Area Manager Dashboard System (aligned with system_users, merchant_stores, riders)
-- area_managers: one row per Area Manager (created automatically by app when system_user with AREA_MANAGER_MERCHANT/AREA_MANAGER_RIDER is created)
-- merchant_stores: add area_manager_id
-- riders: add area_manager_id, locality_code, availability_status (Rider AM scope by riders.city = area_managers.city)
-- activity_logs

-- Enums
DO $$ BEGIN
  CREATE TYPE public.area_manager_type AS ENUM ('MERCHANT', 'RIDER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.area_manager_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.rider_availability_status AS ENUM ('ONLINE', 'BUSY', 'OFFLINE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- area_managers (linked to system_users; app inserts row when super admin/admin creates user with AREA_MANAGER_* role)
CREATE TABLE IF NOT EXISTS public.area_managers (
  id BIGSERIAL NOT NULL,
  user_id INTEGER NOT NULL,
  manager_type public.area_manager_type NOT NULL,
  area_code TEXT NULL,
  locality_code TEXT NULL,
  city TEXT NULL,
  status public.area_manager_status NOT NULL DEFAULT 'ACTIVE'::public.area_manager_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT area_managers_pkey PRIMARY KEY (id),
  CONSTRAINT area_managers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.system_users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Add city if table existed from an older migration without it (Rider AM scope by riders.city)
ALTER TABLE public.area_managers ADD COLUMN IF NOT EXISTS city TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS area_managers_user_id_idx ON public.area_managers USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS area_managers_manager_type_idx ON public.area_managers USING btree (manager_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS area_managers_area_code_idx ON public.area_managers USING btree (area_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS area_managers_locality_code_idx ON public.area_managers USING btree (locality_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS area_managers_city_idx ON public.area_managers USING btree (city) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS area_managers_status_idx ON public.area_managers USING btree (status) TABLESPACE pg_default;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'area_managers' AND t.tgname = 'area_managers_updated_at_trigger') THEN
    CREATE TRIGGER area_managers_updated_at_trigger
      BEFORE UPDATE ON public.area_managers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- merchant_stores: add area_manager_id
ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS area_manager_id BIGINT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_merchant_stores_area_manager'
  ) THEN
    ALTER TABLE public.merchant_stores
      ADD CONSTRAINT fk_merchant_stores_area_manager
      FOREIGN KEY (area_manager_id) REFERENCES public.area_managers(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS merchant_stores_area_manager_id_idx ON public.merchant_stores USING btree (area_manager_id) TABLESPACE pg_default WHERE area_manager_id IS NOT NULL;

-- merchant_parents: add area_manager_id (and optional created_by_name for area manager name when AM creates parent)
ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS area_manager_id BIGINT NULL;
ALTER TABLE public.merchant_parents ADD COLUMN IF NOT EXISTS created_by_name TEXT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_merchant_parents_area_manager') THEN
    ALTER TABLE public.merchant_parents
      ADD CONSTRAINT fk_merchant_parents_area_manager
      FOREIGN KEY (area_manager_id) REFERENCES public.area_managers(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS merchant_parents_area_manager_id_idx ON public.merchant_parents USING btree (area_manager_id) TABLESPACE pg_default WHERE area_manager_id IS NOT NULL;

-- riders: add area_manager_id, locality_code, availability_status
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS area_manager_id INTEGER NULL;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS locality_code TEXT NULL;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS availability_status public.rider_availability_status NOT NULL DEFAULT 'OFFLINE'::public.rider_availability_status;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rider_area_manager') THEN
    ALTER TABLE public.riders
      ADD CONSTRAINT fk_rider_area_manager
      FOREIGN KEY (area_manager_id) REFERENCES public.area_managers(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS riders_area_manager_id_idx ON public.riders USING btree (area_manager_id) TABLESPACE pg_default WHERE area_manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS riders_locality_code_idx ON public.riders USING btree (locality_code) TABLESPACE pg_default WHERE locality_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS riders_availability_status_idx ON public.riders USING btree (availability_status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS riders_city_idx ON public.riders USING btree (city) TABLESPACE pg_default WHERE city IS NOT NULL;

-- activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL NOT NULL,
  actor_id INTEGER NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.system_users(id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx ON public.activity_logs USING btree (actor_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS activity_logs_entity_type_idx ON public.activity_logs USING btree (entity_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS activity_logs_entity_id_idx ON public.activity_logs USING btree (entity_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs USING btree (created_at) TABLESPACE pg_default;
