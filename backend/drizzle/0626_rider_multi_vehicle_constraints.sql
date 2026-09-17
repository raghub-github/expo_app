-- Multi-vehicle garage: unique RC per rider (normalized), max 2 live vehicles,
-- and assignment audit of the vehicle that was active when the order was accepted.

SET statement_timeout = '15s';

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS vehicle_id bigint;

CREATE INDEX IF NOT EXISTS order_rider_assignments_vehicle_id_idx
  ON public.order_rider_assignments (vehicle_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_rider_assignments_vehicle_id_fkey'
  ) THEN
    ALTER TABLE public.order_rider_assignments
      ADD CONSTRAINT order_rider_assignments_vehicle_id_fkey
      FOREIGN KEY (vehicle_id) REFERENCES public.rider_vehicles (id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.order_rider_assignments.vehicle_id IS
  'rider_vehicles.id that was active when this assignment was created. Does not change if the rider later switches vehicles.';

-- Unique normalized registration per rider among live (non-deleted, non-retired) vehicles.
CREATE UNIQUE INDEX IF NOT EXISTS rider_vehicles_rider_norm_reg_uidx
  ON public.rider_vehicles (
    rider_id,
    (upper(regexp_replace(coalesce(registration_number, ''), '[^A-Za-z0-9]', '', 'g')))
  )
  WHERE deleted_at IS NULL
    AND COALESCE(vehicle_active_status, 'active') <> 'retired';

CREATE OR REPLACE FUNCTION public.rider_vehicles_enforce_max_two()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  live_count integer;
BEGIN
  SELECT COUNT(*)::int INTO live_count
  FROM public.rider_vehicles
  WHERE rider_id = NEW.rider_id
    AND deleted_at IS NULL
    AND COALESCE(vehicle_active_status, 'active') <> 'retired';
  IF live_count > 2 THEN
    RAISE EXCEPTION 'MAX_VEHICLES'
      USING ERRCODE = 'P0001',
            HINT = 'A rider may have at most two live vehicles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rider_vehicles_max_two ON public.rider_vehicles;
CREATE TRIGGER trg_rider_vehicles_max_two
  AFTER INSERT OR UPDATE OF rider_id, deleted_at, vehicle_active_status
  ON public.rider_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.rider_vehicles_enforce_max_two();

RESET statement_timeout;
