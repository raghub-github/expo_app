-- Rollback 0641: restore the food post slabs to vehicle_type='2_wheeler' (dead for food) and
-- reactivate the 2-wheeler 0–2 km row.
UPDATE public.rider_leg_pricing
SET vehicle_type = '2_wheeler', updated_at = now()
WHERE leg = 'post' AND service_type = 'food' AND vehicle_type IS NULL AND min_km > 0;

UPDATE public.rider_leg_pricing
SET is_active = true, updated_at = now()
WHERE leg = 'post' AND service_type = 'food' AND vehicle_type = '2_wheeler' AND min_km = 0;
