-- Align EV onboarding docs with select-vehicle card copy ("Rental or EV proof required").
-- Migration 0362 incorrectly set required_docs to dl+rc while leaving the hint as rental/EV proof.
--
-- I/O-safe / idempotent:
--   • Targeted UPDATE by primary code (3 rows max). No table rewrite, no indexes, no backfill.
--   • statement_timeout budget 15s.

SET statement_timeout = '15s';

UPDATE public.rider_onboarding_vehicle_types
SET
  document_requirements = jsonb_build_object(
    'required_docs', jsonb_build_array('rental_proof', 'ev_proof'),
    'has_own_vehicle', false,
    'requires_max_speed', true
  ),
  hint = 'Rental or EV proof required',
  info_message = CASE code
    WHEN 'ev_bike' THEN 'Upload a rental agreement or EV proof to continue with EV bike onboarding. Driving license is not required for this vehicle.'
    WHEN 'ev_auto' THEN 'Upload a rental agreement or EV proof for EV auto onboarding. Driving license is not required for this vehicle.'
    WHEN 'ev_car_ac' THEN 'Upload a rental agreement or EV proof for EV car onboarding. Driving license is not required for this vehicle.'
    ELSE info_message
  END,
  updated_at = NOW()
WHERE code IN ('ev_bike', 'ev_auto', 'ev_car_ac')
  AND is_active = TRUE;

RESET statement_timeout;
