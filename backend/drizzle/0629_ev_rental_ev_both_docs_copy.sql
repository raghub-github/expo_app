-- Sync EV card copy with 2-step wizard (rental agreement + EV proof, both required).
-- I/O-safe: targeted UPDATE of 3 rows; statement_timeout 15s.

SET statement_timeout = '15s';

UPDATE public.rider_onboarding_vehicle_types
SET
  hint = 'Rental & EV proof required',
  info_message = CASE code
    WHEN 'ev_bike' THEN 'Upload your rental agreement and EV proof (photo or PDF, max 5 MB). Driving license is not required for this vehicle.'
    WHEN 'ev_auto' THEN 'Upload your rental agreement and EV proof (photo or PDF, max 5 MB). Driving license is not required for this vehicle.'
    WHEN 'ev_car_ac' THEN 'Upload your rental agreement and EV proof (photo or PDF, max 5 MB). Driving license is not required for this vehicle.'
    ELSE info_message
  END,
  updated_at = NOW()
WHERE code IN ('ev_bike', 'ev_auto', 'ev_car_ac')
  AND is_active = TRUE;

RESET statement_timeout;
