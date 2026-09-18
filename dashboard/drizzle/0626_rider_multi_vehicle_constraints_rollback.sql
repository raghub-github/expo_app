DROP TRIGGER IF EXISTS trg_rider_vehicles_max_two ON public.rider_vehicles;
DROP FUNCTION IF EXISTS public.rider_vehicles_enforce_max_two();
DROP INDEX IF EXISTS public.rider_vehicles_rider_norm_reg_uidx;

ALTER TABLE public.order_rider_assignments
  DROP CONSTRAINT IF EXISTS order_rider_assignments_vehicle_id_fkey;
DROP INDEX IF EXISTS public.order_rider_assignments_vehicle_id_idx;
ALTER TABLE public.order_rider_assignments
  DROP COLUMN IF EXISTS vehicle_id;
